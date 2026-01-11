const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

// Name Modal Handling
const nameModal = document.getElementById('nameModal');
const nameInput = document.getElementById('nameInput');
const joinBtn = document.getElementById('joinBtn');
const playerCountDisplay = document.getElementById('playerCount');

let myName = '';
let gameJoined = false;

joinBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Player';
    myName = name;
    socket.emit('setName', name);
    nameModal.style.display = 'none';
    gameJoined = true;
});

nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

// Player count update
socket.on('playerCount', (count) => {
    playerCountDisplay.textContent = `Players: ${count}`;
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

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mousedown', (e) => {
    if (!gameJoined) return;
    // Only shoot if we are not clicking the restart button
    if (e.target.id !== 'restartBtn' && e.target.id !== 'joinBtn') {
        socket.emit('shoot');
        playSound('shoot');
    }
});

const restartBtn = document.getElementById('restartBtn');
restartBtn.addEventListener('click', () => {
    socket.emit('restart');
    restartBtn.style.display = 'none';
});

// Main Loop
let players = {};
let projectiles = [];
let walls = [];
let floors = [];
let flashOpacity = 0;

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

// Assets - Player skins
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
playerSkins.zombie1.src = 'kenney_top-down-shooter/PNG/Zombie 1/zoimbie1_gun.png';

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

let decorations = [];

socket.on('mapData', (data) => {
    walls = data.walls || [];
    floors = data.floors || [];
    decorations = data.decorations || [];
});

socket.on('stateUpdate', (state) => {
    players = state.players;
    projectiles = state.projectiles;
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
        // Calculate angle from player center to mouse
        // Since we will center the player on screen:
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const dx = mouse.x - centerX;
        const dy = mouse.y - centerY;
        angle = Math.atan2(dy, dx);
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

    // Draw Players
    for (const id in players) {
        const p = players[id];
        if (p.hp <= 0) continue; // Don't draw dead players

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Draw Player Sprite using their assigned skin
        const spriteToUse = playerSkins[p.skin] || playerSkins.hitman1;
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
    ctx.fillStyle = '#fff';
    for (const p of projectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

    // Damage Flash Effect
    if (flashOpacity > 0) {
        ctx.fillStyle = `rgba(255, 0, 0, ${flashOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashOpacity -= 0.05; // Fade out speed
        if (flashOpacity < 0) flashOpacity = 0;
    }

    if (myPlayer && myPlayer.hp <= 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);

        restartBtn.style.display = 'block';
    } else {
        restartBtn.style.display = 'none';
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
