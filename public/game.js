const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});

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
    // Only shoot if we are not clicking the restart button
    if (e.target.id !== 'restartBtn') {
        socket.emit('shoot');
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

socket.on('mapData', (data) => {
    walls = data;
});

socket.on('stateUpdate', (state) => {
    players = state.players;
    projectiles = state.projectiles;
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

    // Draw Grid (Optional, for reference)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 2000; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 2000);
        ctx.stroke();
    }
    for (let y = 0; y <= 2000; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(2000, y);
        ctx.stroke();
    }

    // Draw Walls
    ctx.fillStyle = '#7f8c8d';
    for (const wall of walls) {
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        // Optional: Add border
        ctx.strokeStyle = '#95a5a6';
        ctx.lineWidth = 2;
        ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }

    // Draw Players
    for (const id in players) {
        const p = players[id];
        if (p.hp <= 0) continue; // Don't draw dead players

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Draw Circle (Body)
        ctx.fillStyle = id === myId ? '#00a8ff' : '#e056fd'; // Blue for me, Purple for others
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();

        // Draw Triangle (Pointer)
        ctx.fillStyle = '#f1c40f'; // Yellow pointer
        ctx.beginPath();
        ctx.moveTo(20, 0); // Tip matches radius
        ctx.lineTo(35, 0); // Stick out
        ctx.lineTo(20, 5);
        ctx.lineTo(20, -5);
        ctx.fill();

        ctx.restore();

        // HP Bar
        ctx.fillStyle = 'red';
        ctx.fillRect(p.x - 20, p.y - 35, 40, 5);
        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(p.x - 20, p.y - 35, 40 * (p.hp / 100), 5);
    }

    // Draw Projectiles
    ctx.fillStyle = '#fff';
    for (const p of projectiles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();

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
