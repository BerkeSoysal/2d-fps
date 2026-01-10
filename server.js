const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const players = {};
const projectiles = [];
const SPEED = 5;
const PROJECTILE_SPEED = 10;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 2000;

// Simple walls for testing
const walls = [
  { x: 500, y: 500, w: 200, h: 50 },
  { x: 800, y: 300, w: 50, h: 400 },
  { x: 1200, y: 800, w: 300, h: 50 },
  { x: 200, y: 1200, w: 50, h: 500 },
  { x: 1500, y: 200, w: 200, h: 200 } // Big box
];

function checkWallCollision(x, y, radius) {
  for (const wall of walls) {
    // Simple AABB collision detection (Circle vs Rectangle approximation)
    // Treats player as a square of size radius*2 for simplicity or does circle-rect

    // Closest point on rectangle to circle center
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));

    const dx = x - closestX;
    const dy = y - closestY;

    if ((dx * dx + dy * dy) < (radius * radius)) {
      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('a user connected: ' + socket.id);

  // Send map data
  socket.emit('mapData', walls);

  let startX, startY;
  // Try to find a spawn point not in a wall
  let attempts = 0;
  do {
    startX = Math.random() * CANVAS_WIDTH;
    startY = Math.random() * CANVAS_HEIGHT;
    attempts++;
  } while (checkWallCollision(startX, startY, 20) && attempts < 100);

  players[socket.id] = {
    x: startX,
    y: startY,
    angle: 0,
    hp: 100,
    playerId: socket.id
  };

  io.emit('updatePlayers', players);

  socket.on('disconnect', () => {
    console.log('user disconnected');
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });

  socket.on('playerInput', (data) => {
    const player = players[socket.id];
    if (!player || player.hp <= 0) return;

    let newX = player.x;
    let newY = player.y;

    if (data.left) newX -= SPEED;
    if (data.right) newX += SPEED;
    if (data.up) newY -= SPEED;
    if (data.down) newY += SPEED;

    // Map Boundaries
    newX = Math.max(0, Math.min(CANVAS_WIDTH, newX));
    newY = Math.max(0, Math.min(CANVAS_HEIGHT, newY));

    // Wall Collision Logic
    // Check X axis movement
    if (!checkWallCollision(newX, player.y, 20)) {
      player.x = newX;
    }

    // Check Y axis movement (allows sliding if only one axis is blocked)
    // Re-calculate newX based on confirmed player.x to check Y independently 
    // is usually better for sliding, but here we just check if moving Y from current X implies collision
    if (!checkWallCollision(player.x, newY, 20)) {
      player.y = newY;
    }

    player.angle = data.angle;
  });

  socket.on('shoot', (data) => {
    const player = players[socket.id];
    if (!player || player.hp <= 0) return;

    projectiles.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * PROJECTILE_SPEED,
      vy: Math.sin(player.angle) * PROJECTILE_SPEED,
      ownerId: socket.id
    });
  });

  socket.on('restart', () => {
    const player = players[socket.id];
    if (player) {
      player.hp = 100;
      let rX, rY;
      let attempts = 0;
      do {
        rX = Math.random() * CANVAS_WIDTH;
        rY = Math.random() * CANVAS_HEIGHT;
        attempts++;
      } while (checkWallCollision(rX, rY, 20) && attempts < 100);

      player.x = rX;
      player.y = rY;
    }
  });
});

// Game Loop
setInterval(() => {
  // Update projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.x += p.vx;
    p.y += p.vy;

    // Remove if too far (simple boundary or lifetime)
    if (p.x < -1000 || p.x > 3000 || p.y < -1000 || p.y > 3000) {
      projectiles.splice(i, 1);
      continue;
    }

    // Wall Collision for Projectiles
    let hitWall = false;
    for (const wall of walls) {
      if (p.x >= wall.x && p.x <= wall.x + wall.w &&
        p.y >= wall.y && p.y <= wall.y + wall.h) {
        hitWall = true;
        break;
      }
    }
    if (hitWall) {
      projectiles.splice(i, 1);
      continue;
    }

    // Collision detection
    for (const id in players) {
      const player = players[id];
      if (p.ownerId !== id && player.hp > 0) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 20) { // Assume player radius is 20
          player.hp -= 10;
          projectiles.splice(i, 1);
          if (player.hp <= 0) {
            // Handle death if needed, for now just 0 hp
            player.hp = 0;
          }
          break;
        }
      }
    }
  }

  io.emit('stateUpdate', { players, projectiles });
}, 1000 / 60);

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
