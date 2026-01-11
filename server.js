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
const zombies = [];
const SPEED = 5;
const PROJECTILE_SPEED = 18;
const ZOMBIE_SPEED = 2;
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1200;

// Room system
const rooms = {};
let roomIdCounter = 0;

function createRoom(hostId, hostName, roomName) {
  const roomId = 'room_' + (++roomIdCounter);
  rooms[roomId] = {
    id: roomId,
    name: roomName || `${hostName}'s Room`,
    hostId: hostId,
    players: {},
    playerList: [{ id: hostId, name: hostName }],
    maxPlayers: 4,
    inProgress: false,
    // Game state
    projectiles: [],
    zombies: [],
    currentPhase: 1,
    zombiesSpawnedThisPhase: 0,
    zombiesKilledThisPhase: 0,
    phaseInProgress: false,
    zombieIdCounter: 0
  };
  return rooms[roomId];
}

function getRoomsList() {
  return Object.values(rooms)
    .filter(r => !r.inProgress && r.playerList.length < r.maxPlayers)
    .map(r => ({
      id: r.id,
      name: r.name,
      players: r.playerList.length,
      maxPlayers: r.maxPlayers
    }));
}

function getPlayerRoom(socketId) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[socketId] || rooms[roomId].playerList.find(p => p.id === socketId)) {
      return rooms[roomId];
    }
  }
  return null;
}

// Zombie spawning settings
const ZOMBIE_SPAWN_INTERVAL = 500; // Spawn every 0.5 seconds during phase
const ZOMBIE_HP = 30;
const BASE_ZOMBIE_SPEED = 2;
const BASE_SIGHT_RADIUS = 400;
let zombieIdCounter = 0;

// Phase/Wave System (for global/single player - will be moved to room later)
let currentPhase = 1;
let zombiesSpawnedThisPhase = 0;
let zombiesKilledThisPhase = 0;
let phaseInProgress = false;
const MAX_PHASE = 10;

function getPhaseZombieCount(phase) {
  return phase * 10; // Phase 1=10, Phase 2=20, ... Phase 10=100
}

function getZombieSpeed(phase) {
  return BASE_ZOMBIE_SPEED + (phase - 1) * 0.2; // +0.2 per phase
}

function getZombieSightRadius(phase) {
  return BASE_SIGHT_RADIUS + (phase - 1) * 20; // +20 per phase
}

// Item System
const ITEM_TYPES = [
  { type: 'health', chance: 0.4, value: 20 },
  { type: 'machine_gun', chance: 0.3 },
  { type: 'shotgun', chance: 0.3 }
];
const ITEM_SPAWN_INTERVAL = 8000; // Spawn item every 8 seconds
const MAX_ITEMS_ON_MAP = 5;
let items = [];
let itemIdCounter = 0;

// Available player skins (removed zombie1)
const SKINS = [
  'hitman1',
  'manBlue',
  'manBrown',
  'manOld',
  'robot1',
  'soldier1',
  'survivor1',
  'womanGreen'
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

// Raycast to check if zombie can see a player (not blocked by walls)
function canSeePlayer(zombie, player) {
  const dx = player.x - zombie.x;
  const dy = player.y - zombie.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Too far to see (uses phase-based sight radius)
  if (dist > getZombieSightRadius(currentPhase)) return false;

  // Step along the ray and check for wall collisions
  const steps = Math.floor(dist / 20);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = zombie.x + dx * t;
    const y = zombie.y + dy * t;

    // Check if this point is inside a wall
    if (checkWallCollision(x, y, 2)) {
      return false; // Wall blocks vision
    }
  }
  return true; // Can see the player
}

io.on('connection', (socket) => {
  console.log('a user connected: ' + socket.id);

  // Send map data
  socket.emit('mapData', { floors, walls: buildingWalls, decorations });

  // ===== ROOM SYSTEM EVENTS =====

  // Get available rooms
  socket.on('getRooms', () => {
    socket.emit('roomsList', getRoomsList());
  });

  // Create a new room
  socket.on('createRoom', (data) => {
    const room = createRoom(socket.id, data.playerName, data.roomName);
    socket.join(room.id);
    socket.emit('roomCreated', { roomId: room.id, room: room });
    io.emit('roomsList', getRoomsList()); // Update room list for all
  });

  // Join an existing room
  socket.on('joinRoom', (data) => {
    const room = rooms[data.roomId];
    if (!room) {
      socket.emit('joinError', 'Room not found');
      return;
    }
    if (room.inProgress) {
      socket.emit('joinError', 'Game already in progress');
      return;
    }
    if (room.playerList.length >= room.maxPlayers) {
      socket.emit('joinError', 'Room is full');
      return;
    }

    room.playerList.push({ id: socket.id, name: data.playerName });
    socket.join(room.id);
    socket.emit('roomJoined', { roomId: room.id, room: room });
    io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
    io.emit('roomsList', getRoomsList());
  });

  // Leave room
  socket.on('leaveRoom', () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;

    // Remove player from room
    room.playerList = room.playerList.filter(p => p.id !== socket.id);
    delete room.players[socket.id];
    socket.leave(room.id);

    // If host left, assign new host or delete room
    if (room.hostId === socket.id) {
      if (room.playerList.length > 0) {
        room.hostId = room.playerList[0].id;
      } else {
        delete rooms[room.id];
        io.emit('roomsList', getRoomsList());
        return;
      }
    }

    io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
    io.emit('roomsList', getRoomsList());
  });

  // Start the game (host only)
  socket.on('startGame', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;

    room.inProgress = true;

    // Spawn all players in the room
    for (const playerInfo of room.playerList) {
      let startX, startY;
      let attempts = 0;
      do {
        startX = Math.random() * CANVAS_WIDTH;
        startY = Math.random() * CANVAS_HEIGHT;
        attempts++;
      } while (checkWallCollision(startX, startY, 20) && attempts < 100);

      const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
      const playerData = {
        x: startX,
        y: startY,
        angle: 0,
        hp: 100,
        playerId: playerInfo.id,
        name: playerInfo.name,
        skin: skin,
        weapon: 'pistol',
        score: 0
      };

      // Add to both room players AND global players
      room.players[playerInfo.id] = playerData;
      players[playerInfo.id] = playerData;
    }

    io.to(room.id).emit('gameStarted', { roomId: room.id });
    io.to(room.id).emit('updatePlayers', players);
    io.to(room.id).emit('phaseChange', { phase: 1, message: 'Phase 1 Starting!' });
    io.emit('roomsList', getRoomsList());
    io.emit('playerCount', Object.keys(players).length);
  });

  // Single player - create private room and start immediately
  socket.on('startSinglePlayer', (data) => {
    const room = createRoom(socket.id, data.playerName, 'Single Player');
    room.isSinglePlayer = true;
    room.inProgress = true;
    socket.join(room.id);

    let startX, startY;
    let attempts = 0;
    do {
      startX = Math.random() * CANVAS_WIDTH;
      startY = Math.random() * CANVAS_HEIGHT;
      attempts++;
    } while (checkWallCollision(startX, startY, 20) && attempts < 100);

    const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
    const playerData = {
      x: startX,
      y: startY,
      angle: 0,
      hp: 100,
      playerId: socket.id,
      name: data.playerName,
      skin: skin,
      weapon: 'pistol',
      score: 0
    };

    // Add to both room players AND global players (for game loop compatibility)
    room.players[socket.id] = playerData;
    players[socket.id] = playerData;

    socket.emit('gameStarted', { roomId: room.id });
    socket.emit('updatePlayers', players);
    socket.emit('phaseChange', { phase: 1, message: 'Phase 1 Starting!' });
    io.emit('playerCount', Object.keys(players).length);
  });

  // ===== LEGACY GAME EVENTS (for compatibility) =====

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

    const weapon = player.weapon || 'pistol';

    if (weapon === 'shotgun') {
      // Shotgun: 5 projectiles with spread, short range (marked with maxDistance)
      const spreadAngles = [-0.2, -0.1, 0, 0.1, 0.2];
      for (const offset of spreadAngles) {
        const angle = player.angle + offset;
        projectiles.push({
          x: player.x,
          y: player.y,
          vx: Math.cos(angle) * PROJECTILE_SPEED,
          vy: Math.sin(angle) * PROJECTILE_SPEED,
          ownerId: socket.id,
          damage: 15,
          maxDistance: 200, // Short range
          startX: player.x,
          startY: player.y
        });
      }
    } else {
      // Pistol or Machine Gun: single projectile
      projectiles.push({
        x: player.x,
        y: player.y,
        vx: Math.cos(player.angle) * PROJECTILE_SPEED,
        vy: Math.sin(player.angle) * PROJECTILE_SPEED,
        ownerId: socket.id,
        damage: weapon === 'machine_gun' ? 8 : 10
      });
    }
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

    // Check max distance for shotgun projectiles
    if (p.maxDistance) {
      const traveledDist = Math.sqrt(
        Math.pow(p.x - p.startX, 2) + Math.pow(p.y - p.startY, 2)
      );
      if (traveledDist > p.maxDistance) {
        projectiles.splice(i, 1);
        continue;
      }
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

    // Check projectile vs zombie collision
    for (const zombie of zombies) {
      const dx = p.x - zombie.x;
      const dy = p.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 20) {
        const damage = p.damage || 10;
        zombie.hp -= damage;
        projectiles.splice(i, 1);

        if (zombie.hp <= 0) {
          // Zombie died - emit death event for blood
          io.emit('zombieDeath', { x: zombie.x, y: zombie.y });
          zombiesKilledThisPhase++; // Track kills for phase progression

          // Award score to the player who killed the zombie
          const killer = players[p.ownerId];
          if (killer) {
            killer.score = (killer.score || 0) + 10;
          }
        }
        break;
      }
    }
  }

  // Remove dead zombies
  for (let i = zombies.length - 1; i >= 0; i--) {
    if (zombies[i].hp <= 0) {
      zombies.splice(i, 1);
    }
  }

  // Move zombies towards their target player
  const playerIds = Object.keys(players).filter(id => players[id].hp > 0);
  for (const zombie of zombies) {
    // Find a visible player to chase
    let visibleTarget = null;

    // First check current target
    if (zombie.targetId && players[zombie.targetId] && players[zombie.targetId].hp > 0) {
      if (canSeePlayer(zombie, players[zombie.targetId])) {
        visibleTarget = players[zombie.targetId];
      }
    }

    // If current target not visible, look for any visible player
    if (!visibleTarget) {
      for (const id of playerIds) {
        if (canSeePlayer(zombie, players[id])) {
          visibleTarget = players[id];
          zombie.targetId = id;
          break;
        }
      }
    }

    if (visibleTarget) {
      // Can see a player - chase them!
      const dx = visibleTarget.x - zombie.x;
      const dy = visibleTarget.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const speed = zombie.speed || BASE_ZOMBIE_SPEED;
        zombie.x += (dx / dist) * speed;
        zombie.y += (dy / dist) * speed;
        zombie.angle = Math.atan2(dy, dx);
      }
      zombie.wandering = false;
    } else {
      // Can't see anyone - wander randomly
      if (!zombie.wandering || Math.random() < 0.02) {
        // Pick a new random direction occasionally
        zombie.wanderAngle = Math.random() * Math.PI * 2;
        zombie.wandering = true;
      }

      const speed = zombie.speed || BASE_ZOMBIE_SPEED;
      zombie.x += Math.cos(zombie.wanderAngle) * speed * 0.5;
      zombie.y += Math.sin(zombie.wanderAngle) * speed * 0.5;
      zombie.angle = zombie.wanderAngle;

      // Bounce off map edges
      if (zombie.x < 0 || zombie.x > CANVAS_WIDTH) zombie.wanderAngle = Math.PI - zombie.wanderAngle;
      if (zombie.y < 0 || zombie.y > CANVAS_HEIGHT) zombie.wanderAngle = -zombie.wanderAngle;
      zombie.x = Math.max(0, Math.min(CANVAS_WIDTH, zombie.x));
      zombie.y = Math.max(0, Math.min(CANVAS_HEIGHT, zombie.y));
    }

    // Check if zombie reached player (for damage)
    const target = visibleTarget || (zombie.targetId && players[zombie.targetId]);
    if (target && target.hp > 0) {
      const dx = target.x - zombie.x;
      const dy = target.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 25) {
        target.hp -= 10;
        io.to(zombie.targetId).emit('hurt');

        // Push zombie back a bit
        zombie.x -= (dx / dist) * 30;
        zombie.y -= (dy / dist) * 30;

        // Pick a new target
        zombie.targetId = playerIds[Math.floor(Math.random() * playerIds.length)];

        if (target.hp <= 0) {
          target.hp = 0;
          io.emit('playerDeath', {
            x: target.x,
            y: target.y,
            killerName: '🧟 Zombie',
            victimName: target.name
          });
        }
      }
    }
  }

  // Item Pickup Detection
  for (const id in players) {
    const player = players[id];
    if (player.hp <= 0) continue;

    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const dx = player.x - item.x;
      const dy = player.y - item.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 30) {
        // Pick up the item
        if (item.type === 'health') {
          player.hp = Math.min(100, player.hp + 20);
          io.to(id).emit('heal', { hp: player.hp });
        } else if (item.type === 'machine_gun') {
          player.weapon = 'machine_gun';
          io.to(id).emit('weaponPickup', { weapon: 'machine_gun' });
        } else if (item.type === 'shotgun') {
          player.weapon = 'shotgun';
          io.to(id).emit('weaponPickup', { weapon: 'shotgun' });
        }

        io.emit('itemCollected', { itemId: item.id, playerId: id, type: item.type });
        items.splice(i, 1);
      }
    }
  }

  io.emit('stateUpdate', { players, projectiles, zombies, items });
}, 1000 / 60);

// Spawn zombies at map edges - Phase based
setInterval(() => {
  // Only spawn if there are players alive
  const playerIds = Object.keys(players).filter(id => players[id].hp > 0);

  // Check if all players are dead - reset to phase 1
  if (playerIds.length === 0 && Object.keys(players).length > 0) {
    if (currentPhase > 1 || zombiesSpawnedThisPhase > 0) {
      currentPhase = 1;
      zombiesSpawnedThisPhase = 0;
      zombiesKilledThisPhase = 0;
      zombies.length = 0; // Clear all zombies
      phaseInProgress = false;
      io.emit('phaseChange', { phase: currentPhase, message: 'Game Over! Restarting...' });
    }
    return;
  }

  if (playerIds.length === 0) return;

  // Start phase if not in progress
  if (!phaseInProgress) {
    phaseInProgress = true;
    zombiesSpawnedThisPhase = 0;
    zombiesKilledThisPhase = 0;
    io.emit('phaseChange', { phase: currentPhase, message: `Phase ${currentPhase} Starting!` });
  }

  // Check if phase is complete (all zombies for this phase killed)
  const phaseZombieCount = getPhaseZombieCount(currentPhase);
  if (zombiesKilledThisPhase >= phaseZombieCount && zombies.length === 0) {
    // Phase complete!
    if (currentPhase < MAX_PHASE) {
      currentPhase++;
      zombiesSpawnedThisPhase = 0;
      zombiesKilledThisPhase = 0;
      io.emit('phaseChange', { phase: currentPhase, message: `Phase ${currentPhase} Starting!` });
    } else {
      io.emit('phaseChange', { phase: currentPhase, message: 'You Win! All phases complete!' });
      phaseInProgress = false;
      return;
    }
  }

  // Don't spawn more if we've spawned enough for this phase
  if (zombiesSpawnedThisPhase >= phaseZombieCount) return;

  // Limit active zombies on screen
  if (zombies.length >= 15) return;

  // Random edge: 0=top, 1=right, 2=bottom, 3=left
  const edge = Math.floor(Math.random() * 4);
  let x, y;

  switch (edge) {
    case 0: // Top
      x = Math.random() * CANVAS_WIDTH;
      y = -20;
      break;
    case 1: // Right
      x = CANVAS_WIDTH + 20;
      y = Math.random() * CANVAS_HEIGHT;
      break;
    case 2: // Bottom
      x = Math.random() * CANVAS_WIDTH;
      y = CANVAS_HEIGHT + 20;
      break;
    case 3: // Left
      x = -20;
      y = Math.random() * CANVAS_HEIGHT;
      break;
  }

  // Pick random target
  const targetId = playerIds[Math.floor(Math.random() * playerIds.length)];

  zombies.push({
    id: 'zombie_' + (++zombieIdCounter),
    x: x,
    y: y,
    angle: 0,
    hp: ZOMBIE_HP,
    targetId: targetId,
    speed: getZombieSpeed(currentPhase)
  });

  zombiesSpawnedThisPhase++;
}, ZOMBIE_SPAWN_INTERVAL);

// Item Spawning
setInterval(() => {
  // Only spawn if there are players and not too many items
  const playerIds = Object.keys(players).filter(id => players[id].hp > 0);
  if (playerIds.length === 0) return;
  if (items.length >= MAX_ITEMS_ON_MAP) return;

  // Random chance to spawn (not every interval)
  if (Math.random() > 0.5) return;

  // Pick a random item type based on chance
  const rand = Math.random();
  let cumulative = 0;
  let selectedType = ITEM_TYPES[0];

  for (const itemType of ITEM_TYPES) {
    cumulative += itemType.chance;
    if (rand <= cumulative) {
      selectedType = itemType;
      break;
    }
  }

  // Find a valid spawn position (not in walls)
  let x, y;
  let attempts = 0;
  do {
    x = 100 + Math.random() * (CANVAS_WIDTH - 200);
    y = 100 + Math.random() * (CANVAS_HEIGHT - 200);
    attempts++;
  } while (checkWallCollision(x, y, 20) && attempts < 50);

  if (attempts >= 50) return; // Couldn't find valid spot

  items.push({
    id: 'item_' + (++itemIdCounter),
    type: selectedType.type,
    x: x,
    y: y
  });

  console.log(`Spawned ${selectedType.type} at (${Math.round(x)}, ${Math.round(y)})`);
}, ITEM_SPAWN_INTERVAL);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
