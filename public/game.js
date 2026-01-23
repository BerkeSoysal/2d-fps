const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Hot reload: refresh page when server restarts (dev mode)
let wasDisconnected = false;
socket.on('disconnect', () => { wasDisconnected = true; });
socket.on('connect', () => { if (wasDisconnected) location.reload(); });

// Press B to redraw map without reload (dev mode)
window.addEventListener('keydown', (e) => {
    if (e.key === 'b' && isTrainingMode) {
        // Re-fetch map data from GameLogic module by reloading the script
        const script = document.createElement('script');
        script.src = 'gameLogic.js?t=' + Date.now();
        script.onload = () => {
            walls = GameLogic.buildingWalls;
            floors = GameLogic.floors;
            decorations = GameLogic.decorations;
            visualWallTiles = GameLogic.wallTiles;
            backgroundRendered = false;
            tryRenderBackground();
            console.log('Map redrawn!');
        };
        document.head.appendChild(script);
    }
});

// Mobile detection (early for performance constants)
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Screen elements
const homeScreen = document.getElementById('homeScreen');
const lobbyScreen = document.getElementById('lobbyScreen');
const gameScreen = document.getElementById('gameScreen');
const playerNameInput = document.getElementById('playerNameInput');
const singlePlayerBtn = document.getElementById('singlePlayerBtn');
const trainingModeBtn = document.getElementById('trainingModeBtn');
const multiPlayerBtn = document.getElementById('multiPlayerBtn');
const pvpBtn = document.getElementById('pvpBtn');
const roomSection = document.getElementById('roomSection');
const roomList = document.getElementById('roomList');
const createRoomBtn = document.getElementById('createRoomBtn');
const backToMenuBtn = document.getElementById('backToMenuBtn');
const modeButtons = document.getElementById('modeButtons');

// Lobby elements
const lobbyPlayers = document.getElementById('lobbyPlayers');
const playerCountLobby = document.getElementById('playerCountLobby');
const startGameBtn = document.getElementById('startGameBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const waitingText = document.getElementById('waitingText');
const roomNameDisplay = document.getElementById('roomName');

// Game Over elements
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreDisplay = document.getElementById('finalScore');
const finalPhaseDisplay = document.getElementById('finalPhase');
const submitScoreBtn = document.getElementById('submitScoreBtn');
const submitScoreSection = document.getElementById('submitScoreSection');
const scoreSubmittedText = document.getElementById('scoreSubmitted');
const playAgainBtn = document.getElementById('playAgainBtn');
const mainMenuBtn = document.getElementById('mainMenuBtn');
const shareOnXBtn = document.getElementById('shareOnXBtn');

// High Scores elements
const highScoresScreen = document.getElementById('highScoresScreen');
const highScoresBtn = document.getElementById('highScoresBtn');
const scoresBody = document.getElementById('scoresBody');
const backFromScoresBtn = document.getElementById('backFromScoresBtn');

// Help overlay elements
const helpOverlay = document.getElementById('helpOverlay');
const helpBtn = document.getElementById('helpBtn');
const closeHelpBtn = document.getElementById('closeHelpBtn');

// Pause screen elements
const pauseScreen = document.getElementById('pauseScreen');
const pauseMessage = document.getElementById('pauseMessage');
const resumeBtn = document.getElementById('resumeBtn');
const pauseRestartBtn = document.getElementById('pauseRestartBtn');
const pauseMainMenuBtn = document.getElementById('pauseMainMenuBtn');

// Game state
let myName = '';
let gameJoined = false;
let currentRoomId = null;
let isHost = false;
let isDead = false;
let currentPhase = 1;
let scoreSubmitted = false;
let scoreToken = null; // Token for verified score submission
let myAmmo = 0;
let myGrenades = 0;
let isSinglePlayer = false;
let isPaused = false;
let isPvpMode = false;

// Active grenades for rendering
let grenades = [];

// Offline single player state
let isOfflineSinglePlayer = false;
let isTrainingMode = false;
let localGameState = null;
let localPlayerId = 'local_player';

// Single Player - verified mode with server-side replay verification
let singlePlayerSessionId = null;

singlePlayerBtn.addEventListener('click', async () => {
    myName = playerNameInput.value.trim() || 'Player';

    // Show loading state
    singlePlayerBtn.disabled = true;
    singlePlayerBtn.textContent = 'Starting...';

    try {
        // Get seed from server for verified play
        const response = await fetch('/api/singleplayer/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ playerName: myName })
        });

        if (!response.ok) {
            throw new Error('Failed to start session');
        }

        const data = await response.json();
        singlePlayerSessionId = data.sessionId;

        isSinglePlayer = true;
        isOfflineSinglePlayer = true;

        // Initialize local game state with server-provided seed
        localGameState = GameLogic.createGameState(localPlayerId, myName, data.seed);

        // Set up map data from shared module
        walls = GameLogic.buildingWalls;
        floors = GameLogic.floors;
        decorations = GameLogic.decorations;
        visualWallTiles = GameLogic.wallTiles;
        backgroundRendered = false; // Reset to re-render background

        // Initialize game variables
        players = localGameState.players;
        projectiles = localGameState.projectiles;
        zombies = localGameState.zombies;
        items = localGameState.items;

        // Start game
        gameJoined = true;
        isDead = false;
        scoreSubmitted = false;
        scoreToken = null;
        currentPhase = 1;

        // Show game screen
        homeScreen.style.display = 'none';
        gameScreen.style.display = 'block';
        gameOverScreen.style.display = 'none';

        // Update UI
        if (scoreDisplay) scoreDisplay.textContent = 'Score: 0';
        if (phaseDisplay) phaseDisplay.textContent = 'Phase 1';
        updateWeaponDisplay();

        // Start local game loop
        startLocalGameLoop();

        // Show help for first-time players
        if (!hasSeenHelp()) {
            showHelpOverlay();
        }

    } catch (err) {
        console.error('Failed to start single player:', err);
        alert('Failed to connect to server. Please try again.');
    } finally {
        singlePlayerBtn.disabled = false;
        singlePlayerBtn.textContent = 'Single Player';
    }
});

// Training Mode - weapons available, zombies don't move
trainingModeBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || 'Player';
    isSinglePlayer = true;
    isOfflineSinglePlayer = true;
    isTrainingMode = true;

    // Initialize local game state using shared game logic
    localGameState = GameLogic.createGameState(localPlayerId, myName);
    localGameState.isTrainingMode = true;

    // Set up map data from shared module
    walls = GameLogic.buildingWalls;
    floors = GameLogic.floors;
    decorations = GameLogic.decorations;
    visualWallTiles = GameLogic.wallTiles;
    backgroundRendered = false; // Reset to re-render background

    // Initialize game variables
    players = localGameState.players;
    projectiles = localGameState.projectiles;
    zombies = localGameState.zombies;
    items = localGameState.items;
    grenades = localGameState.grenades;

    // Spawn all weapon types in the house
    const houseWeapons = [
        { type: 'machine_gun', x: 700, y: 500 },
        { type: 'shotgun', x: 800, y: 500 },
        { type: 'grenade', x: 750, y: 600 }
    ];
    houseWeapons.forEach((w, i) => {
        items.push({ id: 'training_weapon_' + i, type: w.type, x: w.x, y: w.y });
    });

    // Give player some starting grenades for training
    localGameState.players[localPlayerId].grenades = 3;
    myGrenades = 3;

    // Spawn initial training zombies (stationary)
    for (let i = 0; i < 10; i++) {
        const zx = 200 + Math.random() * 1600;
        const zy = 100 + Math.random() * 1000;
        zombies.push({
            id: 'training_z_' + i,
            x: zx,
            y: zy,
            angle: Math.random() * Math.PI * 2,
            hp: 30,
            targetId: null,
            speed: 0, // Stationary
            isTrainingZombie: true
        });
    }

    // Start game
    gameJoined = true;
    isDead = false;
    scoreSubmitted = false;
    scoreToken = null;
    currentPhase = 1;

    // Show game screen
    homeScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    gameOverScreen.style.display = 'none';

    // Update UI
    if (scoreDisplay) scoreDisplay.textContent = 'Training Mode';
    if (phaseDisplay) phaseDisplay.textContent = '🎯 Training';
    updateWeaponDisplay();

    // Start local game loop
    startLocalGameLoop();
});

// Multiplayer - show room list
multiPlayerBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || 'Player';
    if (!myName) {
        alert('Please enter your name first!');
        return;
    }
    isSinglePlayer = false;
    isPvpMode = false;
    modeButtons.style.display = 'none';
    roomSection.style.display = 'block';
    socket.emit('getRooms', { pvp: false });
});

pvpBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || 'Player';
    if (!myName) {
        alert('Please enter your name first!');
        return;
    }
    isSinglePlayer = false;
    isPvpMode = true;
    modeButtons.style.display = 'none';
    roomSection.style.display = 'block';
    socket.emit('getRooms', { pvp: true });
});

backToMenuBtn.addEventListener('click', () => {
    modeButtons.style.display = 'flex';
    roomSection.style.display = 'none';
    isPvpMode = false;
});

// High Scores Page
highScoresBtn.addEventListener('click', async () => {
    await loadHighScores();
    homeScreen.style.display = 'none';
    highScoresScreen.style.display = 'flex';
});

backFromScoresBtn.addEventListener('click', () => {
    highScoresScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
});

// Help Overlay Functions
function showHelpOverlay() {
    helpOverlay.style.display = 'flex';
}

function hideHelpOverlay() {
    helpOverlay.style.display = 'none';
}

function hasSeenHelp() {
    return localStorage.getItem('zombieSurvivalHelpSeen') === 'true';
}

function markHelpAsSeen() {
    localStorage.setItem('zombieSurvivalHelpSeen', 'true');
}

// Help button click
helpBtn.addEventListener('click', () => {
    showHelpOverlay();
});

// Close help button
closeHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideHelpOverlay();
    markHelpAsSeen();
});

// Click anywhere on overlay to close
helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) {
        hideHelpOverlay();
        markHelpAsSeen();
    }
});

// Press any key to close help
window.addEventListener('keydown', (e) => {
    if (helpOverlay.style.display === 'flex') {
        hideHelpOverlay();
        markHelpAsSeen();
    }
});

async function loadHighScores() {
    try {
        const response = await fetch('/api/highscores');
        const scores = await response.json();

        scoresBody.innerHTML = '';
        if (scores.length === 0) {
            scoresBody.innerHTML = '<tr><td colspan="4" style="color: #888;">No scores yet. Be the first!</td></tr>';
            return;
        }

        scores.forEach((score, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(score.name)}</td>
                <td>${score.score}</td>
                <td>${score.phase}</td>
            `;
            scoresBody.appendChild(row);
        });
    } catch (err) {
        console.error('Error loading high scores:', err);
        scoresBody.innerHTML = '<tr><td colspan="4" style="color: #e74c3c;">Error loading scores</td></tr>';
    }
}

// Create room
createRoomBtn.addEventListener('click', () => {
    const defaultName = isPvpMode ? `${myName}'s Arena` : `${myName}'s Room`;
    const roomName = prompt('Enter room name:', defaultName);
    if (roomName) {
        socket.emit('createRoom', { playerName: myName, roomName: roomName, isPvp: isPvpMode });
    }
});

// Room list update
socket.on('roomsList', (rooms) => {
    roomList.innerHTML = '';
    if (rooms.length === 0) {
        roomList.innerHTML = '<p class="no-rooms">No rooms available. Create one!</p>';
    } else {
        rooms.forEach(room => {
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `
                <span class="room-name">${room.name}</span>
                <span class="room-players">${room.players}/${room.maxPlayers}</span>
            `;
            div.addEventListener('click', () => {
                socket.emit('joinRoom', { roomId: room.id, playerName: myName });
            });
            roomList.appendChild(div);
        });
    }
});

// Room created - go to lobby
socket.on('roomCreated', (data) => {
    currentRoomId = data.roomId;
    isHost = true;
    showLobby(data.room);
});

// Room joined - go to lobby
socket.on('roomJoined', (data) => {
    currentRoomId = data.roomId;
    isHost = false;
    showLobby(data.room);
});

// Lobby update
socket.on('lobbyUpdate', (data) => {
    updateLobbyPlayers(data.playerList, data.hostId);
});

// Game started
socket.on('gameStarted', (data) => {
    currentRoomId = data.roomId;
    gameJoined = true;
    homeScreen.style.display = 'none';
    lobbyScreen.style.display = 'none';
    gameScreen.style.display = 'block';

    // Show help for first-time players
    if (!hasSeenHelp()) {
        showHelpOverlay();
    }
});

function showLobby(room) {
    homeScreen.style.display = 'none';
    lobbyScreen.style.display = 'flex';
    roomNameDisplay.textContent = room.name;
    updateLobbyPlayers(room.playerList, room.hostId);
}

function updateLobbyPlayers(playerList, hostId) {
    lobbyPlayers.innerHTML = '';
    playerCountLobby.textContent = playerList.length;

    playerList.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name + (p.id === hostId ? ' 👑' : '');
        if (p.id === hostId) li.className = 'host';
        lobbyPlayers.appendChild(li);
    });

    // Show start button only for host
    if (socket.id === hostId) {
        startGameBtn.style.display = 'block';
        waitingText.style.display = 'none';
        isHost = true;
    } else {
        startGameBtn.style.display = 'none';
        waitingText.style.display = 'block';
        isHost = false;
    }
}

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    lobbyScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    modeButtons.style.display = 'flex';
    roomSection.style.display = 'none';
    currentRoomId = null;
});

// Game screen elements
const playerCountDisplay = document.getElementById('playerCount');
const phaseDisplay = document.getElementById('phaseDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const weaponDisplay = document.getElementById('weaponDisplay');

// Player count update
socket.on('playerCount', (count) => {
    playerCountDisplay.textContent = `Players: ${count}`;
});

// Phase change handling
socket.on('phaseChange', (data) => {
    currentPhase = data.phase;
    phaseDisplay.textContent = `Phase ${data.phase}`;

    // Add phase announcement to chat
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chatMessage system';
        msgDiv.innerHTML = `🎯 ${data.message}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// Phase clear bonus handling
socket.on('phaseClear', (data) => {
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chatMessage system';
        msgDiv.innerHTML = `🏆 Phase ${data.phase} Clear! +${data.totalBonus} pts (${data.timeSeconds}s - Time: +${data.timeBonus}, Phase: +${data.phaseBonus})`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

// Chat handling
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chatMessages');
let isChatting = false;

chatInput.addEventListener('focus', () => {
    isChatting = true;
});

chatInput.addEventListener('blur', () => {
    isChatting = false;
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        socket.emit('chatMessage', chatInput.value.trim());
        chatInput.value = '';
        chatInput.blur();
    }
});

// Press Enter to focus chat
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !isChatting && gameJoined) {
        e.preventDefault();
        chatInput.focus();
    }
    // Press Escape to unfocus chat
    if (e.key === 'Escape' && isChatting) {
        chatInput.blur();
    }
});

socket.on('chatMessage', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatMessage';
    msgDiv.innerHTML = `<span class="chatName">${escapeHtml(data.name)}:</span> ${escapeHtml(data.message)}`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Limit to 50 messages
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

const mouse = {
    x: 0,
    y: 0
};

// Grenade charge state
let grenadeChargeStart = null;
let isChargingGrenade = false;

// Input Handling
window.addEventListener('keydown', (e) => {
    if (!gameJoined || isChatting) return;
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = true;
    if (key === 'a') keys.a = true;
    if (key === 's') keys.s = true;
    if (key === 'd') keys.d = true;

    // R key for respawn in multiplayer
    if (key === 'r') {
        const myPlayer = players[socket.id];
        if (myPlayer && myPlayer.hp <= 0 && !isSinglePlayer && !isOfflineSinglePlayer) {
            socket.emit('restart');
        }
    }

    // E key for charging grenade (start charging on press)
    if (key === 'e' && !isChargingGrenade) {
        const myPlayer = isOfflineSinglePlayer ? localGameState?.players?.[localPlayerId] : players[socket.id];
        if (myPlayer && myPlayer.hp > 0 && myGrenades > 0) {
            isChargingGrenade = true;
            grenadeChargeStart = Date.now();
        }
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w') keys.w = false;
    if (key === 'a') keys.a = false;
    if (key === 's') keys.s = false;
    if (key === 'd') keys.d = false;

    // E key release - throw grenade with charged power
    if (key === 'e' && isChargingGrenade) {
        const myPlayer = isOfflineSinglePlayer ? localGameState?.players?.[localPlayerId] : players[socket.id];
        if (myPlayer && myPlayer.hp > 0 && myGrenades > 0) {
            const chargeTime = Date.now() - grenadeChargeStart;
            const maxChargeTime = GameLogic?.CONSTANTS?.GRENADE_CHARGE_TIME || 1500;
            const chargePower = Math.min(1, chargeTime / maxChargeTime);

            if (isOfflineSinglePlayer) {
                throwLocalGrenade(chargePower);
            } else {
                socket.emit('throwGrenade', { chargePower });
            }
        }
        isChargingGrenade = false;
        grenadeChargeStart = null;
    }
});

// Throw grenade in offline single player mode
function throwLocalGrenade(chargePower = 0) {
    if (!localGameState || !localGameState.players[localPlayerId]) return;

    const player = localGameState.players[localPlayerId];
    if (player.grenades <= 0) return;

    // Log the grenade throw for replay verification (include charge power)
    if (localGameState.inputLog) {
        localGameState.inputLog.push({
            f: localGameState.frame,
            g: 1, // grenade throw event
            p: chargePower // charge power
        });
    }

    const grenade = GameLogic.createGrenade(player, localGameState, chargePower);
    if (grenade) {
        localGameState.grenades.push(grenade);
        grenades = localGameState.grenades;
        myGrenades = player.grenades;
        updateWeaponDisplay();

        const powerPercent = Math.round(chargePower * 100);
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chatMessage system';
        msgDiv.innerHTML = `💣 Grenade thrown! (${powerPercent}% power, ${myGrenades} remaining)`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ESC key for pause menu
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameJoined && !isDead) {
        e.preventDefault();
        if (isPaused) {
            // Only host/single player can unpause
            if (isOfflineSinglePlayer) {
                localGameState.isPaused = false;
                isPaused = false;
                hidePauseMenu();
            } else if (isSinglePlayer || isHost) {
                socket.emit('resumeGame');
            }
        } else {
            // Show pause menu
            showPauseMenu();
        }
    }
});

function showPauseMenu() {
    if (isOfflineSinglePlayer) {
        // Offline single player - pause locally
        localGameState.isPaused = true;
        pauseMessage.textContent = 'Game Paused';
        resumeBtn.style.display = 'block';
        pauseRestartBtn.style.display = 'block';
    } else if (isSinglePlayer) {
        // Online single player - pause game
        socket.emit('pauseGame');
        pauseMessage.textContent = 'Game Paused';
        resumeBtn.style.display = 'block';
        pauseRestartBtn.style.display = 'block';
    } else if (isHost) {
        // Multiplayer host - pause game for everyone
        socket.emit('pauseGame');
        pauseMessage.textContent = 'Game Paused (All Players)';
        resumeBtn.style.display = 'block';
        pauseRestartBtn.style.display = 'none'; // No restart in multiplayer
    } else {
        // Multiplayer joiner - just show menu, no pause
        pauseMessage.textContent = 'Menu (Game continues)';
        resumeBtn.style.display = 'block';
        resumeBtn.textContent = '▶️ Close Menu';
        pauseRestartBtn.style.display = 'none';
    }
    pauseScreen.style.display = 'flex';
    isPaused = true;
}

function hidePauseMenu() {
    pauseScreen.style.display = 'none';
    isPaused = false;
    resumeBtn.textContent = '▶️ Resume'; // Reset text
}

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// Auto-fire support
let isMouseDown = false;
let autoFireInterval = null;

window.addEventListener('mousedown', (e) => {
    if (!gameJoined) return;
    // Don't shoot if game over screen or pause screen is visible or clicking UI buttons
    if (gameOverScreen.style.display !== 'none') return;
    if (pauseScreen.style.display !== 'none') return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

    isMouseDown = true;
    handleShoot();
    playSound('shoot');

    // Auto-fire for machine gun
    if (currentWeapon === 'machine_gun') {
        autoFireInterval = setInterval(() => {
            // Stop if no longer holding, weapon changed, or out of ammo
            if (!isMouseDown || currentWeapon !== 'machine_gun' || myAmmo <= 0) {
                clearInterval(autoFireInterval);
                autoFireInterval = null;
                return;
            }
            handleShoot();
            playSound('shoot');
        }, 100); // Fire every 100ms
    }
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
    }
    stopMachineGunSound();
});

// ==================== MOBILE TOUCH CONTROLS ====================

// Mobile control elements
const mobileControls = document.getElementById('mobileControls');
const leftJoystickZone = document.getElementById('leftJoystickZone');
const leftJoystickBase = document.getElementById('leftJoystickBase');
const leftJoystickKnob = document.getElementById('leftJoystickKnob');
const rightJoystickZone = document.getElementById('rightJoystickZone');
const rightJoystickBase = document.getElementById('rightJoystickBase');
const rightJoystickKnob = document.getElementById('rightJoystickKnob');
const targetLockIndicator = document.getElementById('targetLockIndicator');
const targetLockText = document.getElementById('targetLockText');

// Joystick state
let leftJoystickActive = false;
let leftJoystickCenter = { x: 0, y: 0 };
let leftJoystickTouchId = null;

let rightJoystickActive = false;
let rightJoystickCenter = { x: 0, y: 0 };
let rightJoystickTouchId = null;

// Movement from joystick
let joystickMovement = { x: 0, y: 0 };

// Auto-aim system
let currentTarget = null;
let autoAimAngle = 0;
let useAutoAim = false;
let manualAimAngle = 0;
let isManualAiming = false;
let mobileAutoFireInterval = null;
let lastAutoAimUpdate = 0;
const AUTO_AIM_THROTTLE = 150; // Only update auto-aim every 150ms (reduced for performance)

// Joystick constants
const KNOB_MAX_DISTANCE = 55;
const DEAD_ZONE = 0.15;
const TARGET_SWITCH_THRESHOLD = 0.4; // How much stick movement to switch target

// Find closest zombie to player
function findClosestZombie(playerX, playerY) {
    if (!zombies || zombies.length === 0) return null;

    let closest = null;
    let closestDist = Infinity;

    for (const zombie of zombies) {
        const dx = zombie.x - playerX;
        const dy = zombie.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Only target zombies within reasonable range (600 units)
        if (dist < closestDist && dist < 600) {
            closestDist = dist;
            closest = zombie;
        }
    }

    return closest;
}

// Find zombie in direction (for manual target switching)
function findZombieInDirection(playerX, playerY, angle, excludeZombie) {
    if (!zombies || zombies.length === 0) return null;

    let best = null;
    let bestScore = -Infinity;

    for (const zombie of zombies) {
        if (zombie === excludeZombie) continue;

        const dx = zombie.x - playerX;
        const dy = zombie.y - playerY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 600 || dist < 10) continue;

        // Calculate angle to zombie
        const zombieAngle = Math.atan2(dy, dx);

        // Calculate angle difference
        let angleDiff = Math.abs(zombieAngle - angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        // Score based on how close the angle is (lower diff = higher score)
        // Also factor in distance (closer = better)
        const angleScore = 1 - (angleDiff / Math.PI);
        const distScore = 1 - (dist / 600);
        const score = angleScore * 0.7 + distScore * 0.3;

        if (score > bestScore && angleDiff < Math.PI / 3) { // Within 60 degrees
            bestScore = score;
            best = zombie;
        }
    }

    return best;
}

// Update auto-aim angle
function updateAutoAim() {
    const myId = isOfflineSinglePlayer ? localPlayerId : socket.id;
    const myPlayer = players[myId];
    if (!myPlayer || myPlayer.hp <= 0) {
        currentTarget = null;
        return;
    }

    // If manual aiming, use that angle
    if (isManualAiming) {
        autoAimAngle = manualAimAngle;
        return;
    }

    // Find closest zombie for auto-aim
    const closest = findClosestZombie(myPlayer.x, myPlayer.y);

    if (closest) {
        currentTarget = closest;
        const dx = closest.x - myPlayer.x;
        const dy = closest.y - myPlayer.y;
        autoAimAngle = Math.atan2(dy, dx);
        useAutoAim = true;
    } else {
        currentTarget = null;
        useAutoAim = false;
    }
}

// Left Joystick (Movement only)
if (leftJoystickZone) {
    leftJoystickZone.addEventListener('touchstart', (e) => {
        if (!gameJoined) return;
        e.preventDefault();

        // Check if dead - respawn instead of moving in multiplayer
        const myPlayer = players[socket.id];
        if (myPlayer && myPlayer.hp <= 0) {
            if (!isSinglePlayer && !isOfflineSinglePlayer) {
                socket.emit('restart');
            }
            return;
        }

        const touch = e.changedTouches[0];
        leftJoystickTouchId = touch.identifier;
        leftJoystickActive = true;
        leftJoystickCenter = { x: touch.clientX, y: touch.clientY };

        leftJoystickBase.style.left = touch.clientX + 'px';
        leftJoystickBase.style.top = touch.clientY + 'px';
        leftJoystickBase.classList.add('active');
        leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
    }, { passive: false });

    leftJoystickZone.addEventListener('touchmove', (e) => {
        if (!leftJoystickActive) return;
        e.preventDefault();

        let touch = null;
        for (let t of e.changedTouches) {
            if (t.identifier === leftJoystickTouchId) {
                touch = t;
                break;
            }
        }
        if (!touch) return;

        const dx = touch.clientX - leftJoystickCenter.x;
        const dy = touch.clientY - leftJoystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let clampedX = dx;
        let clampedY = dy;
        if (distance > KNOB_MAX_DISTANCE) {
            clampedX = (dx / distance) * KNOB_MAX_DISTANCE;
            clampedY = (dy / distance) * KNOB_MAX_DISTANCE;
        }

        leftJoystickKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

        const normalizedX = clampedX / KNOB_MAX_DISTANCE;
        const normalizedY = clampedY / KNOB_MAX_DISTANCE;

        joystickMovement.x = Math.abs(normalizedX) > DEAD_ZONE ? normalizedX : 0;
        joystickMovement.y = Math.abs(normalizedY) > DEAD_ZONE ? normalizedY : 0;

        keys.a = joystickMovement.x < -DEAD_ZONE;
        keys.d = joystickMovement.x > DEAD_ZONE;
        keys.w = joystickMovement.y < -DEAD_ZONE;
        keys.s = joystickMovement.y > DEAD_ZONE;
    }, { passive: false });

    leftJoystickZone.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === leftJoystickTouchId) {
                leftJoystickActive = false;
                leftJoystickTouchId = null;
                leftJoystickBase.classList.remove('active');
                joystickMovement = { x: 0, y: 0 };
                keys.w = false;
                keys.a = false;
                keys.s = false;
                keys.d = false;
                break;
            }
        }
    });

    leftJoystickZone.addEventListener('touchcancel', (e) => {
        leftJoystickActive = false;
        leftJoystickTouchId = null;
        leftJoystickBase.classList.remove('active');
        joystickMovement = { x: 0, y: 0 };
        keys.w = false;
        keys.a = false;
        keys.s = false;
        keys.d = false;
    });
}

// Right Joystick (Aim + Auto-fire + Target Switch)
if (rightJoystickZone) {
    rightJoystickZone.addEventListener('touchstart', (e) => {
        if (!gameJoined) return;
        e.preventDefault();

        // Check if dead - respawn instead of shooting in multiplayer
        const myPlayer = players[socket.id];
        if (myPlayer && myPlayer.hp <= 0) {
            if (!isSinglePlayer && !isOfflineSinglePlayer) {
                socket.emit('restart');
            }
            return;
        }

        const touch = e.changedTouches[0];
        rightJoystickTouchId = touch.identifier;
        rightJoystickActive = true;
        rightJoystickCenter = { x: touch.clientX, y: touch.clientY };

        rightJoystickBase.style.left = touch.clientX + 'px';
        rightJoystickBase.style.top = touch.clientY + 'px';
        rightJoystickBase.classList.add('active');
        rightJoystickKnob.style.transform = 'translate(-50%, -50%)';

        // Show target indicator
        if (targetLockIndicator) {
            targetLockIndicator.classList.add('active');
        }

        // Start auto-fire
        handleShoot();
        playSound('shoot');

        const fireRate = currentWeapon === 'machine_gun' ? 100 : (currentWeapon === 'shotgun' ? 400 : 250);
        mobileAutoFireInterval = setInterval(() => {
            // Stop if joystick released or out of ammo (for non-pistol weapons)
            if (!rightJoystickActive) {
                clearInterval(mobileAutoFireInterval);
                mobileAutoFireInterval = null;
                return;
            }
            // Stop auto-fire if weapon needs ammo and we're out
            if (currentWeapon !== 'pistol' && myAmmo <= 0) {
                clearInterval(mobileAutoFireInterval);
                mobileAutoFireInterval = null;
                return;
            }
            handleShoot();
            playSound('shoot');
        }, fireRate);
    }, { passive: false });

    rightJoystickZone.addEventListener('touchmove', (e) => {
        if (!rightJoystickActive) return;
        e.preventDefault();

        let touch = null;
        for (let t of e.changedTouches) {
            if (t.identifier === rightJoystickTouchId) {
                touch = t;
                break;
            }
        }
        if (!touch) return;

        const dx = touch.clientX - rightJoystickCenter.x;
        const dy = touch.clientY - rightJoystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let clampedX = dx;
        let clampedY = dy;
        if (distance > KNOB_MAX_DISTANCE) {
            clampedX = (dx / distance) * KNOB_MAX_DISTANCE;
            clampedY = (dy / distance) * KNOB_MAX_DISTANCE;
        }

        rightJoystickKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

        const normalizedMagnitude = distance / KNOB_MAX_DISTANCE;

        // If stick moved significantly, switch to manual aim / target selection
        if (normalizedMagnitude > TARGET_SWITCH_THRESHOLD) {
            isManualAiming = true;
            manualAimAngle = Math.atan2(dy, dx);

            // Try to find a zombie in that direction
            const myIdForAim = isOfflineSinglePlayer ? localPlayerId : socket.id;
            const myPlayer = players[myIdForAim];
            if (myPlayer) {
                const newTarget = findZombieInDirection(myPlayer.x, myPlayer.y, manualAimAngle, null);
                if (newTarget) {
                    currentTarget = newTarget;
                    // Snap aim to target
                    const tdx = newTarget.x - myPlayer.x;
                    const tdy = newTarget.y - myPlayer.y;
                    manualAimAngle = Math.atan2(tdy, tdx);

                    // Update indicator
                    if (targetLockIndicator && targetLockText) {
                        targetLockIndicator.classList.add('locked');
                        targetLockText.textContent = 'LOCKED';
                    }
                }
            }
        } else {
            // Stick near center - use auto-aim
            isManualAiming = false;
            if (targetLockIndicator && targetLockText) {
                targetLockIndicator.classList.remove('locked');
                targetLockText.textContent = 'AUTO';
            }
        }
    }, { passive: false });

    rightJoystickZone.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === rightJoystickTouchId) {
                rightJoystickActive = false;
                rightJoystickTouchId = null;
                rightJoystickBase.classList.remove('active');
                isManualAiming = false;

                // Hide target indicator
                if (targetLockIndicator) {
                    targetLockIndicator.classList.remove('active');
                    targetLockIndicator.classList.remove('locked');
                }

                // Stop auto-fire
                if (mobileAutoFireInterval) {
                    clearInterval(mobileAutoFireInterval);
                    mobileAutoFireInterval = null;
                }
                stopMachineGunSound();
                break;
            }
        }
    });

    rightJoystickZone.addEventListener('touchcancel', (e) => {
        rightJoystickActive = false;
        rightJoystickTouchId = null;
        rightJoystickBase.classList.remove('active');
        isManualAiming = false;

        if (targetLockIndicator) {
            targetLockIndicator.classList.remove('active');
            targetLockIndicator.classList.remove('locked');
        }

        if (mobileAutoFireInterval) {
            clearInterval(mobileAutoFireInterval);
            mobileAutoFireInterval = null;
        }
        stopMachineGunSound();
    });
}


// Prevent default touch behaviors on canvas (scrolling, zooming)
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// ==================== END MOBILE CONTROLS ====================

const restartBtn = document.getElementById('restartBtn');
restartBtn.addEventListener('click', () => {
    socket.emit('restart');
    restartBtn.style.display = 'none';
});

// Mobile: tap anywhere to respawn when dead in multiplayer
canvas.addEventListener('touchend', (e) => {
    if (!gameJoined) return;
    const myPlayer = players[socket.id];
    if (myPlayer && myPlayer.hp <= 0 && !isSinglePlayer && !isOfflineSinglePlayer) {
        socket.emit('restart');
    }
});

// Main Loop
let players = {};
let projectiles = [];
let zombies = [];
let items = [];
let walls = [];
let visualWallTiles = [];
let floors = [];
let flashOpacity = 0;
let currentWeapon = 'pistol';
let myScore = 0;

// Blood splatter particles
let bloodSplatters = [];
const MAX_BLOOD_SPLATTERS = isMobile ? 100 : 300; // Lower limit on mobile for performance

// Pre-rendered background canvas for performance
let backgroundCanvas = null;
let backgroundCtx = null;
let backgroundRendered = false;

// Muzzle flash effect
const muzzleFlashes = {}; // playerId -> timestamp
const MUZZLE_FLASH_DURATION = 80; // milliseconds

// Handle other players shooting (for muzzle flash)
socket.on('playerShot', (data) => {
    muzzleFlashes[data.playerId] = Date.now();
});

// Walk animation state
const walkAnimations = {}; // playerId -> { phase, lastX, lastY, dustTimer }
const WALK_BOB_SPEED = 0.4; // How fast the bob cycles
const WALK_BOB_AMOUNT = 2; // Pixels of vertical bob
const WALK_TILT_AMOUNT = 0.05; // Radians of body tilt

// Dust particles for walking
let dustParticles = [];
const MAX_DUST_PARTICLES = 50;

// Handle player death - create blood splatter
socket.on('playerDeath', (data) => {
    // Create blood particles at death location (with limit)
    for (let i = 0; i < 15 && bloodSplatters.length < MAX_BLOOD_SPLATTERS; i++) {
        bloodSplatters.push({
            x: data.x + (Math.random() - 0.5) * 40,
            y: data.y + (Math.random() - 0.5) * 40,
            size: Math.random() * 8 + 4,
            opacity: 1,
            createdAt: Date.now()
        });
    }

    // Add kill message to chat
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatMessage system';
    msgDiv.innerHTML = `💀 <span class="chatName">${escapeHtml(data.killerName)}</span> killed <span class="chatName">${escapeHtml(data.victimName)}</span>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Handle team game over (all players dead in multiplayer)
socket.on('teamGameOver', (data) => {
    // Update score and phase from server
    myScore = data.teamScore;
    currentPhase = data.phase;
    scoreToken = data.token; // Store token for score submission

    // Show game over screen for all players
    if (!isDead) {
        isDead = true;
        showGameOverScreen();
    }
});

// Zombie lunge tracking for visual effects
const zombieLunges = {}; // zombieId -> { startTime, x, y }
const ZOMBIE_LUNGE_VISUAL_DURATION = 250;

// Handle zombie lunge event
socket.on('zombieLunge', (data) => {
    zombieLunges[data.id] = {
        startTime: Date.now(),
        x: data.x,
        y: data.y
    };
    // Play a lunge sound effect
    playSound('zombieLunge');
});

// Assets - Player skins (pistol)
const playerSkins = {
    hitman1: new Image(),
    manBlue: new Image(),
    manBrown: new Image(),
    manOld: new Image(),
    robot1: new Image(),
    soldier1: new Image(),
    survivor1: new Image(),
    womanGreen: new Image(),
    zombie1: new Image()
};
playerSkins.hitman1.src = 'kenney_top-down-shooter/PNG/Hitman 1/hitman1_gun.png';
playerSkins.manBlue.src = 'kenney_top-down-shooter/PNG/Man Blue/manBlue_gun.png';
playerSkins.manBrown.src = 'kenney_top-down-shooter/PNG/Man Brown/manBrown_gun.png';
playerSkins.manOld.src = 'kenney_top-down-shooter/PNG/Man Old/manOld_gun.png';
playerSkins.robot1.src = 'kenney_top-down-shooter/PNG/Robot 1/robot1_gun.png';
playerSkins.soldier1.src = 'kenney_top-down-shooter/PNG/Soldier 1/soldier1_gun.png';
playerSkins.survivor1.src = 'kenney_top-down-shooter/PNG/Survivor 1/survivor1_gun.png';
playerSkins.womanGreen.src = 'kenney_top-down-shooter/PNG/Woman Green/womanGreen_gun.png';
playerSkins.zombie1.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_stand.png';

// Zombie weapon sprites
const zombieSprites = {
    none: new Image(),
    pistol: new Image(),
    machine_gun: new Image(),
    shotgun: new Image()
};
zombieSprites.none.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_stand.png';
zombieSprites.pistol.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_gun.png';
zombieSprites.machine_gun.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_machine.png';
zombieSprites.shotgun.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_silencer.png';

// Player skins with machine gun
const playerSkinsMachine = {
    hitman1: new Image(),
    manBlue: new Image(),
    manBrown: new Image(),
    manOld: new Image(),
    robot1: new Image(),
    soldier1: new Image(),
    survivor1: new Image(),
    womanGreen: new Image()
};
playerSkinsMachine.hitman1.src = 'kenney_top-down-shooter/PNG/Hitman 1/hitman1_machine.png';
playerSkinsMachine.manBlue.src = 'kenney_top-down-shooter/PNG/Man Blue/manBlue_machine.png';
playerSkinsMachine.manBrown.src = 'kenney_top-down-shooter/PNG/Man Brown/manBrown_machine.png';
playerSkinsMachine.manOld.src = 'kenney_top-down-shooter/PNG/Man Old/manOld_machine.png';
playerSkinsMachine.robot1.src = 'kenney_top-down-shooter/PNG/Robot 1/robot1_machine.png';
playerSkinsMachine.soldier1.src = 'kenney_top-down-shooter/PNG/Soldier 1/soldier1_machine.png';
playerSkinsMachine.survivor1.src = 'kenney_top-down-shooter/PNG/Survivor 1/survivor1_machine.png';
playerSkinsMachine.womanGreen.src = 'kenney_top-down-shooter/PNG/Woman Green/womanGreen_machine.png';

// Player skins with shotgun (using silencer sprite)
const playerSkinsShotgun = {
    hitman1: new Image(),
    manBlue: new Image(),
    manBrown: new Image(),
    manOld: new Image(),
    robot1: new Image(),
    soldier1: new Image(),
    survivor1: new Image(),
    womanGreen: new Image()
};
playerSkinsShotgun.hitman1.src = 'kenney_top-down-shooter/PNG/Hitman 1/hitman1_silencer.png';
playerSkinsShotgun.manBlue.src = 'kenney_top-down-shooter/PNG/Man Blue/manBlue_silencer.png';
playerSkinsShotgun.manBrown.src = 'kenney_top-down-shooter/PNG/Man Brown/manBrown_silencer.png';
playerSkinsShotgun.manOld.src = 'kenney_top-down-shooter/PNG/Man Old/manOld_silencer.png';
playerSkinsShotgun.robot1.src = 'kenney_top-down-shooter/PNG/Robot 1/robot1_silencer.png';
playerSkinsShotgun.soldier1.src = 'kenney_top-down-shooter/PNG/Soldier 1/soldier1_silencer.png';
playerSkinsShotgun.survivor1.src = 'kenney_top-down-shooter/PNG/Survivor 1/survivor1_silencer.png';
playerSkinsShotgun.womanGreen.src = 'kenney_top-down-shooter/PNG/Woman Green/womanGreen_silencer.png';

// Item chest sprite
const chestSprite = new Image();
chestSprite.src = 'kenney_top-down-shooter/PNG/Tiles/tile_129.png';

const grassImg = new Image();
grassImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_01.png';

const woodFloorImg = new Image();
woodFloorImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_46.png';

const bathroomFloorImg = new Image();
bathroomFloorImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_11.png';

// Wall tiles for different positions
const wallTiles = {
    nw_corner: new Image(),      // tile_109 - northwest corner
    ne_corner: new Image(),      // tile_110 - northeast corner
    horizontal: new Image(),     // tile_111 - straight horizontal
    separator_down: new Image(), // tile_112 - separator extends left/right/down
    separator_up: new Image(),   // tile_113 - separator extends left/right/up
    end_right: new Image(),      // tile_114 - wall ends at right
    end_down: new Image(),       // tile_115 - wall ends at down
    tl_corner: new Image(),      // tile_116 - top left corner
    tr_corner: new Image(),      // tile_117 - top right corner
    glass_vertical: new Image(), // tile_489 - vertical glass window
    glass_horizontal: new Image() // tile_490 - horizontal glass window
};
wallTiles.nw_corner.src = 'kenney_top-down-shooter/PNG/Tiles/tile_109.png';
wallTiles.ne_corner.src = 'kenney_top-down-shooter/PNG/Tiles/tile_110.png';
wallTiles.horizontal.src = 'kenney_top-down-shooter/PNG/Tiles/tile_111.png';
wallTiles.separator_down.src = 'kenney_top-down-shooter/PNG/Tiles/tile_112.png';
wallTiles.separator_up.src = 'kenney_top-down-shooter/PNG/Tiles/tile_113.png';
wallTiles.end_right.src = 'kenney_top-down-shooter/PNG/Tiles/tile_114.png';
wallTiles.end_down.src = 'kenney_top-down-shooter/PNG/Tiles/tile_115.png';
wallTiles.tl_corner.src = 'kenney_top-down-shooter/PNG/Tiles/tile_116.png';
wallTiles.tr_corner.src = 'kenney_top-down-shooter/PNG/Tiles/tile_117.png';
wallTiles.glass_vertical.src = 'kenney_top-down-shooter/PNG/Tiles/tile_487.png';
wallTiles.glass_horizontal.src = 'kenney_top-down-shooter/PNG/Tiles/tile_514.png';

// Default wall image (for collision rectangles that aren't rendered with specific tiles)
const wallImg = new Image();
wallImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_111.png';

// Decoration tiles
const decorationTiles = {
    couch_green_left: new Image(),
    couch_green_right: new Image(),
    couch_teal: new Image(),
    table_round: new Image(),
    rug: new Image(),
    plant: new Image(),
    bush: new Image(),
    crate: new Image(),
    kitchen_323: new Image(),
    kitchen_324: new Image(),
    kitchen_268: new Image(),
    kitchen_shelf: new Image()
};
decorationTiles.couch_green_left.src = 'kenney_top-down-shooter/PNG/Tiles/tile_181.png';
decorationTiles.couch_green_right.src = 'kenney_top-down-shooter/PNG/Tiles/tile_182.png';
decorationTiles.couch_teal.src = 'kenney_top-down-shooter/PNG/Tiles/tile_131.png';
decorationTiles.table_round.src = 'kenney_top-down-shooter/PNG/Tiles/tile_132.png';
decorationTiles.rug.src = 'kenney_top-down-shooter/PNG/Tiles/tile_156.png';
decorationTiles.plant.src = 'kenney_top-down-shooter/PNG/Tiles/tile_183.png';
decorationTiles.bush.src = 'kenney_top-down-shooter/PNG/Tiles/tile_183.png';
decorationTiles.crate.src = 'kenney_top-down-shooter/PNG/Tiles/tile_129.png';
decorationTiles.kitchen_323.src = 'kenney_top-down-shooter/PNG/Tiles/tile_323.png';
decorationTiles.kitchen_324.src = 'kenney_top-down-shooter/PNG/Tiles/tile_324.png';
decorationTiles.kitchen_268.src = 'kenney_top-down-shooter/PNG/Tiles/tile_268.png';
decorationTiles.kitchen_shelf.src = 'kenney_top-down-shooter/PNG/Tiles/tile_321.png';

// Item sprites
const itemSprites = {
    machine_gun: new Image(),
    shotgun: new Image(),
    health: new Image()
};
itemSprites.machine_gun.src = 'kenney_top-down-shooter/PNG/weapon_machine.png';
itemSprites.shotgun.src = 'kenney_top-down-shooter/PNG/weapon_silencer.png';
itemSprites.health.src = 'kenney_top-down-shooter/PNG/Tiles/tile_129.png'; // Crate for health

let decorations = [];

// Pre-render static background (grass, floors, walls, decorations) for performance
function renderStaticBackground() {
    const MAP_WIDTH = 2000;
    const MAP_HEIGHT = 1200;
    const TILE_SIZE = 64;

    // Create offscreen canvas
    backgroundCanvas = document.createElement('canvas');
    backgroundCanvas.width = MAP_WIDTH;
    backgroundCanvas.height = MAP_HEIGHT;
    backgroundCtx = backgroundCanvas.getContext('2d');

    // Draw grass tiles
    if (grassImg.complete) {
        for (let x = 0; x < MAP_WIDTH; x += TILE_SIZE) {
            for (let y = 0; y < MAP_HEIGHT; y += TILE_SIZE) {
                backgroundCtx.drawImage(grassImg, x, y, TILE_SIZE, TILE_SIZE);
            }
        }
    } else {
        backgroundCtx.fillStyle = '#4a9';
        backgroundCtx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    // Draw floors
    for (const floor of floors) {
        let floorImg;
        if (floor.tile === 'wood') floorImg = woodFloorImg;
        else if (floor.tile === 'bathroom') floorImg = bathroomFloorImg;

        if (floorImg && floorImg.complete) {
            for (let x = floor.x; x < floor.x + floor.w; x += TILE_SIZE) {
                for (let y = floor.y; y < floor.y + floor.h; y += TILE_SIZE) {
                    const drawW = Math.min(TILE_SIZE, floor.x + floor.w - x);
                    const drawH = Math.min(TILE_SIZE, floor.y + floor.h - y);
                    backgroundCtx.drawImage(floorImg, 0, 0, drawW, drawH, x, y, drawW, drawH);
                }
            }
        } else {
            backgroundCtx.fillStyle = floor.tile === 'bathroom' ? '#8BA9A5' : '#c89f65';
            backgroundCtx.fillRect(floor.x, floor.y, floor.w, floor.h);
        }
    }

    // Draw walls using visual wall tiles
    for (const wt of visualWallTiles) {
        const img = wallTiles[wt.tile];
        if (img && img.complete) {
            if (wt.rotate) {
                // Draw with rotation
                backgroundCtx.save();
                backgroundCtx.translate(wt.x + TILE_SIZE / 2, wt.y + TILE_SIZE / 2);
                backgroundCtx.rotate(wt.rotate * Math.PI / 180);
                backgroundCtx.drawImage(img, -TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE);
                backgroundCtx.restore();
            } else {
                backgroundCtx.drawImage(img, wt.x, wt.y, TILE_SIZE, TILE_SIZE);
            }
        } else {
            backgroundCtx.fillStyle = '#333';
            backgroundCtx.fillRect(wt.x, wt.y, TILE_SIZE, TILE_SIZE);
        }
    }

    // Draw decorations
    for (const deco of decorations) {
        const img = decorationTiles[deco.tile];
        if (img && img.complete) {
            if (deco.rotate) {
                backgroundCtx.save();
                backgroundCtx.translate(deco.x + deco.w / 2, deco.y + deco.h / 2);
                backgroundCtx.rotate(deco.rotate * Math.PI / 180);
                backgroundCtx.drawImage(img, -deco.w / 2, -deco.h / 2, deco.w, deco.h);
                backgroundCtx.restore();
            } else {
                backgroundCtx.drawImage(img, deco.x, deco.y, deco.w, deco.h);
            }
        }
    }

    backgroundRendered = true;
}

// Ensure images are loaded before rendering background
function tryRenderBackground() {
    if (backgroundRendered) return;
    if (walls.length === 0 && floors.length === 0) return; // No map data yet

    // Check if essential images are loaded
    if (grassImg.complete && wallImg.complete && woodFloorImg.complete) {
        renderStaticBackground();
    }
}

socket.on('mapData', (data) => {
    walls = data.walls || [];
    floors = data.floors || [];
    decorations = data.decorations || [];
    visualWallTiles = data.wallTiles || [];
    backgroundRendered = false; // Reset to re-render with new map data
    tryRenderBackground();
});

socket.on('stateUpdate', (state) => {
    players = state.players;
    projectiles = state.projectiles;
    zombies = state.zombies || [];
    items = state.items || [];
    grenades = state.grenades || [];

    // Update team score (shared score in multiplayer)
    if (state.teamScore !== undefined) {
        myScore = state.teamScore;
    }

    // Update my weapon from server state
    const myPlayer = players[socket.id];
    if (myPlayer) {
        currentWeapon = myPlayer.weapon || 'pistol';
        myGrenades = myPlayer.grenades || 0;

        // Update score display with team score
        if (scoreDisplay) {
            scoreDisplay.textContent = `Score: ${myScore}`;
        }
    }
});

// Handle zombie death - create blood splatter
socket.on('zombieDeath', (data) => {
    for (let i = 0; i < 10 && bloodSplatters.length < MAX_BLOOD_SPLATTERS; i++) {
        bloodSplatters.push({
            x: data.x + (Math.random() - 0.5) * 30,
            y: data.y + (Math.random() - 0.5) * 30,
            size: Math.random() * 6 + 3,
            opacity: 1,
            createdAt: Date.now()
        });
    }
});

// Handle weapon pickup
socket.on('weaponPickup', (data) => {
    stopMachineGunSound(); // Stop if switching from machine gun
    currentWeapon = data.weapon;
    myAmmo = data.ammo || 0;
    const weaponName = data.weapon === 'machine_gun' ? 'Machine Gun' : 'Shotgun';

    // Update weapon display
    updateWeaponDisplay();

    // Show pickup message
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatMessage system';
    msgDiv.innerHTML = `🔫 Picked up ${weaponName} (${myAmmo} shots)!`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Handle ammo update
socket.on('ammoUpdate', (data) => {
    myAmmo = data.ammo;
    updateWeaponDisplay();
});

// Grenade events
socket.on('grenadePickup', (data) => {
    myGrenades = data.grenades;
    updateWeaponDisplay();
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatMessage system';
    msgDiv.innerHTML = `💣 Picked up a grenade! (${myGrenades} total)`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('grenadeUpdate', (data) => {
    myGrenades = data.grenades;
    updateWeaponDisplay();
});

socket.on('grenadeThrown', (data) => {
    // Add grenade to local rendering list
    grenades.push({
        id: data.id,
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy
    });
});

socket.on('grenadeExplode', (data) => {
    // Remove grenade and show explosion effect
    grenades = grenades.filter(g => !(Math.abs(g.x - data.x) < 20 && Math.abs(g.y - data.y) < 20));

    // Add explosion visual effect
    for (let i = 0; i < 20; i++) {
        const angle = (Math.PI * 2 * i) / 20;
        const dist = Math.random() * 100 + 50;
        bloodSplatters.push({
            x: data.x + Math.cos(angle) * dist * Math.random(),
            y: data.y + Math.sin(angle) * dist * Math.random(),
            size: Math.random() * 10 + 5,
            opacity: 1,
            createdAt: Date.now(),
            isExplosion: true
        });
    }
    playSound('grenadeExplode');
});

// Handle weapon change (when out of ammo)
socket.on('weaponChange', (data) => {
    stopMachineGunSound(); // Stop if switching from machine gun
    currentWeapon = data.weapon;
    myAmmo = data.ammo || 0;
    updateWeaponDisplay();

    if (data.weapon === 'pistol') {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chatMessage system';
        msgDiv.innerHTML = '⚠️ Out of ammo! Switched to Pistol';
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

function updateWeaponDisplay() {
    let displayText = '';
    let className = '';

    if (currentWeapon === 'machine_gun') {
        displayText = `🔫 Machine Gun (${myAmmo})`;
        className = 'machine_gun';
    } else if (currentWeapon === 'shotgun') {
        displayText = `🔫 Shotgun (${myAmmo})`;
        className = 'shotgun';
    } else {
        displayText = '🔫 Pistol ∞';
        className = '';
    }

    // Add grenade count if player has any
    if (myGrenades > 0) {
        displayText += ` | 💣 ${myGrenades}`;
    }

    if (weaponDisplay) {
        weaponDisplay.textContent = displayText;
        weaponDisplay.className = className;
    }
}

// Handle heal
socket.on('heal', (data) => {
    // Show heal message
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chatMessage system';
    msgDiv.innerHTML = `💚 +25 HP (${data.hp}/100)`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Handle game paused (from server/host)
socket.on('gamePaused', (data) => {
    isPaused = true;
    if (!isSinglePlayer && data.pausedBy !== socket.id) {
        // Another player (host) paused the game
        pauseMessage.textContent = 'Game Paused by Host';
        resumeBtn.style.display = 'none';
        pauseRestartBtn.style.display = 'none';
        pauseMainMenuBtn.style.display = 'block';
        pauseScreen.style.display = 'flex';
    }
});

// Handle game resumed
socket.on('gameResumed', () => {
    hidePauseMenu();
});

// Pause menu button handlers
resumeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOfflineSinglePlayer) {
        localGameState.isPaused = false;
        isPaused = false;
        hidePauseMenu();
    } else if (isSinglePlayer || isHost) {
        socket.emit('resumeGame');
    } else {
        // For joiners, just close the menu
        hidePauseMenu();
    }
});

pauseRestartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePauseMenu();
    if (isOfflineSinglePlayer) {
        localGameState.isPaused = false;
        isPaused = false;
        // Reset local game state
        localGameState = GameLogic.createGameState(localPlayerId, myName);
        players = localGameState.players;
        projectiles = localGameState.projectiles;
        zombies = localGameState.zombies;
        items = localGameState.items;
        bloodSplatters = [];
        dustParticles = [];
        isDead = false;
        myScore = 0;
        currentPhase = 1;
        currentWeapon = 'pistol';
        myAmmo = 0;
        scoreDisplay.textContent = 'Score: 0';
        phaseDisplay.textContent = 'Phase 1';
        updateWeaponDisplay();
    } else {
        socket.emit('resumeGame');
        socket.emit('restart');
    }
});

pauseMainMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePauseMenu();

    if (isOfflineSinglePlayer) {
        // Stop local game loop
        stopLocalGameLoop();
        localGameState = null;
    } else {
        if (isSinglePlayer || isHost) {
            socket.emit('resumeGame');
        }
        socket.emit('leaveRoom');
    }

    // Reset Client State
    gameScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    modeButtons.style.display = 'flex';
    roomSection.style.display = 'none';

    currentRoomId = null;
    gameJoined = false;
    isDead = false;
    isHost = false;
    myScore = 0;
    currentPhase = 1;
    currentWeapon = 'pistol';
    myAmmo = 0;
    scoreToken = null;
    scoreSubmitted = false;
    players = {};
    items = [];
    zombies = [];
    projectiles = [];
    bloodSplatters = [];
    dustParticles = [];
    isSinglePlayer = false;
    isOfflineSinglePlayer = false;
    isPaused = false;

    scoreDisplay.textContent = 'Score: 0';
    phaseDisplay.textContent = 'Phase 1';
    updateWeaponDisplay();
});

// Audio System
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// Zombie sounds
const zombieSounds = {
    hit: new Audio('sounds/454837__misterkidx__zombie_hit.wav'),
    roar: new Audio('sounds/144005__arrigd__zombie-roar-5.wav'),
    idle: [
        new Audio('sounds/163439__under7dude__zombie-2.wav'),
        new Audio('sounds/181372__l4red0__zombie_01.wav'),
        new Audio('sounds/445992__breviceps__zombie-gargles-3.wav')
    ]
};

// Synthesized gun sounds using Web Audio API
function createNoiseBuffer() {
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    return buffer;
}

let noiseBuffer = null;
function getNoiseBuffer() {
    if (!noiseBuffer) noiseBuffer = createNoiseBuffer();
    return noiseBuffer;
}

function playPistolSound() {
    const now = audioCtx.currentTime;

    // Noise burst for the "crack"
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const noiseGain = audioCtx.createGain();
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    noiseFilter.Q.value = 1;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    noise.start(now);
    noise.stop(now + 0.08);

    // Low thump
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    oscGain.gain.setValueAtTime(0.5, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.1);
}

function playShotgunSound() {
    const now = audioCtx.currentTime;

    // Big noise burst
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const noiseGain = audioCtx.createGain();
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 800;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseGain.gain.setValueAtTime(0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.start(now);
    noise.stop(now + 0.15);

    // Deep bass thump
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
}

function playMachineGunSound() {
    const now = audioCtx.currentTime;

    // Short sharp noise
    const noise = audioCtx.createBufferSource();
    noise.buffer = getNoiseBuffer();
    const noiseGain = audioCtx.createGain();
    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 500;
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noiseGain.gain.setValueAtTime(0.4, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    noise.start(now);
    noise.stop(now + 0.05);

    // Quick punch
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
    osc.start(now);
    osc.stop(now + 0.04);
}

// Stub functions for compatibility (machine gun no longer needs start/stop)
function startMachineGunSound() { }
function stopMachineGunSound() { }

// Set volume for zombie sounds
zombieSounds.hit.volume = 0.3;
zombieSounds.roar.volume = 0.25;
zombieSounds.idle.forEach(s => s.volume = 0.15);

// Throttle zombie sounds to prevent audio spam
let lastZombieHitSound = 0;
let lastZombieRoarSound = 0;
let lastZombieIdleSound = 0;
const ZOMBIE_HIT_COOLDOWN = 100;   // ms between hit sounds
const ZOMBIE_ROAR_COOLDOWN = 3000; // ms between roar sounds
const ZOMBIE_IDLE_INTERVAL = 8000; // ms between idle sounds

function playZombieSound(type) {
    const now = Date.now();

    if (type === 'hit' && now - lastZombieHitSound > ZOMBIE_HIT_COOLDOWN) {
        lastZombieHitSound = now;
        zombieSounds.hit.volume = 0.2 + Math.random() * 0.2;
        zombieSounds.hit.playbackRate = 0.9 + Math.random() * 0.2;
        zombieSounds.hit.currentTime = 0;
        zombieSounds.hit.play().catch(() => { });
    } else if (type === 'roar' && now - lastZombieRoarSound > ZOMBIE_ROAR_COOLDOWN) {
        lastZombieRoarSound = now;
        zombieSounds.roar.volume = 0.2 + Math.random() * 0.15;
        zombieSounds.roar.currentTime = 0;
        zombieSounds.roar.play().catch(() => { });
    } else if (type === 'idle' && now - lastZombieIdleSound > ZOMBIE_IDLE_INTERVAL) {
        lastZombieIdleSound = now;
        const randomIdle = zombieSounds.idle[Math.floor(Math.random() * zombieSounds.idle.length)];
        randomIdle.volume = 0.1 + Math.random() * 0.1;
        randomIdle.currentTime = 0;
        randomIdle.play().catch(() => { });
    }
}

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (type === 'shoot') {
        const weapon = currentWeapon || 'pistol';

        if (weapon === 'machine_gun') {
            playMachineGunSound();
        } else if (weapon === 'shotgun') {
            playShotgunSound();
        } else {
            playPistolSound();
        }
        return;
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'hit') {
        // High pitched "link"
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'hurt') {
        // Low pitched "grunt"
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'zombieLunge') {
        // Aggressive rushing growl for zombie lunge
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(60, audioCtx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'grenadeExplode') {
        // Deep explosion sound with rumble
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);

        // Add a noise burst for the explosion crackle
        const noiseOsc = audioCtx.createOscillator();
        const noiseGain = audioCtx.createGain();
        noiseOsc.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        noiseOsc.type = 'square';
        noiseOsc.frequency.setValueAtTime(200, audioCtx.currentTime);
        noiseOsc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.3);
        noiseGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        noiseOsc.start();
        noiseOsc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'glassBreak') {
        // High pitched shattering glass sound
        osc.type = 'square';
        osc.frequency.setValueAtTime(2000, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.15);
        gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);

        // Add crackle for glass shards
        const crackle = audioCtx.createOscillator();
        const crackleGain = audioCtx.createGain();
        crackle.connect(crackleGain);
        crackleGain.connect(audioCtx.destination);
        crackle.type = 'sawtooth';
        crackle.frequency.setValueAtTime(3000, audioCtx.currentTime);
        crackle.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);
        crackleGain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        crackleGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        crackle.start();
        crackle.stop(audioCtx.currentTime + 0.1);
    }
}

socket.on('hurt', () => {
    flashOpacity = 0.6;
    playSound('hurt');
});

socket.on('hit', () => {
    playSound('hit');
});

// Zombie sound events
socket.on('zombieHit', () => {
    playZombieSound('hit');
});

socket.on('zombieRoar', () => {
    playZombieSound('roar');
});

function update() {
    const myId = isOfflineSinglePlayer ? localPlayerId : socket.id;
    const myPlayer = players[myId];

    let angle = 0;
    const now = Date.now();
    if (myPlayer) {
        // Throttled auto-aim update for mobile (only every AUTO_AIM_THROTTLE ms)
        const shouldUpdateAutoAim = isMobile && (now - lastAutoAimUpdate >= AUTO_AIM_THROTTLE);
        if (shouldUpdateAutoAim) {
            lastAutoAimUpdate = now;
            updateAutoAim();
        }

        // Update angle based on input
        if (isMobile && rightJoystickActive) {
            // Aiming/shooting: use aim direction
            angle = isManualAiming ? manualAimAngle : autoAimAngle;
        } else if (isMobile && leftJoystickActive && (joystickMovement.x !== 0 || joystickMovement.y !== 0)) {
            // Moving on mobile: face movement direction
            angle = Math.atan2(joystickMovement.y, joystickMovement.x);
        } else if (isMobile) {
            // Not moving or aiming: keep last angle
            angle = myPlayer.angle || 0;
        } else {
            // Desktop: use mouse
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const dx = mouse.x - centerX;
            const dy = mouse.y - centerY;
            angle = Math.atan2(dy, dx);
        }
    }

    // Trigger random zombie idle sounds when zombies are present
    if (zombies && zombies.length > 0) {
        playZombieSound('idle');
    }

    if (isOfflineSinglePlayer) {
        // Offline mode: update local game state directly
        if (myPlayer) {
            myPlayer.input = {
                up: keys.w,
                down: keys.s,
                left: keys.a,
                right: keys.d
            };
            myPlayer.angle = angle;
        }
    } else {
        // Online mode: send input to server
        socket.emit('playerInput', {
            up: keys.w,
            down: keys.s,
            left: keys.a,
            right: keys.d,
            angle: angle
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const myId = isOfflineSinglePlayer ? localPlayerId : socket.id;
    const myPlayer = players[myId];

    // Camera Transform
    ctx.save();
    if (myPlayer) {
        const camX = -myPlayer.x + canvas.width / 2;
        const camY = -myPlayer.y + canvas.height / 2;
        ctx.translate(camX, camY);
    }

    // Try to render background if not done yet
    tryRenderBackground();

    // Draw pre-rendered static background (grass, floors, walls, decorations) in one call
    if (backgroundRendered && backgroundCanvas) {
        ctx.drawImage(backgroundCanvas, 0, 0);
    } else {
        // Fallback: draw simple colored background if pre-render not ready
        ctx.fillStyle = '#4a9';
        ctx.fillRect(0, 0, 2000, 1200);
    }

    // Cover destroyed glass with floor
    if (localGameState && localGameState.destroyedGlass && localGameState.destroyedGlass.length > 0) {
        const glassPositions = GameLogic.glassTiles;
        if (glassPositions) {
            for (let i = 0; i < localGameState.destroyedGlass.length; i++) {
                const glassId = localGameState.destroyedGlass[i];
                for (let j = 0; j < glassPositions.length; j++) {
                    if (glassPositions[j].id === glassId) {
                        const glass = glassPositions[j];
                        if (woodFloorImg && woodFloorImg.complete) {
                            ctx.drawImage(woodFloorImg, glass.x, glass.y, glass.w, glass.h);
                        }
                        break;
                    }
                }
            }
        }
    }

    // Draw Blood Splatters (fade out - faster on mobile for performance)
    const now = Date.now();
    const bloodFadeTime = isMobile ? 4000 : 8000; // 4 seconds on mobile, 8 on desktop
    for (let i = bloodSplatters.length - 1; i >= 0; i--) {
        const blood = bloodSplatters[i];
        const age = now - blood.createdAt;
        // Explosions fade faster
        const fadeTime = blood.isExplosion ? 500 : bloodFadeTime;

        if (age > fadeTime) {
            bloodSplatters.splice(i, 1);
            continue;
        }

        const opacity = 1 - (age / fadeTime);

        if (blood.isExplosion) {
            // Orange/yellow explosion effect with larger size
            const explosionSize = blood.size || 80;
            const gradient = ctx.createRadialGradient(blood.x, blood.y, 0, blood.x, blood.y, explosionSize);
            gradient.addColorStop(0, `rgba(255, 200, 50, ${opacity})`);
            gradient.addColorStop(0.3, `rgba(255, 100, 0, ${opacity * 0.8})`);
            gradient.addColorStop(0.7, `rgba(200, 50, 0, ${opacity * 0.5})`);
            gradient.addColorStop(1, `rgba(100, 20, 0, 0)`);
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(blood.x, blood.y, explosionSize, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = `rgba(139, 0, 0, ${opacity * 0.8})`; // Dark red
            ctx.beginPath();
            ctx.arc(blood.x, blood.y, blood.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Draw and update dust particles (walking effect)
    for (let i = dustParticles.length - 1; i >= 0; i--) {
        const dust = dustParticles[i];

        // Update dust
        dust.x += dust.vx;
        dust.y += dust.vy;
        dust.life -= 0.03;
        dust.size *= 0.98;

        if (dust.life <= 0 || dust.size < 0.5) {
            dustParticles.splice(i, 1);
            continue;
        }

        // Draw dust
        ctx.fillStyle = `rgba(180, 160, 140, ${dust.life * dust.opacity})`;
        ctx.beginPath();
        ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Items
    for (const item of items) {
        // Draw a glowing circle under the item
        let glowColor;
        if (item.type === 'health') glowColor = 'rgba(0, 255, 100, 0.4)';
        else if (item.type === 'machine_gun') glowColor = 'rgba(255, 165, 0, 0.4)';
        else if (item.type === 'grenade') glowColor = 'rgba(100, 100, 100, 0.4)';
        else glowColor = 'rgba(255, 50, 50, 0.4)';

        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(item.x, item.y, 35, 0, Math.PI * 2);
        ctx.fill();

        // Draw the chest sprite
        if (chestSprite && chestSprite.complete) {
            const size = 48;
            ctx.drawImage(chestSprite, item.x - size / 2, item.y - size / 2, size, size);
        }

        // Draw label with background
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        const label = item.type === 'machine_gun' ? 'MACHINE GUN' :
            item.type === 'shotgun' ? 'SHOTGUN' :
                item.type === 'grenade' ? 'GRENADE' : 'HEALTH +25';

        // Text background
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(item.x - textWidth / 2 - 4, item.y + 28, textWidth + 8, 16);

        // Text
        ctx.fillStyle = item.type === 'health' ? '#2ecc71' :
            item.type === 'grenade' ? '#888' : '#f1c40f';
        ctx.fillText(label, item.x, item.y + 40);
    }

    // Draw Grenades (in-flight)
    for (const g of grenades) {
        ctx.save();
        ctx.translate(g.x, g.y);

        // Draw grenade body (olive green oval)
        ctx.fillStyle = '#556B2F';
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#3d4f22';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw pin/lever area
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(-3, -14, 6, 5);

        ctx.restore();
    }

    // Draw Zombies
    for (const zombie of zombies) {
        ctx.save();
        ctx.translate(zombie.x, zombie.y);
        ctx.rotate(zombie.angle);

        // Check if zombie is lunging for visual effect
        const lungeData = zombieLunges[zombie.id];
        let isLunging = false;
        let lungeProgress = 0;
        if (lungeData && Date.now() - lungeData.startTime < ZOMBIE_LUNGE_VISUAL_DURATION) {
            isLunging = true;
            lungeProgress = (Date.now() - lungeData.startTime) / ZOMBIE_LUNGE_VISUAL_DURATION;
        } else if (lungeData) {
            // Clean up old lunge data
            delete zombieLunges[zombie.id];
        }

        // Scale up during lunge
        if (isLunging) {
            const scale = 1 + Math.sin(lungeProgress * Math.PI) * 0.3; // Bulge out then back
            ctx.scale(scale, scale);
        }

        // Use correct sprite based on weapon
        const zombieSprite = zombieSprites[zombie.weapon || 'none'] || zombieSprites.none;
        if (zombieSprite && zombieSprite.complete) {
            ctx.drawImage(zombieSprite, -25, -20, 50, 40);

            // Add red tint overlay during lunge
            if (isLunging) {
                ctx.globalAlpha = 0.4 * Math.sin(lungeProgress * Math.PI);
                ctx.fillStyle = '#ff0000';
                ctx.fillRect(-25, -20, 50, 40);
                ctx.globalAlpha = 1;
            }
        } else {
            // Fallback green circle
            ctx.fillStyle = isLunging ? '#ff4444' : '#2ecc71';
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Zombie HP bar (armed zombies have 50 HP, regular have 30)
        const maxHP = zombie.weapon ? 50 : 30;
        ctx.fillStyle = '#333';
        ctx.fillRect(zombie.x - 15, zombie.y - 30, 30, 4);
        ctx.fillStyle = zombie.weapon ? '#e67e22' : '#e74c3c'; // Orange for armed, red for regular
        ctx.fillRect(zombie.x - 15, zombie.y - 30, 30 * (zombie.hp / maxHP), 4);

        // Draw target reticle if this zombie is the current target (mobile only)
        if (isMobile && currentTarget && currentTarget.id === zombie.id) {
            ctx.save();
            ctx.strokeStyle = isManualAiming ? '#e74c3c' : '#2ecc71';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            // Pulsing circle
            const pulse = Math.sin(Date.now() / 150) * 3 + 35;
            ctx.beginPath();
            ctx.arc(zombie.x, zombie.y, pulse, 0, Math.PI * 2);
            ctx.stroke();

            // Corner brackets
            ctx.setLineDash([]);
            const bracketSize = 12;
            const offset = 28;

            // Top-left
            ctx.beginPath();
            ctx.moveTo(zombie.x - offset, zombie.y - offset + bracketSize);
            ctx.lineTo(zombie.x - offset, zombie.y - offset);
            ctx.lineTo(zombie.x - offset + bracketSize, zombie.y - offset);
            ctx.stroke();

            // Top-right
            ctx.beginPath();
            ctx.moveTo(zombie.x + offset - bracketSize, zombie.y - offset);
            ctx.lineTo(zombie.x + offset, zombie.y - offset);
            ctx.lineTo(zombie.x + offset, zombie.y - offset + bracketSize);
            ctx.stroke();

            // Bottom-left
            ctx.beginPath();
            ctx.moveTo(zombie.x - offset, zombie.y + offset - bracketSize);
            ctx.lineTo(zombie.x - offset, zombie.y + offset);
            ctx.lineTo(zombie.x - offset + bracketSize, zombie.y + offset);
            ctx.stroke();

            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(zombie.x + offset - bracketSize, zombie.y + offset);
            ctx.lineTo(zombie.x + offset, zombie.y + offset);
            ctx.lineTo(zombie.x + offset, zombie.y + offset - bracketSize);
            ctx.stroke();

            ctx.restore();
        }
    }

    // Draw Grenade Throw Power Indicator (while charging)
    if (isChargingGrenade && grenadeChargeStart && myPlayer && myPlayer.hp > 0) {
        const chargeTime = Date.now() - grenadeChargeStart;
        const maxChargeTime = GameLogic?.CONSTANTS?.GRENADE_CHARGE_TIME || 1500;
        const chargePower = Math.min(1, chargeTime / maxChargeTime);

        // Calculate throw parameters
        const baseSpeed = GameLogic?.CONSTANTS?.GRENADE_SPEED || 12;
        const maxSpeed = GameLogic?.CONSTANTS?.GRENADE_SPEED_MAX || 24;
        const baseDist = GameLogic?.CONSTANTS?.GRENADE_MAX_DISTANCE || 350;
        const maxDist = GameLogic?.CONSTANTS?.GRENADE_MAX_DISTANCE_CHARGED || 700;

        const speed = baseSpeed + (maxSpeed - baseSpeed) * chargePower;
        const distance = baseDist + (maxDist - baseDist) * chargePower;

        // Draw trajectory line
        const startX = myPlayer.x;
        const startY = myPlayer.y;
        const endX = startX + Math.cos(myPlayer.angle) * distance;
        const endY = startY + Math.sin(myPlayer.angle) * distance;

        // Gradient line from player to target
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        const hue = 60 - chargePower * 60; // Yellow to Red as power increases
        gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
        gradient.addColorStop(0.5, `hsla(${hue}, 100%, 50%, 0.5)`);
        gradient.addColorStop(1, `hsla(${hue}, 100%, 50%, 0.2)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3 + chargePower * 3; // Line gets thicker with power
        ctx.setLineDash([10, 10]);
        ctx.lineDashOffset = -Date.now() / 50; // Animated dash

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.setLineDash([]); // Reset dash

        // Draw target circle at end
        ctx.beginPath();
        ctx.arc(endX, endY, 15 + chargePower * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 100%, 50%, 0.6)`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw power percentage near player
        ctx.save();
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(chargePower * 100)}%`, myPlayer.x, myPlayer.y - 40);
        ctx.restore();
    }

    // Draw Players
    for (const id in players) {
        const p = players[id];
        if (p.hp <= 0) continue; // Don't draw dead players

        // Initialize walk animation state for this player
        if (!walkAnimations[id]) {
            walkAnimations[id] = { phase: 0, lastX: p.x, lastY: p.y, dustTimer: 0 };
        }
        const walkAnim = walkAnimations[id];

        // Check if player is moving
        const dx = p.x - walkAnim.lastX;
        const dy = p.y - walkAnim.lastY;
        const isMoving = Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1;
        const moveSpeed = Math.sqrt(dx * dx + dy * dy);

        // Update walk animation phase
        if (isMoving) {
            walkAnim.phase += WALK_BOB_SPEED * (moveSpeed / 3);
            walkAnim.dustTimer += moveSpeed;

            // Spawn dust particles
            if (walkAnim.dustTimer > 15 && dustParticles.length < MAX_DUST_PARTICLES) {
                dustParticles.push({
                    x: p.x - dx * 0.5 + (Math.random() - 0.5) * 10,
                    y: p.y - dy * 0.5 + (Math.random() - 0.5) * 10,
                    size: Math.random() * 4 + 2,
                    opacity: 0.4,
                    vx: -dx * 0.1 + (Math.random() - 0.5) * 0.5,
                    vy: -dy * 0.1 + (Math.random() - 0.5) * 0.5,
                    life: 1
                });
                walkAnim.dustTimer = 0;
            }
        } else {
            // Smoothly return to neutral
            walkAnim.phase *= 0.9;
        }

        walkAnim.lastX = p.x;
        walkAnim.lastY = p.y;

        // Calculate bob and tilt
        const bobOffset = Math.sin(walkAnim.phase) * WALK_BOB_AMOUNT * (isMoving ? 1 : 0);
        const tiltOffset = Math.sin(walkAnim.phase * 0.5) * WALK_TILT_AMOUNT * (isMoving ? 1 : 0);

        ctx.save();
        ctx.translate(p.x, p.y + bobOffset);
        ctx.rotate(p.angle + tiltOffset);

        // Draw Player Sprite using their assigned skin and weapon
        let spriteToUse;
        if (p.weapon === 'machine_gun' && playerSkinsMachine[p.skin]) {
            spriteToUse = playerSkinsMachine[p.skin];
        } else if (p.weapon === 'shotgun' && playerSkinsShotgun[p.skin]) {
            spriteToUse = playerSkinsShotgun[p.skin];
        } else {
            spriteToUse = playerSkins[p.skin] || playerSkins.hitman1;
        }
        ctx.drawImage(spriteToUse, -25, -20, 50, 40); // Centered approx

        // Draw Muzzle Flash
        const flashTime = muzzleFlashes[id];
        if (flashTime && Date.now() - flashTime < MUZZLE_FLASH_DURATION) {
            const flashProgress = (Date.now() - flashTime) / MUZZLE_FLASH_DURATION;
            const flashSize = 15 * (1 - flashProgress * 0.5); // Shrinks over time
            const flashOpacity = 1 - flashProgress;

            // Flash at gun muzzle position (front of player)
            ctx.save();
            ctx.translate(28, 0); // Muzzle is at front of gun

            // Outer glow
            const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, flashSize * 1.5);
            gradient.addColorStop(0, `rgba(255, 255, 200, ${flashOpacity})`);
            gradient.addColorStop(0.3, `rgba(255, 200, 50, ${flashOpacity * 0.8})`);
            gradient.addColorStop(0.6, `rgba(255, 100, 0, ${flashOpacity * 0.4})`);
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, flashSize * 1.5, 0, Math.PI * 2);
            ctx.fill();

            // Inner bright core
            ctx.fillStyle = `rgba(255, 255, 255, ${flashOpacity})`;
            ctx.beginPath();
            ctx.arc(0, 0, flashSize * 0.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();

        // Player Name
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(p.name || 'Player', p.x, p.y - 45);

        // HP Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(p.x - 20, p.y - 35, 40, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(p.x - 20, p.y - 35, 40 * (p.hp / 100), 5);

        // Chat Bubble (shows for 4 seconds)
        if (p.chatMessage && p.chatTime && (Date.now() - p.chatTime < 4000)) {
            const msg = p.chatMessage;
            ctx.font = '12px Arial';
            const textWidth = ctx.measureText(msg).width;
            const bubbleWidth = Math.min(textWidth + 16, 150);
            const bubbleHeight = 24;
            const bubbleX = p.x - bubbleWidth / 2;
            const bubbleY = p.y - 75;

            // Bubble background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
            ctx.fill();

            // Bubble tail (triangle pointing down)
            ctx.beginPath();
            ctx.moveTo(p.x - 6, bubbleY + bubbleHeight);
            ctx.lineTo(p.x + 6, bubbleY + bubbleHeight);
            ctx.lineTo(p.x, bubbleY + bubbleHeight + 8);
            ctx.closePath();
            ctx.fill();

            // Bubble border
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
            ctx.stroke();

            // Text
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.fillText(msg.length > 20 ? msg.substring(0, 20) + '...' : msg, p.x, bubbleY + 16);
        }
    }

    // Draw Projectiles
    for (const p of projectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        // Zombie projectiles are red/orange, player projectiles are white
        ctx.fillStyle = p.isZombieProjectile ? '#e74c3c' : '#fff';
        ctx.fill();
    }

    ctx.restore();

    // Off-screen zombie indicators
    const myIdForIndicators = isOfflineSinglePlayer ? localPlayerId : socket.id;
    const myPlayerForIndicators = players[myIdForIndicators];
    if (myPlayerForIndicators && myPlayerForIndicators.hp > 0) {
        const screenCenterX = canvas.width / 2;
        const screenCenterY = canvas.height / 2;
        const edgePadding = 50; // Distance from screen edge

        for (const zombie of zombies) {
            // Convert zombie world position to screen position relative to player
            const zombieScreenX = zombie.x - myPlayerForIndicators.x + screenCenterX;
            const zombieScreenY = zombie.y - myPlayerForIndicators.y + screenCenterY;

            // Check if zombie is off-screen
            const isOffScreen = zombieScreenX < -20 || zombieScreenX > canvas.width + 20 ||
                zombieScreenY < -20 || zombieScreenY > canvas.height + 20;

            if (isOffScreen) {
                // Calculate angle from center to zombie
                const dx = zombieScreenX - screenCenterX;
                const dy = zombieScreenY - screenCenterY;
                const angle = Math.atan2(dy, dx);

                // Calculate indicator position at screen edge
                let indicatorX, indicatorY;

                // Find intersection with screen edge
                const halfWidth = canvas.width / 2 - edgePadding;
                const halfHeight = canvas.height / 2 - edgePadding;

                const cos = Math.cos(angle);
                const sin = Math.sin(angle);

                // Check which edge the line intersects
                const tX = cos !== 0 ? Math.abs(halfWidth / cos) : Infinity;
                const tY = sin !== 0 ? Math.abs(halfHeight / sin) : Infinity;
                const t = Math.min(tX, tY);

                indicatorX = screenCenterX + cos * t;
                indicatorY = screenCenterY + sin * t;

                // Clamp to screen bounds
                indicatorX = Math.max(edgePadding, Math.min(canvas.width - edgePadding, indicatorX));
                indicatorY = Math.max(edgePadding, Math.min(canvas.height - edgePadding, indicatorY));

                // Draw red triangle pointing toward zombie
                ctx.save();
                ctx.translate(indicatorX, indicatorY);
                ctx.rotate(angle);

                // Triangle shape
                ctx.beginPath();
                ctx.moveTo(15, 0);      // Point
                ctx.lineTo(-8, -10);    // Top back
                ctx.lineTo(-8, 10);     // Bottom back
                ctx.closePath();

                // Fill with gradient for better visibility
                ctx.fillStyle = 'rgba(231, 76, 60, 0.9)';
                ctx.fill();
                ctx.strokeStyle = '#c0392b';
                ctx.lineWidth = 2;
                ctx.stroke();

                ctx.restore();
            }
        }
    }

    // Damage Flash Effect
    if (flashOpacity > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${flashOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashOpacity -= 0.05; // Fade out speed
        if (flashOpacity < 0) flashOpacity = 0;
    }

    if (myPlayer && myPlayer.hp <= 0 && gameJoined) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);

        // In multiplayer, show respawn prompt - game over only when all players die
        if (!isSinglePlayer && !isOfflineSinglePlayer) {
            ctx.font = '24px Arial';
            const isMobile = 'ontouchstart' in window;
            ctx.fillText(isMobile ? 'Tap anywhere to respawn' : 'Press R to respawn', canvas.width / 2, canvas.height / 2 + 50);
            restartBtn.style.display = isMobile ? 'none' : 'block';
        } else if (isOfflineSinglePlayer) {
            // Verified single player - submit for verification
            if (!isDead) {
                console.log('[Client] Player died in single player, calling verifyAndShowGameOver');
                isDead = true;
                verifyAndShowGameOver();
            }
        }
    } else {
        restartBtn.style.display = 'none';
    }
}

// Verify single player game and show game over
async function verifyAndShowGameOver() {
    console.log('[Client] verifyAndShowGameOver called');
    console.log('[Client] sessionId:', singlePlayerSessionId);
    console.log('[Client] inputLog size:', localGameState?.inputLog?.length);

    // Get final score directly from game state (myScore may not be updated yet)
    const player = localGameState?.players?.[localPlayerId];
    const finalScore = player ? player.score : myScore;
    const finalPhase = localGameState?.currentPhase || currentPhase;

    // Update myScore to match for consistency
    myScore = finalScore;
    currentPhase = finalPhase;

    finalScoreDisplay.textContent = `Score: ${finalScore}`;
    finalPhaseDisplay.textContent = `Phase Reached: ${finalPhase}`;

    // Show game over screen immediately with "verifying" state
    submitScoreSection.style.display = 'none';
    scoreSubmittedText.style.display = 'none';
    scoreSubmittedText.textContent = 'Verifying score...';
    scoreSubmittedText.style.display = 'block';
    scoreSubmitted = false;
    gameOverScreen.style.display = 'flex';

    // Submit for verification if we have a session
    if (singlePlayerSessionId && localGameState && localGameState.inputLog) {
        console.log('[Client] Submitting for verification - score:', finalScore, 'phase:', finalPhase);
        try {
            const response = await fetch('/api/singleplayer/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: singlePlayerSessionId,
                    inputLog: localGameState.inputLog,
                    finalScore: finalScore,
                    finalPhase: finalPhase,
                    name: myName
                })
            });

            const data = await response.json();

            console.log('[Client] Verification response:', data);
            if (response.ok && data.verified) {
                // Score verified! Store token and show submit option
                console.log('[Client] Verification SUCCESS, showing submit button');
                scoreToken = data.token;
                scoreSubmittedText.style.display = 'none';
                submitScoreSection.style.display = 'block';
            } else {
                // Verification failed
                console.log('[Client] Verification FAILED:', data.error);
                scoreSubmittedText.textContent = 'Score verification failed';
                console.error('Verification failed:', data.error);
            }
        } catch (err) {
            console.error('Verification error:', err);
            scoreSubmittedText.textContent = 'Verification error';
        }
    } else {
        scoreSubmittedText.textContent = 'No session - score not verified';
    }

    // Clear session ID
    singlePlayerSessionId = null;
}

function showGameOverScreen() {
    finalScoreDisplay.textContent = `Score: ${myScore}`;
    finalPhaseDisplay.textContent = `Phase Reached: ${currentPhase}`;

    // Reset submission UI - allow submission if we have a valid token
    if (scoreToken) {
        submitScoreSection.style.display = 'block';
    } else {
        submitScoreSection.style.display = 'none';
    }
    scoreSubmittedText.style.display = 'none';
    scoreSubmitted = false;

    gameOverScreen.style.display = 'flex';
}

// Submit score handler
submitScoreBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (scoreSubmitted) return;

    try {
        const response = await fetch('/api/highscores', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: myName,
                score: myScore,
                phase: currentPhase,
                token: scoreToken
            })
        });

        if (response.ok) {
            scoreSubmitted = true;
            submitScoreSection.style.display = 'none';
            scoreSubmittedText.textContent = 'Score submitted!';
            scoreSubmittedText.style.display = 'block';
            scoreToken = null; // Clear used token
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to submit score.');
        }
    } catch (err) {
        console.error('Error submitting score:', err);
        alert('Failed to submit score. Please try again.');
    }
});

// Play Again handler
playAgainBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    console.log('Play Again clicked');
    gameOverScreen.style.display = 'none';
    scoreSubmittedText.style.display = 'none'; // reset this
    isDead = false;
    myScore = 0;
    currentPhase = 1;
    currentWeapon = 'pistol'; // Reset weapon
    myAmmo = 0;
    scoreToken = null;
    scoreSubmitted = false;
    singlePlayerSessionId = null;

    // Update UI immediately (visual feedback)
    scoreDisplay.textContent = 'Score: 0';
    phaseDisplay.textContent = 'Phase 1';
    updateWeaponDisplay();

    if (isOfflineSinglePlayer) {
        // Verified single player: get new session from server
        try {
            const response = await fetch('/api/singleplayer/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName: myName })
            });

            if (response.ok) {
                const data = await response.json();
                singlePlayerSessionId = data.sessionId;
                localGameState = GameLogic.createGameState(localPlayerId, myName, data.seed);
            } else {
                // Fallback to random seed if server unavailable
                localGameState = GameLogic.createGameState(localPlayerId, myName);
            }
        } catch (err) {
            console.error('Failed to get new session:', err);
            localGameState = GameLogic.createGameState(localPlayerId, myName);
        }

        players = localGameState.players;
        projectiles = localGameState.projectiles;
        zombies = localGameState.zombies;
        items = localGameState.items;
        bloodSplatters = [];
        dustParticles = [];
    } else {
        // Tell server to restart me
        socket.emit('restart');
    }
});

// Main Menu handler
mainMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    if (isOfflineSinglePlayer) {
        // Stop local game loop
        stopLocalGameLoop();
        localGameState = null;
    } else {
        // Leave room on server
        socket.emit('leaveRoom');
    }

    // Reset Client State
    gameOverScreen.style.display = 'none';
    gameScreen.style.display = 'none';
    homeScreen.style.display = 'flex';
    modeButtons.style.display = 'flex';
    roomSection.style.display = 'none';

    currentRoomId = null;
    gameJoined = false;
    isDead = false;
    isHost = false;
    myScore = 0;
    currentPhase = 1;
    currentWeapon = 'pistol';
    myAmmo = 0;
    scoreToken = null;
    scoreSubmitted = false;
    singlePlayerSessionId = null;
    players = {};
    items = [];
    zombies = [];
    projectiles = [];
    bloodSplatters = [];
    dustParticles = [];
    isSinglePlayer = false;
    isOfflineSinglePlayer = false;
    isTrainingMode = false;
    isPaused = false;

    // Reset HUD
    scoreDisplay.textContent = 'Score: 0';
    phaseDisplay.textContent = 'Phase 1';
    updateWeaponDisplay();
});

// Add touch support for game over buttons (mobile compatibility)
playAgainBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    playAgainBtn.click();
});

mainMenuBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    mainMenuBtn.click();
});

submitScoreBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    submitScoreBtn.click();
});

// Share on X button
shareOnXBtn.addEventListener('click', () => {
    const score = myScore || 0;
    const phase = currentPhase || 1;
    const text = `I just scored ${score} points and reached phase ${phase} in Zombie Survival! Can you beat my score? 🧟🔫`;
    const url = 'https://zombiegame.net';
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
});

shareOnXBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    shareOnXBtn.click();
});

// Add touch support for pause buttons
resumeBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    resumeBtn.click();
});

pauseRestartBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    pauseRestartBtn.click();
});

pauseMainMenuBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    pauseMainMenuBtn.click();
});

// Helper function to handle shooting in both offline and online modes
function handleShoot() {
    // Trigger muzzle flash for local player
    const myId = isOfflineSinglePlayer ? localPlayerId : socket.id;
    muzzleFlashes[myId] = Date.now();

    if (isOfflineSinglePlayer) {
        // Offline mode: create projectile locally
        const player = localGameState.players[localPlayerId];
        if (player && player.hp > 0) {
            // Record shoot event for replay verification
            if (localGameState.inputLog) {
                localGameState.inputLog.push({
                    f: localGameState.frame,
                    s: 1 // shoot event
                });
            }
            const result = GameLogic.createProjectile(player, localGameState);
            for (const proj of result.projectiles) {
                localGameState.projectiles.push(proj);
            }
            if (result.weaponChanged) {
                stopMachineGunSound(); // Stop if switching from machine gun
                currentWeapon = result.newWeapon;
                myAmmo = 0;
                updateWeaponDisplay();
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chatMessage system';
                msgDiv.innerHTML = '⚠️ Out of ammo! Switched to Pistol';
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            } else if (player.weapon !== 'pistol') {
                myAmmo = player.ammo;
                updateWeaponDisplay();
            }
        }
    } else {
        // Online mode: emit to server
        socket.emit('shoot');
    }
}

// Local game loop interval for offline single player
let localGameLoopInterval = null;

function startLocalGameLoop() {
    if (localGameLoopInterval) {
        clearInterval(localGameLoopInterval);
    }

    // Event handlers for local game events
    const localEvents = {
        onHurt: (playerId) => {
            if (playerId === localPlayerId) {
                flashOpacity = 0.6;
                playSound('hurt');
            }
        },
        onHit: (playerId) => {
            if (playerId === localPlayerId) {
                playSound('hit');
            }
        },
        onZombieHit: () => {
            playZombieSound('hit');
        },
        onZombieDeath: (data) => {
            for (let i = 0; i < 10 && bloodSplatters.length < MAX_BLOOD_SPLATTERS; i++) {
                bloodSplatters.push({
                    x: data.x + (Math.random() - 0.5) * 30,
                    y: data.y + (Math.random() - 0.5) * 30,
                    size: Math.random() * 6 + 3,
                    opacity: 1,
                    createdAt: Date.now()
                });
            }
        },
        onPlayerDeath: (data) => {
            for (let i = 0; i < 15 && bloodSplatters.length < MAX_BLOOD_SPLATTERS; i++) {
                bloodSplatters.push({
                    x: data.x + (Math.random() - 0.5) * 40,
                    y: data.y + (Math.random() - 0.5) * 40,
                    size: Math.random() * 8 + 4,
                    opacity: 1,
                    createdAt: Date.now()
                });
            }
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chatMessage system';
            msgDiv.innerHTML = `💀 <span class="chatName">${escapeHtml(data.killerName)}</span> killed <span class="chatName">${escapeHtml(data.victimName)}</span>`;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            // Check if local player died - use verified game over for single player
            if (localGameState.players[localPlayerId].hp <= 0 && !isDead) {
                isDead = true;
                verifyAndShowGameOver();
            }
        },
        onZombieRoar: () => {
            playZombieSound('roar');
        },
        onZombieLunge: (zombieId, x, y) => {
            zombieLunges[zombieId] = {
                startTime: Date.now(),
                x: x,
                y: y
            };
            playSound('zombieLunge');
        },
        onPhaseChange: (data) => {
            currentPhase = data.phase;
            if (phaseDisplay) phaseDisplay.textContent = `Phase ${data.phase}`;
            showPhaseMessage(data.message);
        },
        onPhaseClear: (data) => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chatMessage system';
            msgDiv.innerHTML = `🎉 Phase ${data.phase} Clear! Time: ${data.timeSeconds}s | Bonus: +${data.totalBonus}`;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        },
        onHeal: (playerId, hp) => {
            if (playerId === localPlayerId) {
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chatMessage system';
                msgDiv.innerHTML = `❤️ Health restored! (${hp}/100)`;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        },
        onWeaponPickup: (playerId, data) => {
            if (playerId === localPlayerId) {
                stopMachineGunSound(); // Stop if switching from machine gun
                currentWeapon = data.weapon;
                myAmmo = data.ammo || 0;
                const weaponName = data.weapon === 'machine_gun' ? 'Machine Gun' : 'Shotgun';
                updateWeaponDisplay();
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chatMessage system';
                msgDiv.innerHTML = `🔫 Picked up ${weaponName} (${myAmmo} shots)!`;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        },
        onGrenadePickup: (playerId, grenadeCount) => {
            if (playerId === localPlayerId) {
                myGrenades = grenadeCount;
                updateWeaponDisplay();
                const msgDiv = document.createElement('div');
                msgDiv.className = 'chatMessage system';
                msgDiv.innerHTML = `💣 Picked up a grenade! (${myGrenades} total)`;
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        },
        onGrenadeExplode: (data) => {
            playSound('grenadeExplode');
            // Add visual explosion effect (main blast)
            bloodSplatters.push({
                x: data.x,
                y: data.y,
                size: 100,
                opacity: 1,
                createdAt: Date.now(),
                isExplosion: true
            });
            // Add smaller debris particles
            for (let i = 0; i < 15; i++) {
                const angle = (Math.PI * 2 * i) / 15;
                const dist = Math.random() * 80 + 30;
                bloodSplatters.push({
                    x: data.x + Math.cos(angle) * dist,
                    y: data.y + Math.sin(angle) * dist,
                    size: Math.random() * 30 + 20,
                    opacity: 1,
                    createdAt: Date.now(),
                    isExplosion: true
                });
            }
        },
        onGlassBreak: function (glass) {
            playSound('glassBreak');
        }
    };

    // Track last input state for delta encoding
    let lastRecordedInput = null;
    let lastRecordedAngle = null;

    // Run game logic at 60fps
    localGameLoopInterval = setInterval(() => {
        if (!localGameState || localGameState.isPaused) return;

        const now = Date.now();
        const player = localGameState.players[localPlayerId];

        // Record input if changed (delta encoding to save space)
        if (player && localGameState.inputLog) {
            const currentInput = player.input;
            const currentAngle = player.angle;

            // Check if input changed
            const inputChanged = !lastRecordedInput ||
                currentInput.up !== lastRecordedInput.up ||
                currentInput.down !== lastRecordedInput.down ||
                currentInput.left !== lastRecordedInput.left ||
                currentInput.right !== lastRecordedInput.right;

            // Check if angle changed significantly (more than 0.01 radians)
            const angleChanged = lastRecordedAngle === null ||
                Math.abs(currentAngle - lastRecordedAngle) > 0.01;

            if (inputChanged || angleChanged) {
                localGameState.inputLog.push({
                    f: localGameState.frame, // frame number
                    i: inputChanged ? {
                        u: currentInput.up ? 1 : 0,
                        d: currentInput.down ? 1 : 0,
                        l: currentInput.left ? 1 : 0,
                        r: currentInput.right ? 1 : 0
                    } : undefined,
                    a: angleChanged ? Math.round(currentAngle * 1000) / 1000 : undefined // 3 decimal precision
                });
                lastRecordedInput = { ...currentInput };
                lastRecordedAngle = currentAngle;
            }
        }

        // Increment frame counter
        localGameState.frame++;

        GameLogic.updateGameState(localGameState, now, localEvents);

        // Sync local state to render variables
        players = localGameState.players;
        projectiles = localGameState.projectiles;
        zombies = localGameState.zombies;
        items = localGameState.items;
        grenades = localGameState.grenades;

        // Update score and grenade display
        if (player) {
            myScore = player.score || 0;
            myGrenades = player.grenades || 0;
            if (scoreDisplay) {
                if (isTrainingMode) {
                    scoreDisplay.textContent = `X: ${Math.round(player.x)} Y: ${Math.round(player.y)}`;
                } else {
                    scoreDisplay.textContent = `Score: ${myScore}`;
                }
            }
            updateWeaponDisplay();
        }
    }, 1000 / 60);
}

function stopLocalGameLoop() {
    if (localGameLoopInterval) {
        clearInterval(localGameLoopInterval);
        localGameLoopInterval = null;
    }
}

function showPhaseMessage(message) {
    // Create a temporary phase message display
    const existingMsg = document.querySelector('.phase-message');
    if (existingMsg) existingMsg.remove();

    const msgEl = document.createElement('div');
    msgEl.className = 'phase-message';
    msgEl.style.cssText = 'position:fixed;top:20%;left:50%;transform:translateX(-50%);font-size:32px;font-weight:bold;color:#fff;text-shadow:2px 2px 4px #000;z-index:1000;pointer-events:none;';
    msgEl.textContent = message;
    document.body.appendChild(msgEl);

    setTimeout(() => msgEl.remove(), 3000);
}

function showGameOver() {
    const player = isOfflineSinglePlayer ? localGameState.players[localPlayerId] : players[socket.id];
    finalScoreDisplay.textContent = player ? player.score : 0;
    finalPhaseDisplay.textContent = currentPhase;
    myScore = player ? player.score : 0;

    gameOverScreen.style.display = 'flex';
    submitScoreSection.style.display = 'block';
    scoreSubmittedText.style.display = 'none';
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
