const SERVER_URL = "wss://project-game-production-ea26.up.railway.app";
let socket;

let AppState = {
    user: null, 
    isLoggedIn: false,
    isGuest: false,
    isGameActive: false,
    currentRound: 1, // Hanya untuk tampilan UI, di-set oleh server
    maxRounds: 5,
    // Semua state skor/combo dihapus, akan datang dari server
};

const els = {};

// --- LEVEL & XP CONFIG (Masih dipakai untuk UI Profile, data datang dari server saat login) ---
const LEVEL_TABLE = [
    [1, 0], [2, 200], [3, 600], [4, 1100], [5, 1700],
    [6, 2500], [7, 3500], [8, 4700], [9, 6200], [10, 8000],
    [11, 10100], [12, 12500], [13, 15200], [14, 18200], [15, 21500],
    [16, 25100], [17, 29000], [18, 33200], [19, 37700], [20, 45000]
];

function getLevelData(totalXP) {
    let currentLevel = 1; let nextXP = 0; let currentLevelXP = 0;
    for (let i = 0; i < LEVEL_TABLE.length; i++) {
        if (totalXP >= LEVEL_TABLE[i][1]) {
            currentLevel = LEVEL_TABLE[i][0]; currentLevelXP = LEVEL_TABLE[i][1];
            nextXP = (i + 1 < LEVEL_TABLE.length) ? LEVEL_TABLE[i+1][1] : LEVEL_TABLE[i][1];
        } else break;
    }
    let progressXP = totalXP - currentLevelXP;
    let neededXP = nextXP - currentLevelXP;
    if (neededXP <= 0) neededXP = 1;
    return { level: currentLevel, progressXP, neededXP, progressPercent: (progressXP / neededXP) * 100 };
}

function initDOM() {
    // Inisialisasi DOM Elements (Sama seperti sebelumnya)
    if(document.getElementById('login-screen')) {
        els.login = document.getElementById('login-screen');
        els.lobby = document.getElementById('lobby-screen');
        els.game = document.getElementById('game-screen');
        els.idInput = document.getElementById('login-id');
        els.passInput = document.getElementById('login-pass');
        els.loginError = document.getElementById('login-error');
        els.btnLogin = document.getElementById('btn-login');
        els.btnRegister = document.getElementById('btn-register');
        els.btnGuest = document.getElementById('btn-guest');
        els.displayUser = document.getElementById('display-username');
        els.displayLvl = document.getElementById('display-level');
        els.xpBarContainer = document.getElementById('xp-bar-container');
        els.xpFill = document.getElementById('xp-fill');
        els.avatar = document.getElementById('avatar-display');
        els.playerList = document.getElementById('player-list-container');
        els.startBtn = document.getElementById('start-btn');
        els.lobbyStatus = document.getElementById('lobby-status');
        els.chatBox = document.getElementById('chat-box');
        els.chatInput = document.getElementById('chat-input');
        els.serverStatus = document.getElementById('server-status');
        els.roundInd = document.getElementById('round-indicator');
        els.modeInd = document.getElementById('mode-indicator');
        els.gameArea = document.getElementById('game-area');
        els.trashContainer = document.getElementById('trash-container');
        els.msgMain = document.getElementById('center-msg-main');
        els.msgSub = document.getElementById('center-msg-sub');
        els.statAvg = document.getElementById('stat-avg');
        els.statBest = document.getElementById('stat-best');
        els.statScore = document.getElementById('stat-score');
        els.comboDisplay = document.getElementById('combo-display');
        els.comboVal = document.getElementById('combo-val');
        els.readyRoom = document.getElementById('ready-room');
        els.btnReadyConfirm = document.getElementById('btn-ready-confirm');
        els.opponentName = document.getElementById('opponent-name');
        els.readyStatusMe = document.getElementById('ready-status-me');
        els.readyTextMe = document.getElementById('ready-text-me');
        els.readyStatusOpp = document.getElementById('ready-status-opp');
        els.readyTextOpp = document.getElementById('ready-text-opp');
        els.resModal = document.getElementById('result-modal');
        els.resScore = document.getElementById('res-score');
        els.resAvg = document.getElementById('res-avg');
        els.resBest = document.getElementById('res-best');
        els.resMode = document.getElementById('res-mode');
        els.resXP = document.getElementById('res-xp');
        els.profileModal = document.getElementById('profile-modal');
        els.iconGrid = document.getElementById('icon-grid');
        els.profileLevel = document.getElementById('profile-level');
        els.profileNextUnlock = document.getElementById('profile-next-unlock');
    }
    if(document.getElementById('sum-sessions')) {
        els.sumSessions = document.getElementById('sum-sessions');
        els.sumAvg = document.getElementById('sum-avg');
        els.sumBest = document.getElementById('sum-best');
        els.histList = document.getElementById('history-list');
        els.chartTrend = document.getElementById('chart-trend');
    }
}

function showScreen(name) {
    if(!els[name]) return;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    els[name].classList.add('active');
}

// --- AUTH MODULE ---
// Catatan: Untuk backend, sebaiknya gunakan HTTP request untuk login/register, 
// tapi di sini saya adaptasi via WebSocket sesuai permintaan.

const Auth = {
    login: () => {
        const id = els.idInput.value.trim();
        const pass = els.passInput.value;
        if (!id || !pass) { els.loginError.textContent = "Isi field!"; return; }
        // Kirim request login ke server via WebSocket
        Network.send('LOGIN', { username: id, password: pass });
    },
    register: () => {
        const id = els.idInput.value.trim();
        const pass = els.passInput.value;
        if (!id || !pass) { els.loginError.textContent = "Isi field!"; return; }
        // Kirim request register ke server via WebSocket
        Network.send('REGISTER', { username: id, password: pass });
    },
    loginGuest: () => {
        Network.send('LOGIN_GUEST', {});
    },
    onSuccess: (userData) => {
        // Data datang dari server (termasuk level, xp, icon)
        AppState.user = userData;
        AppState.isLoggedIn = true;
        AppState.isGuest = userData.isGuest || false;
        
        // Simpan sesi sementara (token logic bisa ditambahkan di sini)
        sessionStorage.setItem('rduel_current', JSON.stringify(userData));
        
        els.loginError.textContent = "";
        showScreen('lobby');
        UI.updateProfileUI();
        UI.initIconPicker();
        Network.connectSocket(); // Pastikan socket aktif
    },
    checkSession: () => {
        const user = JSON.parse(sessionStorage.getItem('rduel_current') || 'null');
        if (user) {
            AppState.user = user; 
            AppState.isLoggedIn = true; 
            AppState.isGuest = user.isGuest;
            showScreen('lobby');
            UI.updateProfileUI();
            UI.initIconPicker();
            Network.connectSocket();
        } else { showScreen('login'); }
    },
    logout: () => {
        sessionStorage.removeItem('rduel_current');
        if(socket) socket.close();
        location.reload();
    }
};

// --- NETWORK MODULE (INTI PERUBAHAN) ---
const Network = {
    connect: () => {
        // Fungsi ini dipanggil awal untuk cek status, koneksi penuh ada di connectSocket
        if(els.serverStatus) els.serverStatus.textContent = "CONNECTING...";
        Network.connectSocket();
    },
    
    connectSocket: () => {
        socket = new WebSocket(SERVER_URL);

        socket.onopen = () => {
            if(els.serverStatus) els.serverStatus.textContent = "ONLINE";
            // Jika sudah punya sesi, coba re-auth
            const user = JSON.parse(sessionStorage.getItem('rduel_current') || 'null');
            if(user) {
                Network.send('RECONNECT', { token: user.token || null }); // Contoh token
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                Network.handleMessage(data);
            } catch(e) { console.error("WS Parse Error", e); }
        };

        socket.onclose = () => {
            if(els.serverStatus) els.serverStatus.textContent = "OFFLINE";
        };
        
        socket.onerror = () => {
            if(els.serverStatus) els.serverStatus.textContent = "ERROR";
        };
    },

    send: (type, payload = {}) => {
        if(socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type, ...payload }));
        } else {
            console.warn("Socket not connected.");
        }
    },

    handleMessage: (data) => {
        const { type } = data;

        switch(type) {
            // --- Auth Responses ---
            case 'LOGIN_SUCCESS':
                Auth.onSuccess(data.user);
                break;
            case 'LOGIN_FAIL':
                els.loginError.textContent = data.message || "Login gagal.";
                break;

            // --- Lobby Responses ---
            case 'PLAYER_LIST':
                Network.handlePlayerList(data.players);
                break;
            case 'MATCH_FOUND':
                Game.handleMatchFound(data);
                break;
            case 'CHAT_MSG':
                UI.handleChat(data);
                break;

            // --- Game Flow (SPAWN & UPDATE) ---
            case 'SPAWN_ITEMS':
                Game.handleSpawn(data.items);
                break;
            case 'UPDATE_SCORE':
                Game.handleUpdateScore(data);
                break;
            case 'ROUND_END':
                Game.handleRoundEnd(data);
                break;
            case 'MATCH_END':
                Game.handleMatchEnd(data);
                break;
            case 'ITEM_REMOVED':
                Game.removeItemVisual(data.itemId); // Jika server minta hapus item yg gak diklik
                break;
            
            // --- Dashboard Data ---
            case 'HISTORY_DATA':
                Dashboard.render(data.sessions);
                break;
        }
    },

    handlePlayerList: (players) => {
        if(!els.playerList) return;
        els.playerList.innerHTML = players.map(p => 
            `<div class="player-list-item" style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.1)">
                <span>${p.username}</span> <span style="color:var(--accent-yellow)">${p.score} pts</span>
             </div>`
        ).join('');
    }
};

// --- GAME MODULE (LOGIC DIHAPUS, HANYA VISUAL & EMITTER) ---
const Game = {
    startMatch: () => {
        // Reset UI Lokal
        AppState.isGameActive = false;
        els.statAvg.textContent = "---";
        els.statBest.textContent = "---";
        els.statScore.textContent = "0";
        els.comboVal.textContent = "0";
        AppState.currentRound = 1;
        
        // Kirim request cari lawan
        Network.send('FIND_MATCH');
        showScreen('game');
        
        els.gameArea.className = 'state-wait';
        els.readyRoom.classList.remove('active');
        els.roundInd.textContent = "MATCHMAKING";
        els.msgMain.textContent = "SEARCHING";
        els.msgSub.textContent = "Finding an opponent...";
    },

    handleMatchFound: (data) => {
        // Data: { opponentName: string }
        AppState.opponentName = data.opponentName || "Opponent";
        
        els.opponentName.textContent = AppState.opponentName;
        els.readyRoom.classList.add('active');
        els.gameArea.classList.add('state-wait'); 
        els.readyStatusMe.className = 'status-dot';
        els.readyTextMe.textContent = "NOT READY";
        els.readyStatusOpp.className = 'status-dot';
        els.readyTextOpp.textContent = "WAITING...";
        els.btnReadyConfirm.disabled = false;
        els.btnReadyConfirm.textContent = "I AM READY";
    },

    confirmReady: () => {
        if(AppState.isUserReady) return;
        AppState.isUserReady = true;
        
        els.readyStatusMe.className = 'status-dot waiting';
        els.readyTextMe.textContent = "WAITING...";
        els.btnReadyConfirm.disabled = true;
        els.btnReadyConfirm.textContent = "READY";

        // Kirim status ready ke server
        Network.send('PLAYER_READY');
    },

    // --- LISTENER: SPAWN ---
    handleSpawn: (items) => {
        // Data: Array of { id, type, x, y, duration }
        AppState.isGameActive = true;
        els.gameArea.className = 'state-go';
        els.msgMain.textContent = ""; 
        els.msgSub.textContent = "";
        els.trashContainer.innerHTML = '';
        
        // Render semua item dari server
        items.forEach(item => {
            Game.createItem(item.id, item.type, item.x, item.y, item.duration);
        });
    },

    createItem: (id, type, x, y, duration) => {
        const el = document.createElement('div');
        el.className = `trash-item ${type}`;
        el.id = `item-${id}`; // ID unik dari server
        el.style.top = y + '%';
        el.style.left = x + '%';
        
        let iconClass = 'fa-recycle icon-good'; let color = 'var(--accent-green)';
        if(type === 'bad') { iconClass = 'fa-bomb icon-bad'; color = 'var(--accent-red)'; }
        if(type === 'bonus') { iconClass = 'fa-gem icon-bonus'; color = 'var(--accent-yellow)'; }

        el.innerHTML = `<i class="fas ${iconClass}"></i><div class="trash-timer"><div class="timer-fill" style="color:${color}"></div></div>`;
        
        // --- EMITTER: CLICK ---
        el.onpointerdown = (e) => { 
            e.preventDefault(); 
            e.stopPropagation();
            
            // 1. Hapus visual secara instan (optimistic UI)
            if(el.parentNode) el.parentNode.removeChild(el);
            
            // 2. Kirim ke server bahwa item diklik
            Network.send('ITEM_CLICKED', { itemId: id });
        };
        
        // Visual Timer ONLY (tanpa logika game over lokal)
        const timerFill = el.querySelector('.timer-fill');
        const startTime = performance.now();
        
        const interval = setInterval(() => {
            // Cek apakah item masih ada di DOM
            if(!el.parentNode) { clearInterval(interval); return; }
            
            const elapsed = performance.now() - startTime;
            const pct = 100 - (elapsed / duration * 100);
            
            // Hanya update visual, tidak ada logika skor/miss
            if (pct <= 0) {
                timerFill.style.transform = "scaleX(0)";
                clearInterval(interval);
            } else {
                timerFill.style.transform = `scaleX(${pct/100})`;
            }
        }, 16);

        els.trashContainer.appendChild(el);
    },

    // Helper untuk remove item visual jika server kirim signal (opsional)
    removeItemVisual: (itemId) => {
        const el = document.getElementById(`item-${itemId}`);
        if(el && el.parentNode) el.parentNode.removeChild(el);
    },

    // --- LISTENER: UPDATE_SCORE ---
    handleUpdateScore: (data) => {
        // Data: { score, combo, avg, best, round }
        if(data.score !== undefined) els.statScore.textContent = data.score;
        if(data.combo !== undefined) {
            els.comboVal.textContent = data.combo;
            els.comboDisplay.classList.add('show');
            setTimeout(() => els.comboDisplay.classList.remove('show'), 300);
        }
        if(data.avg !== undefined) els.statAvg.textContent = data.avg;
        if(data.best !== undefined) els.statBest.textContent = data.best;
        
        // Feedback visual (aman, hanya teks)
        if(data.feedback) { // Server bisa kirim "MISS!" atau "HIT!"
            els.msgSub.textContent = data.feedback.text;
            els.msgSub.style.color = data.feedback.color;
        }
    },

    handleRoundEnd: (data) => {
        // Hapus semua item sisa (jika ada)
        els.trashContainer.innerHTML = '';
        
        // Update UI Round
        AppState.currentRound = data.nextRound || (AppState.currentRound + 1);
        els.roundInd.textContent = `MATCH ${AppState.currentRound} / 5`;
        
        Game.setStateWait(`ROUND ${AppState.currentRound}`, "Get Ready...");
    },

    handleMatchEnd: (data) => {
        AppState.isGameActive = false;
        els.gameArea.className = 'state-wait';
        els.msgMain.textContent = "FINISH";
        
        // Update Level & XP dari Server
        if(data.user) {
            AppState.user = data.user;
            sessionStorage.setItem('rduel_current', JSON.stringify(data.user));
            UI.updateProfileUI();
        }

        // Tampilkan Result Modal
        els.resMode.textContent = data.result || "Finished";
        els.resScore.textContent = data.finalScore;
        els.resAvg.textContent = data.avgTime;
        els.resBest.textContent = data.bestTime;
        els.resXP.textContent = `+${data.xpEarned} XP`;
        els.resXP.style.color = "var(--accent-green)";
        
        UI.showResultModal();
    },

    setStateWait: (mainTxt = "WAIT", subTxt = "") => {
        AppState.isGameActive = false;
        els.gameArea.className = 'state-wait';
        els.msgMain.textContent = mainTxt;
        els.msgSub.textContent = subTxt;
    },

    backToLobby: () => {
        if(els.resModal) els.resModal.classList.remove('show');
        showScreen('lobby');
        UI.updateProfileUI();
    }
};

// --- UI MODULE ---
const UI = {
    updateProfileUI: () => {
        if (!AppState.user || !els.displayUser) return;
        els.displayUser.textContent = AppState.user.username;
        if (AppState.isGuest) {
            els.displayLvl.textContent = "Offline Mode";
            els.xpBarContainer.style.display = "none";
        } else {
            els.xpBarContainer.style.display = "block";
            const data = getLevelData(AppState.user.totalXP || 0);
            els.displayLvl.innerHTML = `Lvl ${data.level} <span>${data.progressXP} / ${data.neededXP} XP</span>`;
            els.xpFill.style.width = `${data.progressPercent}%`;
        }
        els.avatar.innerHTML = `<i class="fas ${AppState.user.icon || 'fa-user'}"></i>`;
    },
    
    toggleProfile: () => {
        if(els.profileModal) els.profileModal.style.display = els.profileModal.style.display === 'flex' ? 'none' : 'flex';
    },
    
    handleChat: (data) => {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<strong>${data.user}:</strong> ${data.msg}`;
        els.chatBox.appendChild(div);
        els.chatBox.scrollTop = els.chatBox.scrollHeight;
    },

    initIconPicker: () => {
        if(!els.iconGrid) return;
        if(AppState.isGuest) {
            els.iconGrid.innerHTML = '<p style="color:#666; grid-column:1/-1; text-align:center;">Guest tidak punya profil.</p>';
            return;
        }
        // Logic unlock icon bisa diambil dari server atau dihitung lokal dari data user
        els.iconGrid.innerHTML = '<p style="color:#666">Icons managed by server.</p>'; 
    },

    showResultModal: () => {
        if(!els.resModal) return;
        els.resModal.classList.add('show');
    },
    retryGame: () => {
        if(els.resModal) els.resModal.classList.remove('show');
        Game.startMatch();
    }
};

const Chat = {
    handleKey: (e) => {
        if(e.key === 'Enter' && els.chatInput) {
            const msg = els.chatInput.value.trim();
            if(msg) {
                Network.send('CHAT', { message: msg });
                els.chatInput.value = '';
            }
        }
    }
};

// --- DASHBOARD ---
const Dashboard = {
    init: () => {
        // Minta data ke server saat halaman buka
        // Network.send('GET_HISTORY'); 
        // Untuk sekarang, kita isi dummy atau kosongkan karena localStorage dihapus
        els.sumSessions.textContent = "0";
        els.sumAvg.textContent = "---";
        els.sumBest.textContent = "---";
        els.histList.innerHTML = '<div style="text-align:center">Waiting for server data...</div>';
    },
    render: (sessions) => {
        // Data datang dari server via Network.handleMessage -> Dashboard.render
        els.sumSessions.textContent = sessions.length;
        // ... logic render grafik dll sama seperti sebelumnya, tapi pakai data dari server
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initDOM();
    if(els.btnLogin) els.btnLogin.onclick = Auth.login;
    if(els.btnRegister) els.btnRegister.onclick = Auth.register;
    if(els.btnGuest) els.btnGuest.onclick = Auth.loginGuest;

    if(document.getElementById('sum-sessions')) {
        Dashboard.init();
    } else if (document.getElementById('login-screen')) {
        Auth.checkSession();
    }
});