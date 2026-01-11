const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const players = {};
const projectiles = [];
const SPEED = 5;
const PROJECTILE_SPEED = 18;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1200;

// Available player skins
const SKINS = [
  'hitman1',
  'manBlue',
  'manBrown',
  'manOld',
  'robot1',
  'soldier1',
  'survivor1',
  'womanGreen',
  'zombie1'
];

// Building layout - floors define areas with different tiles
const floors = [
  // Main living room (wooden floor)
  { x: 600, y: 400, w: 500, h: 400, tile: 'wood' },
  // Kitchen area (wooden floor)
  { x: 600, y: 800, w: 300, h: 200, tile: 'wood' },
  // Bathroom (tiled floor)
  { x: 1100, y: 400, w: 200, h: 200, tile: 'bathroom' },
  // Hallway
  { x: 900, y: 800, w: 200, h: 200, tile: 'wood' }
];

// Decorations (non-collision furniture, plants, etc.)
const decorations = [
  // Living room furniture
  { x: 620, y: 420, w: 64, h: 128, tile: 'couch_green_left', collidable: true },
  { x: 684, y: 420, w: 64, h: 128, tile: 'couch_green_right', collidable: true },
  { x: 800, y: 550, w: 64, h: 64, tile: 'table_round', collidable: true },
  { x: 980, y: 720, w: 64, h: 64, tile: 'rug' }, // Not collidable

  // Bathroom fixtures
  { x: 1150, y: 450, w: 64, h: 64, tile: 'plant' }, // Not collidable

  // Kitchen area
  { x: 620, y: 850, w: 64, h: 64, tile: 'table_round', collidable: true },
  { x: 700, y: 840, w: 128, h: 64, tile: 'couch_teal', collidable: true },

  // Outdoor plants (on grass) - collidable bushes
  { x: 400, y: 300, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 450, y: 350, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1400, y: 500, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1450, y: 600, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 300, y: 900, w: 64, h: 64, tile: 'bush', collidable: true },

  // Some crates outside - collidable
  { x: 1500, y: 300, w: 64, h: 64, tile: 'crate', collidable: true },
  { x: 1564, y: 300, w: 64, h: 64, tile: 'crate', collidable: true }
];

// Building walls (collision + visual)
const buildingWalls = [
  // Outer walls - Main room
  { x: 580, y: 380, w: 540, h: 20 }, // Top
  { x: 580, y: 380, w: 20, h: 440 }, // Left
  { x: 580, y: 800, w: 240, h: 20 }, // Bottom-left section
  { x: 880, y: 800, w: 240, h: 20 }, // Bottom-right section (gap for door)

  // Right side with bathroom
  { x: 1100, y: 380, w: 220, h: 20 }, // Top of bathroom
  { x: 1300, y: 380, w: 20, h: 240 }, // Right of bathroom
  { x: 1100, y: 600, w: 220, h: 20 }, // Bottom of bathroom

  // Connect main room to bathroom
  { x: 1100, y: 400, w: 20, h: 100 }, // Top divider
  { x: 1100, y: 550, w: 20, h: 70 }, // Bottom divider (gap for door)

  // Kitchen extension
  { x: 580, y: 820, w: 20, h: 200 }, // Left wall
  { x: 580, y: 1000, w: 340, h: 20 }, // Bottom wall
  { x: 900, y: 820, w: 20, h: 100 }, // Right divider
  { x: 1080, y: 820, w: 20, h: 200 }, // Far right
  { x: 900, y: 1000, w: 200, h: 20 } // Bottom right
];

function checkWallCollision(x, y, radius) {
  for (const wall of buildingWalls) {
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

// Check collision with collidable decorations (crates, bushes, etc.)
function checkDecorationCollision(x, y, radius = 15) {
  for (const deco of decorations) {
    if (!deco.collidable) continue;

    const closestX = Math.max(deco.x, Math.min(x, deco.x + deco.w));
    const closestY = Math.max(deco.y, Math.min(y, deco.y + deco.h));

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
  socket.emit('mapData', { floors, walls: buildingWalls, decorations });

  // Wait for player to set their name before spawning
  socket.on('setName', (name) => {
    let startX, startY;
    // Try to find a spawn point not in a wall
    let attempts = 0;
    do {
      startX = Math.random() * CANVAS_WIDTH;
      startY = Math.random() * CANVAS_HEIGHT;
      attempts++;
    } while (checkWallCollision(startX, startY, 20) && attempts < 100);

    // Assign random skin
    const skin = SKINS[Math.floor(Math.random() * SKINS.length)];

    players[socket.id] = {
      x: startX,
      y: startY,
      angle: 0,
      hp: 100,
      playerId: socket.id,
      name: name || 'Player',
      skin: skin
    };

    io.emit('updatePlayers', players);
    io.emit('playerCount', Object.keys(players).length);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
    delete players[socket.id];
    io.emit('playerCount', Object.keys(players).length);
    io.emit('updatePlayers', players);
  });

  // Chat message handling
  socket.on('chatMessage', (message) => {
    const player = players[socket.id];
    if (!player) return;

    // Sanitize and limit message
    const sanitizedMessage = String(message).substring(0, 50).trim();
    if (!sanitizedMessage) return;

    // Store message on player for bubble display
    player.chatMessage = sanitizedMessage;
    player.chatTime = Date.now();

    io.emit('chatMessage', {
      name: player.name,
      message: sanitizedMessage
    });
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

    // Wall and Decoration Collision Logic
    // Check X axis movement
    if (!checkWallCollision(newX, player.y, 20) && !checkDecorationCollision(newX, player.y, 15)) {
      player.x = newX;
    }

    // Check Y axis movement (allows sliding if only one axis is blocked)
    if (!checkWallCollision(player.x, newY, 20) && !checkDecorationCollision(player.x, newY, 15)) {
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
    for (const wall of buildingWalls) {
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

        if (dist < 20) {
          player.hp -= 10;
          io.to(id).emit('hurt'); // Notify victim
          io.to(p.ownerId).emit('hit'); // Notify attacker
          projectiles.splice(i, 1);
          if (player.hp <= 0) {
            player.hp = 0;
            // Emit death event for blood splatter
            io.emit('playerDeath', {
              x: player.x,
              y: player.y,
              killerName: players[p.ownerId]?.name || 'Unknown',
              victimName: player.name
            });
          }
          break;
        }
      }
    }
  }

  io.emit('stateUpdate', { players, projectiles });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
