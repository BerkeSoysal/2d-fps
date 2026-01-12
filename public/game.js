const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

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
const multiPlayerBtn = document.getElementById('multiPlayerBtn');
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

// High Scores elements
const highScoresScreen = document.getElementById('highScoresScreen');
const highScoresBtn = document.getElementById('highScoresBtn');
const scoresBody = document.getElementById('scoresBody');
const backFromScoresBtn = document.getElementById('backFromScoresBtn');

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
let myAmmo = 0;
let isSinglePlayer = false;
let isPaused = false;

// Single Player
singlePlayerBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || 'Player';
    isSinglePlayer = true;
    socket.emit('startSinglePlayer', { playerName: myName });
});

// Multiplayer - show room list
multiPlayerBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim() || 'Player';
    if (!myName) {
        alert('Please enter your name first!');
        return;
    }
    isSinglePlayer = false;
    modeButtons.style.display = 'none';
    roomSection.style.display = 'block';
    socket.emit('getRooms');
});

backToMenuBtn.addEventListener('click', () => {
    modeButtons.style.display = 'flex';
    roomSection.style.display = 'none';
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
    const roomName = prompt('Enter room name:', `${myName}'s Room`);
    if (roomName) {
        socket.emit('createRoom', { playerName: myName, roomName: roomName });
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

// Input Handling
window.addEventListener('keydown', (e) => {
    if (!gameJoined || isChatting) return;
    if (e.key === 'w') keys.w = true;
    if (e.key === 'a') keys.a = true;
    if (e.key === 's') keys.s = true;
    if (e.key === 'd') keys.d = true;
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'w') keys.w = false;
    if (e.key === 'a') keys.a = false;
    if (e.key === 's') keys.s = false;
    if (e.key === 'd') keys.d = false;
});

// ESC key for pause menu
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && gameJoined && !isDead) {
        e.preventDefault();
        if (isPaused) {
            // Only host/single player can unpause
            if (isSinglePlayer || isHost) {
                socket.emit('resumeGame');
            }
        } else {
            // Show pause menu
            showPauseMenu();
        }
    }
});

function showPauseMenu() {
    if (isSinglePlayer) {
        // Single player - pause game
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
    socket.emit('shoot');
    playSound('shoot');

    // Auto-fire for machine gun
    if (currentWeapon === 'machine_gun') {
        autoFireInterval = setInterval(() => {
            if (isMouseDown && currentWeapon === 'machine_gun') {
                socket.emit('shoot');
                playSound('shoot');
            }
        }, 100); // Fire every 100ms
    }
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
    if (autoFireInterval) {
        clearInterval(autoFireInterval);
        autoFireInterval = null;
    }
});

// ==================== MOBILE TOUCH CONTROLS ====================

// Mobile detection
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

// Mobile control elements
const mobileControls = document.getElementById('mobileControls');
const leftJoystickZone = document.getElementById('leftJoystickZone');
const leftJoystickBase = document.getElementById('leftJoystickBase');
const leftJoystickKnob = document.getElementById('leftJoystickKnob');
const shootBtn = document.getElementById('shootBtn');

// Joystick state
let leftJoystickActive = false;
let leftJoystickCenter = { x: 0, y: 0 };
let leftJoystickTouchId = null;

// Movement from joystick
let joystickMovement = { x: 0, y: 0 };
let joystickAimAngle = 0;
let useJoystickAim = false;

// Shoot button state
let shootBtnTouchId = null;
let mobileAutoFireInterval = null;

// Joystick constants
const JOYSTICK_RADIUS = 60; // Base radius
const KNOB_MAX_DISTANCE = 45; // Max knob travel distance
const DEAD_ZONE = 0.15; // Dead zone for movement

// Single Joystick (Movement + Aim)
if (leftJoystickZone) {
    leftJoystickZone.addEventListener('touchstart', (e) => {
        if (!gameJoined) return;
        e.preventDefault();

        const touch = e.changedTouches[0];
        leftJoystickTouchId = touch.identifier;
        leftJoystickActive = true;
        leftJoystickCenter = { x: touch.clientX, y: touch.clientY };
        useJoystickAim = true;

        // Position and show joystick
        leftJoystickBase.style.left = touch.clientX + 'px';
        leftJoystickBase.style.top = touch.clientY + 'px';
        leftJoystickBase.classList.add('active');

        // Reset knob position
        leftJoystickKnob.style.transform = 'translate(-50%, -50%)';
    }, { passive: false });

    leftJoystickZone.addEventListener('touchmove', (e) => {
        if (!leftJoystickActive) return;
        e.preventDefault();

        // Find our specific touch
        let touch = null;
        for (let t of e.changedTouches) {
            if (t.identifier === leftJoystickTouchId) {
                touch = t;
                break;
            }
        }
        if (!touch) return;

        // Calculate offset from center
        const dx = touch.clientX - leftJoystickCenter.x;
        const dy = touch.clientY - leftJoystickCenter.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Clamp to max distance
        let clampedX = dx;
        let clampedY = dy;
        if (distance > KNOB_MAX_DISTANCE) {
            clampedX = (dx / distance) * KNOB_MAX_DISTANCE;
            clampedY = (dy / distance) * KNOB_MAX_DISTANCE;
        }

        // Move knob visually
        leftJoystickKnob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;

        // Calculate normalized movement (-1 to 1)
        const normalizedX = clampedX / KNOB_MAX_DISTANCE;
        const normalizedY = clampedY / KNOB_MAX_DISTANCE;

        // Apply dead zone
        joystickMovement.x = Math.abs(normalizedX) > DEAD_ZONE ? normalizedX : 0;
        joystickMovement.y = Math.abs(normalizedY) > DEAD_ZONE ? normalizedY : 0;

        // Update keys based on joystick direction
        keys.a = joystickMovement.x < -DEAD_ZONE;
        keys.d = joystickMovement.x > DEAD_ZONE;
        keys.w = joystickMovement.y < -DEAD_ZONE;
        keys.s = joystickMovement.y > DEAD_ZONE;

        // Calculate aim angle
        // Only update angle if moved past deadzone to avoid jumpy aim at center
        if (distance > 10) {
            joystickAimAngle = Math.atan2(dy, dx);
        }

    }, { passive: false });

    leftJoystickZone.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === leftJoystickTouchId) {
                leftJoystickActive = false;
                leftJoystickTouchId = null;
                leftJoystickBase.classList.remove('active');

                // Reset movement
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

// Shoot Button Logic
if (shootBtn) {
    shootBtn.addEventListener('touchstart', (e) => {
        if (!gameJoined) return;
        e.preventDefault();
        e.stopPropagation();

        shootBtnTouchId = e.changedTouches[0].identifier;

        // Fire immediately
        socket.emit('shoot');
        playSound('shoot');

        // Start auto-fire for machine gun
        if (currentWeapon === 'machine_gun') {
            mobileAutoFireInterval = setInterval(() => {
                if (shootBtnTouchId !== null && currentWeapon === 'machine_gun') {
                    socket.emit('shoot');
                    playSound('shoot');
                }
            }, 100);
        }
    }, { passive: false });

    shootBtn.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.identifier === shootBtnTouchId) {
                shootBtnTouchId = null;
                if (mobileAutoFireInterval) {
                    clearInterval(mobileAutoFireInterval);
                    mobileAutoFireInterval = null;
                }
                break;
            }
        }
    });

    shootBtn.addEventListener('touchcancel', (e) => {
        shootBtnTouchId = null;
        if (mobileAutoFireInterval) {
            clearInterval(mobileAutoFireInterval);
            mobileAutoFireInterval = null;
        }
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

// Main Loop
let players = {};
let projectiles = [];
let zombies = [];
let items = [];
let walls = [];
let floors = [];
let flashOpacity = 0;
let currentWeapon = 'pistol';
let myScore = 0;

// Blood splatter particles
let bloodSplatters = [];

// Handle player death - create blood splatter
socket.on('playerDeath', (data) => {
    // Create blood particles at death location
    for (let i = 0; i < 15; i++) {
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
bathroomFloorImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_496.png'; // Light blue/teal tile

const wallImg = new Image();
wallImg.src = 'kenney_top-down-shooter/PNG/Tiles/tile_109.png';

// Decoration tiles
const decorationTiles = {
    couch_green_left: new Image(),
    couch_green_right: new Image(),
    couch_teal: new Image(),
    table_round: new Image(),
    rug: new Image(),
    plant: new Image(),
    bush: new Image(),
    crate: new Image()
};
decorationTiles.couch_green_left.src = 'kenney_top-down-shooter/PNG/Tiles/tile_181.png';
decorationTiles.couch_green_right.src = 'kenney_top-down-shooter/PNG/Tiles/tile_182.png';
decorationTiles.couch_teal.src = 'kenney_top-down-shooter/PNG/Tiles/tile_131.png';
decorationTiles.table_round.src = 'kenney_top-down-shooter/PNG/Tiles/tile_132.png';
decorationTiles.rug.src = 'kenney_top-down-shooter/PNG/Tiles/tile_156.png';
decorationTiles.plant.src = 'kenney_top-down-shooter/PNG/Tiles/tile_183.png';
decorationTiles.bush.src = 'kenney_top-down-shooter/PNG/Tiles/tile_183.png';
decorationTiles.crate.src = 'kenney_top-down-shooter/PNG/Tiles/tile_129.png';

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

socket.on('mapData', (data) => {
    walls = data.walls || [];
    floors = data.floors || [];
    decorations = data.decorations || [];
});

socket.on('stateUpdate', (state) => {
    players = state.players;
    projectiles = state.projectiles;
    zombies = state.zombies || [];
    items = state.items || [];

    // Update my score and weapon from server state
    const myPlayer = players[socket.id];
    if (myPlayer) {
        myScore = myPlayer.score || 0;
        currentWeapon = myPlayer.weapon || 'pistol';

        // Update score display
        if (scoreDisplay) {
            scoreDisplay.textContent = `Score: ${myScore}`;
        }
    }
});

// Handle zombie death - create blood splatter
socket.on('zombieDeath', (data) => {
    for (let i = 0; i < 10; i++) {
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

// Handle weapon change (when out of ammo)
socket.on('weaponChange', (data) => {
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
    if (isSinglePlayer || isHost) {
        socket.emit('resumeGame');
    } else {
        // For joiners, just close the menu
        hidePauseMenu();
    }
});

pauseRestartBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePauseMenu();
    socket.emit('resumeGame');
    socket.emit('restart');
});

pauseMainMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hidePauseMenu();
    if (isSinglePlayer || isHost) {
        socket.emit('resumeGame');
    }
    socket.emit('leaveRoom');

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
    players = {};
    items = [];
    zombies = [];
    projectiles = [];
    isSinglePlayer = false;

    scoreDisplay.textContent = 'Score: 0';
    phaseDisplay.textContent = 'Phase 1';
    updateWeaponDisplay();
});

// Audio System
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    if (type === 'shoot') {
        // Gunshot sound - short noise burst
        const bufferSize = audioCtx.sampleRate * 0.1; // 100ms
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            // White noise with decay
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);

        // Low pass filter for more punch
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2000, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(500, audioCtx.currentTime + 0.1);

        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        noise.start();
        noise.stop(audioCtx.currentTime + 0.1);
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
    }
}

socket.on('hurt', () => {
    flashOpacity = 0.6;
    playSound('hurt');
});

socket.on('hit', () => {
    playSound('hit');
});

function update() {
    // Calculate angle relative to center of screen (assuming camera follows player, 
    // BUT for now this is a simple static map, so relative to player position IF we had camera.
    // However, without camera, we just send global mouse if we want, OR
    // if the requirement is "player in center", we need camera logic.
    // The request said "simple socket web game", let's assume static map for now or 
    // just client sends input, server updates world.

    // BUT wait, to aim correctly, we need to know WHERE the player is on screen.
    // If we just render the world as is, the player might move off screen.
    // Let's implement a simple camera that follows the current player.

    const myId = socket.id;
    const myPlayer = players[myId];

    let angle = 0;
    if (myPlayer) {
        // Use joystick aim if on mobile and joystick was used
        if (useJoystickAim) {
            angle = joystickAimAngle;
        } else {
            // Calculate angle from player center to mouse
            // Since we will center the player on screen:
            const centerX = canvas.width / 2;
            const centerY = canvas.height / 2;
            const dx = mouse.x - centerX;
            const dy = mouse.y - centerY;
            angle = Math.atan2(dy, dx);
        }
    }

    socket.emit('playerInput', {
        up: keys.w,
        down: keys.s,
        left: keys.a,
        right: keys.d,
        angle: angle
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const myId = socket.id;
    const myPlayer = players[myId];

    // Camera Transform
    ctx.save();
    if (myPlayer) {
        const camX = -myPlayer.x + canvas.width / 2;
        const camY = -myPlayer.y + canvas.height / 2;
        ctx.translate(camX, camY);
    }

    // Draw Grass Background (tiled)
    const TILE_SIZE = 64; // Kenney tiles are typically 64x64
    if (grassImg.complete) {
        for (let x = 0; x < 2000; x += TILE_SIZE) {
            for (let y = 0; y < 1200; y += TILE_SIZE) {
                ctx.drawImage(grassImg, x, y, TILE_SIZE, TILE_SIZE);
            }
        }
    } else {
        ctx.fillStyle = '#4a9'; // Fallback green
        ctx.fillRect(0, 0, 2000, 1200);
    }

    // Draw Floors (on top of grass)
    for (const floor of floors) {
        let floorImg;
        if (floor.tile === 'wood') {
            floorImg = woodFloorImg;
        } else if (floor.tile === 'bathroom') {
            floorImg = bathroomFloorImg;
        }

        if (floorImg && floorImg.complete) {
            // Tile the floor image
            for (let x = floor.x; x < floor.x + floor.w; x += TILE_SIZE) {
                for (let y = floor.y; y < floor.y + floor.h; y += TILE_SIZE) {
                    const drawW = Math.min(TILE_SIZE, floor.x + floor.w - x);
                    const drawH = Math.min(TILE_SIZE, floor.y + floor.h - y);
                    ctx.drawImage(floorImg, 0, 0, drawW, drawH, x, y, drawW, drawH);
                }
            }
        } else {
            // Fallback color
            ctx.fillStyle = floor.tile === 'bathroom' ? '#8BA9A5' : '#c89f65';
            ctx.fillRect(floor.x, floor.y, floor.w, floor.h);
        }
    }

    // Draw Blood Splatters (fade out over 8 seconds)
    const now = Date.now();
    for (let i = bloodSplatters.length - 1; i >= 0; i--) {
        const blood = bloodSplatters[i];
        const age = now - blood.createdAt;
        const fadeTime = 8000; // 8 seconds to fade

        if (age > fadeTime) {
            bloodSplatters.splice(i, 1);
            continue;
        }

        const opacity = 1 - (age / fadeTime);
        ctx.fillStyle = `rgba(139, 0, 0, ${opacity * 0.8})`; // Dark red
        ctx.beginPath();
        ctx.arc(blood.x, blood.y, blood.size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Draw Walls
    for (const wall of walls) {
        if (wallImg.complete) {
            // Tile wall image along wall segments
            for (let x = wall.x; x < wall.x + wall.w; x += TILE_SIZE) {
                for (let y = wall.y; y < wall.y + wall.h; y += TILE_SIZE) {
                    const drawW = Math.min(TILE_SIZE, wall.x + wall.w - x);
                    const drawH = Math.min(TILE_SIZE, wall.y + wall.h - y);
                    ctx.drawImage(wallImg, x, y, drawW, drawH);
                }
            }
        } else {
            ctx.fillStyle = '#333';
            ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        }
    }

    // Draw Decorations
    for (const deco of decorations) {
        const img = decorationTiles[deco.tile];
        if (img && img.complete) {
            ctx.drawImage(img, deco.x, deco.y, deco.w, deco.h);
        }
    }

    // Draw Items
    for (const item of items) {
        // Draw a glowing circle under the item
        let glowColor;
        if (item.type === 'health') glowColor = 'rgba(0, 255, 100, 0.4)';
        else if (item.type === 'machine_gun') glowColor = 'rgba(255, 165, 0, 0.4)';
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
            item.type === 'shotgun' ? 'SHOTGUN' : 'HEALTH +25';

        // Text background
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(item.x - textWidth / 2 - 4, item.y + 28, textWidth + 8, 16);

        // Text
        ctx.fillStyle = item.type === 'health' ? '#2ecc71' : '#f1c40f';
        ctx.fillText(label, item.x, item.y + 40);
    }

    // Draw Zombies
    for (const zombie of zombies) {
        ctx.save();
        ctx.translate(zombie.x, zombie.y);
        ctx.rotate(zombie.angle);

        // Use correct sprite based on weapon
        const zombieSprite = zombieSprites[zombie.weapon || 'none'] || zombieSprites.none;
        if (zombieSprite && zombieSprite.complete) {
            ctx.drawImage(zombieSprite, -25, -20, 50, 40);
        } else {
            // Fallback green circle
            ctx.fillStyle = '#2ecc71';
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
    }

    // Draw Players
    for (const id in players) {
        const p = players[id];
        if (p.hp <= 0) continue; // Don't draw dead players

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

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
    const myPlayerForIndicators = players[socket.id];
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

        // Show game over screen (only once)
        if (!isDead) {
            isDead = true;
            showGameOverScreen();
        }
    } else {
        restartBtn.style.display = 'none';
    }
}

function showGameOverScreen() {
    finalScoreDisplay.textContent = `Score: ${myScore}`;
    finalPhaseDisplay.textContent = `Phase Reached: ${currentPhase}`;

    // Reset submission UI
    submitScoreSection.style.display = 'block';
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
                phase: currentPhase
            })
        });

        if (response.ok) {
            scoreSubmitted = true;
            submitScoreSection.style.display = 'none';
            scoreSubmittedText.style.display = 'block';
        } else {
            alert('Failed to submit score. Please try again.');
        }
    } catch (err) {
        console.error('Error submitting score:', err);
        alert('Failed to submit score. Please try again.');
    }
});

// Play Again handler
playAgainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Play Again clicked');
    gameOverScreen.style.display = 'none';
    scoreSubmittedText.style.display = 'none'; // reset this
    isDead = false;
    myScore = 0;
    currentPhase = 1;
    currentWeapon = 'pistol'; // Reset weapon
    myAmmo = 0;

    // Update UI immediately (visual feedback)
    scoreDisplay.textContent = 'Score: 0';
    phaseDisplay.textContent = 'Phase 1';
    updateWeaponDisplay();

    // Tell server to restart me
    socket.emit('restart');
});

// Main Menu handler
mainMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    // Leave room on server
    socket.emit('leaveRoom');

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
    players = {};
    items = [];
    zombies = [];
    projectiles = [];
    isSinglePlayer = false;
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

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
