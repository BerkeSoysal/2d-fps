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

// Global constants
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
    players: {}, // Map of socketId -> playerData
    playerList: [{ id: hostId, name: hostName }], // List of players for lobby
    maxPlayers: 4,
    inProgress: false,

    // Game state (isolated per room)
    projectiles: [],
    zombies: [],
    currentPhase: 1,
    zombiesSpawnedThisPhase: 0,
    zombiesKilledThisPhase: 0,
    phaseInProgress: false,
    zombieIdCounter: 0,

    // Helper to spawn zombies for this room
    lastZombieSpawnTime: 0
  };
  return rooms[roomId];
}

function getRoomsList() {
  return Object.values(rooms)
    .filter(r => !r.inProgress && r.playerList.length < r.maxPlayers && !r.isSinglePlayer)
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

// Available player skins
const SKINS = [
  'hitman1', 'manBlue', 'manBrown', 'manOld',
  'robot1', 'soldier1', 'survivor1', 'womanGreen'
];

// Building layout
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

const decorations = [
  // Living room furniture
  { x: 620, y: 420, w: 64, h: 128, tile: 'couch_green_left', collidable: true },
  { x: 684, y: 420, w: 64, h: 128, tile: 'couch_green_right', collidable: true },
  { x: 800, y: 550, w: 64, h: 64, tile: 'table_round', collidable: true },

  // Kitchen area
  { x: 620, y: 850, w: 64, h: 64, tile: 'table_round', collidable: true },
  { x: 700, y: 840, w: 128, h: 64, tile: 'couch_teal', collidable: true },

  // Outdoor plants - collidable bushes
  { x: 400, y: 300, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 450, y: 350, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1400, y: 500, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1450, y: 600, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 300, y: 900, w: 64, h: 64, tile: 'bush', collidable: true },

  // Some crates outside - collidable
  { x: 1500, y: 300, w: 64, h: 64, tile: 'crate', collidable: true },
  { x: 1564, y: 300, w: 64, h: 64, tile: 'crate', collidable: true }
];

function checkWallCollision(x, y, radius) {
  for (const wall of buildingWalls) {
    const closestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const closestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if ((dx * dx + dy * dy) < (radius * radius)) return true;
  }
  return false;
}

function checkDecorationCollision(x, y, radius = 15) {
  for (const deco of decorations) {
    if (!deco.collidable) continue;
    const closestX = Math.max(deco.x, Math.min(x, deco.x + deco.w));
    const closestY = Math.max(deco.y, Math.min(y, deco.y + deco.h));
    const dx = x - closestX;
    const dy = y - closestY;
    if ((dx * dx + dy * dy) < (radius * radius)) return true;
  }
  return false;
}

function canSeePlayer(zombie, player, phase) {
  const dx = player.x - zombie.x;
  const dy = player.y - zombie.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > getZombieSightRadius(phase)) return false;

  const steps = Math.floor(dist / 20);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = zombie.x + dx * t;
    const y = zombie.y + dy * t;
    if (checkWallCollision(x, y, 2)) return false;
  }
  return true;
}

// Find a safe spawn position
function getSafeSpawnPoint() {
  let startX, startY;
  let attempts = 0;
  do {
    startX = Math.random() * CANVAS_WIDTH;
    startY = Math.random() * CANVAS_HEIGHT;
    attempts++;
  } while ((checkWallCollision(startX, startY, 20) || checkDecorationCollision(startX, startY, 15)) && attempts < 100);
  return { x: startX, y: startY };
}

io.on('connection', (socket) => {
  console.log('a user connected: ' + socket.id);

  // Send map data
  // Using floors dummy data as it was in previous code but logic wasn't fully using it
  const floors = [
    { x: 600, y: 400, w: 500, h: 400, tile: 'wood' },
    { x: 600, y: 800, w: 300, h: 200, tile: 'wood' },
    { x: 1100, y: 400, w: 200, h: 200, tile: 'bathroom' },
    { x: 900, y: 800, w: 200, h: 200, tile: 'wood' }
  ];
  socket.emit('mapData', { floors, walls: buildingWalls, decorations });

  socket.on('getRooms', () => {
    socket.emit('roomsList', getRoomsList());
  });

  socket.on('createRoom', (data) => {
    const room = createRoom(socket.id, data.playerName, data.roomName);
    socket.join(room.id);
    socket.emit('roomCreated', { roomId: room.id, room: room });
    io.emit('roomsList', getRoomsList());
  });

  socket.on('joinRoom', (data) => {
    const room = rooms[data.roomId];
    if (!room || room.inProgress || room.playerList.length >= room.maxPlayers) {
      socket.emit('joinError', !room ? 'Room not found' : room.inProgress ? 'Game already in progress' : 'Room is full');
      return;
    }
    room.playerList.push({ id: socket.id, name: data.playerName });
    socket.join(room.id);
    socket.emit('roomJoined', { roomId: room.id, room: room });
    io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
    io.emit('roomsList', getRoomsList());
  });

  socket.on('leaveRoom', () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;

    room.playerList = room.playerList.filter(p => p.id !== socket.id);
    delete room.players[socket.id]; // Remove from game state if playing
    socket.leave(room.id);

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

  // START MULTIPLAYER GAME (HOST ONLY)
  socket.on('startGame', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    room.inProgress = true;

    // Initialize players
    for (const playerInfo of room.playerList) {
      const spawn = getSafeSpawnPoint();
      room.players[playerInfo.id] = {
        x: spawn.x, y: spawn.y, angle: 0, hp: 100,
        playerId: playerInfo.id, name: playerInfo.name,
        skin: SKINS[Math.floor(Math.random() * SKINS.length)]
      };
    }

    io.to(room.id).emit('gameStarted', { roomId: room.id });
    io.to(room.id).emit('updatePlayers', room.players);
    io.to(room.id).emit('phaseChange', { phase: 1, message: 'Phase 1 Starting!' });
    io.emit('roomsList', getRoomsList());
  });

  // START SINGLE PLAYER (DIRECT)
  socket.on('startSinglePlayer', (data) => {
    const room = createRoom(socket.id, data.playerName, 'Single Player');
    room.isSinglePlayer = true;
    room.inProgress = true;
    socket.join(room.id);

    const spawn = getSafeSpawnPoint();
    room.players[socket.id] = {
      x: spawn.x, y: spawn.y, angle: 0, hp: 100,
      playerId: socket.id, name: data.playerName,
      skin: SKINS[Math.floor(Math.random() * SKINS.length)]
    };

    socket.emit('gameStarted', { roomId: room.id });
    socket.emit('updatePlayers', room.players);
    socket.emit('phaseChange', { phase: 1, message: 'Phase 1 Starting!' });
  });

  socket.on('disconnect', () => {
    const room = getPlayerRoom(socket.id);
    if (room) {
      room.playerList = room.playerList.filter(p => p.id !== socket.id);
      delete room.players[socket.id];
      // If empty, delete room
      if (room.playerList.length === 0) {
        delete rooms[room.id];
      } else if (room.hostId === socket.id) {
        room.hostId = room.playerList[0].id; // Reassign host
        io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
      }
    }
    // No global broadcast needed as it's room specific, but might need to update room list
    io.emit('roomsList', getRoomsList());
  });

  socket.on('playerInput', (data) => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;

    const player = room.players[socket.id];
    if (!player || player.hp <= 0) return;

    let newX = player.x;
    let newY = player.y;
    if (data.left) newX -= SPEED;
    if (data.right) newX += SPEED;
    if (data.up) newY -= SPEED;
    if (data.down) newY += SPEED;

    newX = Math.max(0, Math.min(CANVAS_WIDTH, newX));
    newY = Math.max(0, Math.min(CANVAS_HEIGHT, newY));

    if (!checkWallCollision(newX, player.y, 20) && !checkDecorationCollision(newX, player.y, 15)) player.x = newX;
    if (!checkWallCollision(player.x, newY, 20) && !checkDecorationCollision(player.x, newY, 15)) player.y = newY;
    player.angle = data.angle;
  });

  socket.on('shoot', (data) => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;

    const player = room.players[socket.id];
    if (!player || player.hp <= 0) return;

    room.projectiles.push({
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * PROJECTILE_SPEED,
      vy: Math.sin(player.angle) * PROJECTILE_SPEED,
      ownerId: socket.id
    });
  });

  socket.on('restart', () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players[socket.id];
    if (player) {
      const spawn = getSafeSpawnPoint();
      player.hp = 100;
      player.x = spawn.x;
      player.y = spawn.y;
    }
  });

  // Chat message handling
  socket.on('chatMessage', (message) => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players[socket.id] || room.playerList.find(p => p.id === socket.id);
    if (!player) return;

    const sanitizedMessage = String(message).substring(0, 50).trim();
    if (!sanitizedMessage) return;

    // Use name from player list if not in game yet
    const name = player.name || 'Unknown';
    if (room.players[socket.id]) {
      room.players[socket.id].chatMessage = sanitizedMessage;
      room.players[socket.id].chatTime = Date.now();
    }

    io.to(room.id).emit('chatMessage', { name: name, message: sanitizedMessage });
  });
});

// === SERVER GAME LOOP ===
function updateRoom(room) {
  if (!room.inProgress) return;

  // 1. Projectiles
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const p = room.projectiles[i];
    p.x += p.vx;
    p.y += p.vy;

    // Bounds/Lifetime check
    if (p.x < -100 || p.x > CANVAS_WIDTH + 100 || p.y < -100 || p.y > CANVAS_HEIGHT + 100) {
      room.projectiles.splice(i, 1);
      continue;
    }

    // Projectile vs Walls
    let hitWall = false;
    for (const wall of buildingWalls) {
      if (p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
        hitWall = true; break;
      }
    }
    if (hitWall) {
      room.projectiles.splice(i, 1); continue;
    }

    // Projectile vs Players
    for (const id in room.players) {
      const player = room.players[id];
      if (p.ownerId !== id && player.hp > 0) {
        const dx = p.x - player.x;
        const dy = p.y - player.y;
        if ((dx * dx + dy * dy) < 400) { // 20^2
          player.hp -= 10;
          io.to(id).emit('hurt');
          io.to(p.ownerId).emit('hit');
          room.projectiles.splice(i, 1);
          if (player.hp <= 0) {
            player.hp = 0;
            io.to(room.id).emit('playerDeath', {
              x: player.x, y: player.y,
              killerName: room.players[p.ownerId]?.name || 'Unknown',
              victimName: player.name
            });
          }
          break;
        }
      }
    }
    // Projectile vs Zombies
    for (const zombie of room.zombies) {
      const dx = p.x - zombie.x;
      const dy = p.y - zombie.y;
      if ((dx * dx + dy * dy) < 400) {
        zombie.hp -= 10;
        room.projectiles.splice(i, 1);
        if (zombie.hp <= 0) {
          io.to(room.id).emit('zombieDeath', { x: zombie.x, y: zombie.y });
          room.zombiesKilledThisPhase++;
        }
        break;
      }
    }
  }

  // 2. Zombies Management
  // Remove dead zombies
  for (let i = room.zombies.length - 1; i >= 0; i--) {
    if (room.zombies[i].hp <= 0) room.zombies.splice(i, 1);
  }

  // Move Zombies
  const alivePlayerIds = Object.keys(room.players).filter(id => room.players[id].hp > 0);
  for (const zombie of room.zombies) {
    let visibleTarget = null;
    if (zombie.targetId && room.players[zombie.targetId] && room.players[zombie.targetId].hp > 0) {
      if (canSeePlayer(zombie, room.players[zombie.targetId], room.currentPhase)) {
        visibleTarget = room.players[zombie.targetId];
      }
    }
    if (!visibleTarget) {
      for (const id of alivePlayerIds) {
        if (canSeePlayer(zombie, room.players[id], room.currentPhase)) {
          visibleTarget = room.players[id];
          zombie.targetId = id;
          break;
        }
      }
    }

    if (visibleTarget) {
      const dx = visibleTarget.x - zombie.x;
      const dy = visibleTarget.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const speed = zombie.speed || getZombieSpeed(room.currentPhase);
        zombie.x += (dx / dist) * speed;
        zombie.y += (dy / dist) * speed;
        zombie.angle = Math.atan2(dy, dx);
      }
      zombie.wandering = false;

      // Attack logic
      const target = visibleTarget; // simple alias
      if (dist < 25) {
        target.hp -= 10;
        io.to(zombie.targetId).emit('hurt');
        zombie.x -= (dx / dist) * 30; // Knockback
        zombie.y -= (dy / dist) * 30;
        zombie.targetId = alivePlayerIds[Math.floor(Math.random() * alivePlayerIds.length)]; // Switch target
        if (target.hp <= 0) {
          target.hp = 0;
          io.to(room.id).emit('playerDeath', {
            x: target.x, y: target.y,
            killerName: '🧟 Zombie', victimName: target.name
          });
        }
      }
    } else {
      // Wander
      if (!zombie.wandering || Math.random() < 0.02) {
        zombie.wanderAngle = Math.random() * Math.PI * 2;
        zombie.wandering = true;
      }
      const speed = zombie.speed || getZombieSpeed(room.currentPhase);
      zombie.x += Math.cos(zombie.wanderAngle) * speed * 0.5;
      zombie.y += Math.sin(zombie.wanderAngle) * speed * 0.5;
      zombie.angle = zombie.wanderAngle;

      zombie.x = Math.max(0, Math.min(CANVAS_WIDTH, zombie.x));
      zombie.y = Math.max(0, Math.min(CANVAS_HEIGHT, zombie.y));
    }
  }

  // 3. Phase / Spawning Logic
  const now = Date.now();
  // Check for wipe
  if (alivePlayerIds.length === 0 && Object.keys(room.players).length > 0) {
    if (room.currentPhase > 1 || room.zombiesSpawnedThisPhase > 0) {
      room.currentPhase = 1;
      room.zombiesSpawnedThisPhase = 0;
      room.zombiesKilledThisPhase = 0;
      room.zombies.length = 0;
      room.phaseInProgress = false;
      io.to(room.id).emit('phaseChange', { phase: 1, message: 'Game Over! Restarting...' });
    }
  } else if (alivePlayerIds.length > 0) {
    // Start phase check
    if (!room.phaseInProgress) {
      room.phaseInProgress = true;
      room.zombiesSpawnedThisPhase = 0;
      room.zombiesKilledThisPhase = 0;
      io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: `Phase ${room.currentPhase} Starting!` });
    }

    // Check phase complete
    const phaseZombieCount = getPhaseZombieCount(room.currentPhase);
    if (room.zombiesKilledThisPhase >= phaseZombieCount && room.zombies.length === 0) {
      if (room.currentPhase < MAX_PHASE) {
        room.currentPhase++;
        room.zombiesSpawnedThisPhase = 0;
        room.zombiesKilledThisPhase = 0;
        io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: `Phase ${room.currentPhase} Starting!` });
      } else {
        io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: 'You Win! All phases complete!' });
        room.phaseInProgress = false;
      }
    }

    // Spawn zombies attempt
    if (now - room.lastZombieSpawnTime > ZOMBIE_SPAWN_INTERVAL &&
      room.zombiesSpawnedThisPhase < phaseZombieCount &&
      room.zombies.length < 15) {

      room.lastZombieSpawnTime = now;
      // Spawn logic
      const edge = Math.floor(Math.random() * 4);
      let x, y;
      if (edge === 0) { x = Math.random() * CANVAS_WIDTH; y = -20; }
      else if (edge === 1) { x = CANVAS_WIDTH + 20; y = Math.random() * CANVAS_HEIGHT; }
      else if (edge === 2) { x = Math.random() * CANVAS_WIDTH; y = CANVAS_HEIGHT + 20; }
      else { x = -20; y = Math.random() * CANVAS_HEIGHT; }

      const targetId = alivePlayerIds[Math.floor(Math.random() * alivePlayerIds.length)];
      room.zombies.push({
        id: 'zombie_' + (++room.zombieIdCounter),
        x: x, y: y, angle: 0, hp: ZOMBIE_HP, targetId: targetId,
        speed: getZombieSpeed(room.currentPhase)
      });
      room.zombiesSpawnedThisPhase++;
    }
  }

  // Send update to THIS ROOM ONLY
  io.to(room.id).emit('stateUpdate', {
    players: room.players,
    projectiles: room.projectiles,
    zombies: room.zombies
  });
}

// Global loop just iterates rooms
setInterval(() => {
  for (const roomId in rooms) {
    updateRoom(rooms[roomId]);
  }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
