const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Secret key for signing score tokens (use env var in production)
const SCORE_SECRET = process.env.SCORE_SECRET || crypto.randomBytes(32).toString('hex');

// Store valid score tokens (token -> { score, phase, expires })
const validScoreTokens = new Map();

// Clean up expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of validScoreTokens) {
    if (now > data.expires) {
      validScoreTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

// Generate a signed score token
function generateScoreToken(score, phase) {
  const timestamp = Date.now();
  const data = `${score}:${phase}:${timestamp}`;
  const signature = crypto.createHmac('sha256', SCORE_SECRET).update(data).digest('hex').substring(0, 16);
  const token = `${data}:${signature}`;

  // Store token as valid for 5 minutes
  validScoreTokens.set(token, {
    score: Number(score),
    phase: Number(phase),
    expires: timestamp + 5 * 60 * 1000
  });

  return token;
}

// Verify a score token
function verifyScoreToken(token, claimedScore, claimedPhase) {
  const tokenData = validScoreTokens.get(token);
  if (!tokenData) return false;
  if (Date.now() > tokenData.expires) {
    validScoreTokens.delete(token);
    return false;
  }
  // Verify score and phase match
  if (tokenData.score !== Number(claimedScore) || tokenData.phase !== Number(claimedPhase)) {
    return false;
  }
  // Token is single-use - delete after verification
  validScoreTokens.delete(token);
  return true;
}
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
app.use(express.json());

// Highscores persistence
const HIGHSCORES_FILE = fs.existsSync('/data')
  ? '/data/highscores.json'
  : path.join(__dirname, 'highscores.json');

function loadHighScores() {
  try {
    if (fs.existsSync(HIGHSCORES_FILE)) {
      const data = fs.readFileSync(HIGHSCORES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading highscores:', err);
  }
  return [];
}

function saveHighScores(scores) {
  try {
    // Sort by score descending and keep top 20
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, 20);
    fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(topScores, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving highscores:', err);
    return false;
  }
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Highscores API
app.get('/api/highscores', (req, res) => {
  const scores = loadHighScores();
  res.json(scores);
});

app.post('/api/highscores', (req, res) => {
  const { name, score, phase, token } = req.body;
  console.log('[HS] Submit - name:', name, 'score:', score, 'phase:', phase, 'token:', token ? 'present' : 'MISSING');

  if (!name || score === undefined) {
    return res.status(400).json({ error: 'Name and score are required' });
  }

  if (!token) {
    console.log('[HS] No token provided!');
    return res.status(400).json({ error: 'Invalid submission' });
  }

  // Verify the token matches the claimed score
  if (!verifyScoreToken(token, score, phase)) {
    return res.status(403).json({ error: 'Nice try ;)' });
  }

  const scores = loadHighScores();
  scores.push({
    name: String(name).substring(0, 15),
    score: Number(score),
    phase: Number(phase) || 1,
    date: new Date().toISOString()
  });

  if (saveHighScores(scores)) {
    res.json({ success: true, scores: loadHighScores() });
  } else {
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// ==========================================
// VERIFIED SINGLE PLAYER API
// ==========================================
const GameLogic = require('./public/gameLogic.js');

// Store active single player sessions
const singlePlayerSessions = new Map();

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, session] of singlePlayerSessions) {
    // Sessions expire after 1 hour
    if (now - session.startTime > 60 * 60 * 1000) {
      singlePlayerSessions.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

// Start a verified single player session
app.post('/api/singleplayer/start', (req, res) => {
  const { playerName } = req.body;
  console.log('[SP] Starting session for:', playerName);

  if (!playerName) {
    return res.status(400).json({ error: 'Player name required' });
  }

  // Generate session ID and seed
  const sessionId = crypto.randomBytes(16).toString('hex');
  const seed = crypto.randomInt(0, 2147483647);

  // Store session
  singlePlayerSessions.set(sessionId, {
    playerName: String(playerName).substring(0, 15),
    seed: seed,
    startTime: Date.now()
  });

  console.log('[SP] Session created:', sessionId, 'seed:', seed);
  res.json({
    sessionId: sessionId,
    seed: seed
  });
});

// Submit verified single player game
app.post('/api/singleplayer/submit', (req, res) => {
  const { sessionId, inputLog, finalScore, finalPhase, name } = req.body;
  console.log('[SP] Submit request - session:', sessionId, 'claimed score:', finalScore, 'phase:', finalPhase);
  console.log('[SP] Input log size:', inputLog ? inputLog.length : 0);

  // Validate session exists
  const session = singlePlayerSessions.get(sessionId);
  if (!session) {
    console.log('[SP] Session not found!');
  } else {
    console.log('[SP] Session found - seed:', session.seed);
  }
  if (!session) {
    return res.status(400).json({ error: 'Invalid or expired session' });
  }

  // Remove session (single use)
  singlePlayerSessions.delete(sessionId);

  // Verify by replay
  try {
    console.log('[SP] Starting replay verification...');
    const verifiedScore = replayAndVerify(session.seed, session.playerName, inputLog);
    console.log('[SP] Replay result - score:', verifiedScore.score, 'phase:', verifiedScore.phase);

    if (verifiedScore.score !== finalScore || verifiedScore.phase !== finalPhase) {
      console.log(`[SP] Score mismatch: claimed ${finalScore}/${finalPhase}, verified ${verifiedScore.score}/${verifiedScore.phase}`);
      return res.status(403).json({ error: 'Score verification failed' });
    }

    // Generate token for highscore submission
    const token = generateScoreToken(verifiedScore.score, verifiedScore.phase);
    console.log('[SP] Verification successful, token generated');

    res.json({
      success: true,
      verified: true,
      score: verifiedScore.score,
      phase: verifiedScore.phase,
      token: token
    });

  } catch (err) {
    console.error('[SP] Replay verification error:', err);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// Replay game with inputs and verify score
function replayAndVerify(seed, playerName, inputLog) {
  const playerId = 'replay_player';

  // Create game state with the same seed
  const gameState = GameLogic.createGameState(playerId, playerName, seed);

  // Sort input log by frame
  const sortedInputs = [...inputLog].sort((a, b) => a.f - b.f);
  let inputIndex = 0;

  // Current input state
  let currentInput = { up: false, down: false, left: false, right: false };
  let currentAngle = 0;

  // Simulate game
  const maxFrames = 60 * 60 * 30; // Max 30 minutes at 60fps
  const startTime = Date.now();

  for (let frame = 0; frame < maxFrames; frame++) {
    gameState.frame = frame;

    // Get player reference for this frame
    const player = gameState.players[playerId];

    // Apply inputs for this frame
    while (inputIndex < sortedInputs.length && sortedInputs[inputIndex].f === frame) {
      const input = sortedInputs[inputIndex];

      if (input.i) {
        currentInput = {
          up: input.i.u === 1,
          down: input.i.d === 1,
          left: input.i.l === 1,
          right: input.i.r === 1
        };
        // Apply input immediately so shooting uses correct state
        if (player) player.input = currentInput;
      }
      if (input.a !== undefined) {
        currentAngle = input.a;
        // Apply angle immediately so shooting uses correct angle
        if (player) player.angle = currentAngle;
      }
      if (input.s === 1) {
        // Shoot event
        if (player && player.hp > 0) {
          const result = GameLogic.createProjectile(player, gameState);
          for (const proj of result.projectiles) {
            gameState.projectiles.push(proj);
          }
          if (result.weaponChanged) {
            player.weapon = result.newWeapon;
            player.ammo = 0;
          }
        }
      }

      inputIndex++;
    }

    // Ensure input state is applied (for frames with no new input)
    if (player) {
      player.input = currentInput;
      player.angle = currentAngle;
    }

    // Run one frame of game logic
    const now = startTime + (frame * 1000 / 60); // Simulate time
    GameLogic.updateGameState(gameState, now, {});

    // Check if player died (game over)
    if (player && player.hp <= 0) {
      break;
    }

    // Check if all inputs processed and no more game activity
    if (inputIndex >= sortedInputs.length && frame > sortedInputs[sortedInputs.length - 1]?.f + 60) {
      break;
    }
  }

  const player = gameState.players[playerId];
  return {
    score: player ? player.score : 0,
    phase: gameState.currentPhase
  };
}

const players = {}; // Keep global lookup for simple socket->room mapping if needed, or remove.
// We will primarily use room.players now.

// Helper to find which room a socket belongs to
function getPlayerRoom(socketId) {
  for (const roomId in rooms) {
    if (rooms[roomId].players[socketId] || rooms[roomId].playerList.find(p => p.id === socketId)) {
      return rooms[roomId];
    }
  }
  return null;
}

// Global constants
const MAX_SPEED = 5;
const ACCELERATION = 0.5;
const FRICTION = 0.85; // Deceleration multiplier (lower = more friction)
const PROJECTILE_SPEED = 18;
const ZOMBIE_SPEED = 2.2; // Default base speed
const CANVAS_WIDTH = 2000;
const CANVAS_HEIGHT = 1200;
const ZOMBIE_SPAWN_INTERVAL = 500;
const ZOMBIE_HP = 30;
const MAX_PHASE = 10;
const ZOMBIE_HEARING_RADIUS = 150; // Zombies can hear bullets within this range
const ZOMBIE_ALERT_DURATION = 5000; // How long zombies stay alerted (ms)

// Zombie lunge/jump attack
const ZOMBIE_LUNGE_DISTANCE = 120; // Distance to trigger lunge
const ZOMBIE_LUNGE_SPEED = 8; // Speed during lunge (slower for player reaction time)
const ZOMBIE_LUNGE_DURATION = 250; // Lunge duration in ms (slightly longer)
const ZOMBIE_LUNGE_REST = 600; // Rest period after lunge where zombie pauses
const ZOMBIE_LUNGE_COOLDOWN = 2000; // Cooldown between lunges

// Weapon constants
const WEAPONS = {
  pistol: { damage: 10, speed: 18, range: 1000, spread: 0 },
  machine_gun: { damage: 12, speed: 20, range: 800, spread: 0.1, maxAmmo: 50 },
  shotgun: { damage: 25, speed: 15, range: 300, spread: 0.4, pellets: 5, maxAmmo: 12 }
};

// Grenade constants
const GRENADE_SPEED = 12; // Initial throw speed
const GRENADE_FRICTION = 0.95; // Slows down as it rolls
const GRENADE_MAX_DISTANCE = 350; // ~10m in game units
const GRENADE_FUSE_TIME = 2000; // 2 seconds before explosion
const GRENADE_BLAST_RADIUS = 150; // Explosion radius
const GRENADE_DAMAGE = 80; // Max damage at center
const GRENADE_MIN_DAMAGE = 20; // Min damage at edge
let grenadeIdCounter = 0;

// Item spawn settings
const ITEM_TYPES = ['health', 'machine_gun', 'shotgun', 'grenade'];
const ITEM_SPAWN_INTERVAL = 15000; // 15 seconds
const MAX_ITEMS = 5;
let itemIdCounter = 0;

// Room system
const rooms = {};
let roomIdCounter = 0;
let zombieIdCounter = 0; // Global counter is fine for unique IDs

function createRoom(hostId, hostName, roomName, isSinglePlayer = false, isPvp = false) {
  const roomId = 'room_' + (++roomIdCounter);
  rooms[roomId] = {
    id: roomId,
    name: roomName || `${hostName}'s Room`,
    hostId: hostId,
    isSinglePlayer: isSinglePlayer,
    isPvp: isPvp,
    // Game State Per Room
    players: {}, // Actual game player objects {x, y, hp...}
    playerList: [{ id: hostId, name: hostName }], // Meta info for lobby
    maxPlayers: isSinglePlayer ? 1 : 4,
    inProgress: false,

    projectiles: [],
    zombies: [],
    items: [],
    grenades: [],

    // Team score for multiplayer
    teamScore: 0,

    // Wave/Phase State
    currentPhase: 1,
    zombiesSpawnedThisPhase: 0,
    zombiesKilledThisPhase: 0,
    phaseInProgress: false,
    phaseStartTime: 0,

    // Timers
    lastZombieSpawnTime: 0,
    lastItemSpawnTime: 0,

    // Pause state
    isPaused: false
  };
  return rooms[roomId];
}

function getRoomsList(pvpOnly = false) {
  return Object.values(rooms)
    .filter(r => !r.isSinglePlayer && !r.inProgress && r.playerList.length < r.maxPlayers && (r.isPvp || false) === pvpOnly)
    .map(r => ({
      id: r.id,
      name: r.name,
      players: r.playerList.length,
      maxPlayers: r.maxPlayers
    }));
}

// Game Logic Helpers
function getPhaseZombieCount(phase) {
  // More zombies: starts at 15, increases by 12 per phase
  // Phase 1: 15, Phase 2: 27, Phase 3: 39, etc.
  return 15 + (phase - 1) * 12;
}

function getZombieSpeed(phase) {
  return ZOMBIE_SPEED + (phase - 1) * 0.2;
}

function getZombieSightRadius(phase) {
  return 400 + (phase - 1) * 20;
}

// ... (Skins, Floors, Decorations, Walls definitions remain same - keeping them global constants) ...
// Available player skins
const SKINS = [
  'hitman1', 'manBlue', 'manBrown', 'manOld', 'robot1', 'soldier1', 'survivor1', 'womanGreen'
];

// ... (Map definitions: floors, decorations, buildingWalls remain unchanged) ...
// Building layout - floors
const floors = [
  { x: 600, y: 400, w: 500, h: 400, tile: 'wood' },
  { x: 600, y: 800, w: 300, h: 200, tile: 'wood' },
  { x: 1100, y: 400, w: 200, h: 200, tile: 'bathroom' },
  { x: 900, y: 800, w: 200, h: 200, tile: 'wood' }
];

const decorations = [
  { x: 620, y: 420, w: 64, h: 128, tile: 'couch_green_left', collidable: true },
  { x: 684, y: 420, w: 64, h: 128, tile: 'couch_green_right', collidable: true },
  { x: 800, y: 550, w: 64, h: 64, tile: 'table_round', collidable: true },
  { x: 980, y: 720, w: 64, h: 64, tile: 'rug' },
  { x: 1150, y: 450, w: 64, h: 64, tile: 'plant' },
  { x: 620, y: 850, w: 64, h: 64, tile: 'table_round', collidable: true },
  { x: 700, y: 840, w: 128, h: 64, tile: 'couch_teal', collidable: true },
  { x: 400, y: 300, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 450, y: 350, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1400, y: 500, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1450, y: 600, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 300, y: 900, w: 64, h: 64, tile: 'bush', collidable: true },
  { x: 1500, y: 300, w: 64, h: 64, tile: 'crate', collidable: true },
  { x: 1564, y: 300, w: 64, h: 64, tile: 'crate', collidable: true }
];

const buildingWalls = [
  { x: 580, y: 380, w: 540, h: 20 },
  { x: 580, y: 380, w: 20, h: 440 },
  { x: 580, y: 800, w: 240, h: 20 },
  { x: 880, y: 800, w: 240, h: 20 },
  { x: 1100, y: 380, w: 220, h: 20 },
  { x: 1300, y: 380, w: 20, h: 240 },
  { x: 1100, y: 600, w: 220, h: 20 },
  { x: 1100, y: 400, w: 20, h: 100 },
  { x: 1100, y: 550, w: 20, h: 70 },
  { x: 580, y: 820, w: 20, h: 200 },
  { x: 580, y: 1000, w: 340, h: 20 },
  { x: 900, y: 820, w: 20, h: 100 },
  { x: 1080, y: 820, w: 20, h: 200 },
  { x: 900, y: 1000, w: 200, h: 20 }
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

function canSeePlayer(zombie, player, currentPhase) { // Pass phase to use per-room context
  const dx = player.x - zombie.x;
  const dy = player.y - zombie.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > getZombieSightRadius(currentPhase)) return false;

  const steps = Math.floor(dist / 20);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = zombie.x + dx * t;
    const y = zombie.y + dy * t;
    if (checkWallCollision(x, y, 2)) return false;
  }
  return true;
}


io.on('connection', (socket) => {
  console.log('a user connected: ' + socket.id);
  socket.emit('mapData', { floors, walls: buildingWalls, decorations, wallTiles: GameLogic.wallTiles });

  socket.on('getRooms', (options) => {
    const pvp = options?.pvp || false;
    socket.emit('roomsList', getRoomsList(pvp));
  });

  socket.on('createRoom', (data) => {
    const isPvp = data.isPvp || false;
    const room = createRoom(socket.id, data.playerName, data.roomName, false, isPvp);
    socket.join(room.id);
    socket.emit('roomCreated', { roomId: room.id, room: room });
    io.emit('roomsList', getRoomsList(isPvp));
  });

  socket.on('joinRoom', (data) => {
    const room = rooms[data.roomId];
    if (!room) { socket.emit('joinError', 'Room not found'); return; }
    if (room.inProgress) { socket.emit('joinError', 'Game in progress'); return; }
    if (room.playerList.length >= room.maxPlayers) { socket.emit('joinError', 'Full'); return; }

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
    delete room.players[socket.id]; // Remove from game state if existing
    socket.leave(room.id);

    if (room.hostId === socket.id) {
      if (room.playerList.length > 0) {
        room.hostId = room.playerList[0].id; // New host
      } else {
        delete rooms[room.id]; // Delete room
        io.emit('roomsList', getRoomsList());
        return;
      }
    }
    io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
    io.emit('roomsList', getRoomsList());
  });

  // Start Multiplayer Game
  socket.on('startGame', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || room.hostId !== socket.id) return;
    initGameForRoom(room);
  });

  // Start Single Player - private isolated room
  socket.on('startSinglePlayer', (data) => {
    // Create new isolated room
    const room = createRoom(socket.id, data.playerName, 'Single Player', true);
    socket.join(room.id);

    // Auto-start
    initGameForRoom(room);
  });

  function initGameForRoom(room) {
    room.inProgress = true;

    // Spawn players
    for (const p of room.playerList) {
      let startX, startY, attempts = 0;
      do {
        startX = 100 + Math.random() * (CANVAS_WIDTH - 200);
        startY = 100 + Math.random() * (CANVAS_HEIGHT - 200);
        attempts++;
      } while ((checkWallCollision(startX, startY, 25) || checkDecorationCollision(startX, startY, 25)) && attempts < 100);

      const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
      room.players[p.id] = {
        x: startX, y: startY, angle: 0, hp: 100,
        vx: 0, vy: 0, // Velocity for smooth movement
        playerId: p.id, name: p.name, skin: skin, score: 0,
        weapon: 'pistol', ammo: 0,
        grenades: 0, // Grenade count
        input: { up: false, down: false, left: false, right: false } // Store input state
      };
    }

    room.currentPhase = 1;
    room.zombiesSpawnedThisPhase = 0;
    room.zombiesKilledThisPhase = 0;
    room.zombies = [];
    room.projectiles = [];
    room.grenades = [];
    room.phaseInProgress = false;
    room.phaseStartTime = Date.now();

    io.to(room.id).emit('gameStarted', { roomId: room.id });
    io.to(room.id).emit('updatePlayers', room.players); // Initial sync
    io.to(room.id).emit('playerCount', room.playerList.length); // Send player count
    io.to(room.id).emit('phaseChange', { phase: 1, message: 'Phase 1 Starting!' });

    // Notify lobby that list changed (room now in progress)
    io.emit('roomsList', getRoomsList());
  }

  socket.on('disconnect', () => {
    const room = getPlayerRoom(socket.id);
    if (room) {
      // Logic same as leaveRoom
      room.playerList = room.playerList.filter(p => p.id !== socket.id);
      delete room.players[socket.id];

      if (room.playerList.length === 0) {
        delete rooms[room.id];
      } else if (room.hostId === socket.id) {
        room.hostId = room.playerList[0].id;
        io.to(room.id).emit('lobbyUpdate', { playerList: room.playerList, hostId: room.hostId });
      }

      if (rooms[room.id]) { // If room still exists
        io.to(room.id).emit('updatePlayers', room.players);
        io.to(room.id).emit('playerCount', room.playerList.length);
      }
    }
    io.emit('roomsList', getRoomsList()); // Update global list
  });


  // Input Handling - Updated to reference ROOM players
  socket.on('chatMessage', (message) => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;
    const player = room.players[socket.id]; // Get from room
    if (!player) return; // Maybe pure lobby chat? Allow if in lobby

    const sanitized = String(message).substring(0, 50).trim();
    if (!sanitized) return;

    // If in game, show bubble
    if (player) {
      player.chatMessage = sanitized;
      player.chatTime = Date.now();
    }

    io.to(room.id).emit('chatMessage', { name: room.playerList.find(p => p.id === socket.id)?.name || 'Unknown', message: sanitized });
  });

  socket.on('playerInput', (data) => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;
    const player = room.players[socket.id];
    if (!player || player.hp <= 0) return;

    // Store input state - movement is processed in game loop
    player.input = {
      up: data.up,
      down: data.down,
      left: data.left,
      right: data.right
    };
    player.angle = data.angle;
  });

  socket.on('shoot', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;
    const player = room.players[socket.id];
    if (!player || player.hp <= 0) return;

    const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;

    // Check ammo for special weapons
    if (player.weapon !== 'pistol') {
      if (player.ammo <= 0) {
        // Switch back to pistol
        player.weapon = 'pistol';
        player.ammo = 0;
        io.to(socket.id).emit('weaponChange', { weapon: 'pistol', ammo: 0 });
        return;
      }
      player.ammo--;
      io.to(socket.id).emit('ammoUpdate', { ammo: player.ammo });
    }

    // Broadcast shot event for muzzle flash (to other players)
    socket.to(room.id).emit('playerShot', { playerId: socket.id });

    // Shotgun fires multiple pellets in an even spread
    if (player.weapon === 'shotgun') {
      const pelletCount = weapon.pellets;
      const totalSpread = weapon.spread * 2;
      for (let i = 0; i < pelletCount; i++) {
        // Evenly distribute pellets across the spread arc
        const spreadOffset = (i / (pelletCount - 1)) * totalSpread - weapon.spread;
        const spreadAngle = player.angle + spreadOffset + (Math.random() - 0.5) * 0.05;
        room.projectiles.push({
          x: player.x, y: player.y,
          vx: Math.cos(spreadAngle) * weapon.speed,
          vy: Math.sin(spreadAngle) * weapon.speed,
          ownerId: socket.id,
          damage: weapon.damage,
          range: weapon.range,
          distanceTraveled: 0
        });
      }
    } else {
      // Pistol or machine gun - single projectile with optional spread
      const spreadAngle = player.angle + (Math.random() - 0.5) * weapon.spread * 2;
      room.projectiles.push({
        x: player.x, y: player.y,
        vx: Math.cos(spreadAngle) * weapon.speed,
        vy: Math.sin(spreadAngle) * weapon.speed,
        ownerId: socket.id,
        damage: weapon.damage,
        range: weapon.range,
        distanceTraveled: 0
      });
    }
  });

  // Throw grenade (E key)
  socket.on('throwGrenade', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;
    const player = room.players[socket.id];
    if (!player || player.hp <= 0) return;
    if (!player.grenades || player.grenades <= 0) return;

    player.grenades--;
    io.to(socket.id).emit('grenadeUpdate', { grenades: player.grenades });

    // Create grenade entity
    const grenade = {
      id: 'g_' + (++grenadeIdCounter),
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * GRENADE_SPEED,
      vy: Math.sin(player.angle) * GRENADE_SPEED,
      ownerId: socket.id,
      thrownAt: Date.now(),
      distanceTraveled: 0,
      stopped: false
    };
    room.grenades.push(grenade);

    // Broadcast grenade throw
    io.to(room.id).emit('grenadeThrown', { id: grenade.id, x: grenade.x, y: grenade.y, vx: grenade.vx, vy: grenade.vy });
  });

  socket.on('restart', () => {
    const room = getPlayerRoom(socket.id);
    if (!room) return;

    // In Single Player, full restart (reset everything)
    if (room.isSinglePlayer) {
      room.currentPhase = 1;
      room.zombies = [];
      room.projectiles = [];
      room.items = [];
      room.zombiesSpawnedThisPhase = 0;
      room.zombiesKilledThisPhase = 0;
      room.phaseInProgress = false;
      room.phaseStartTime = Date.now();
      room.lastItemSpawnTime = Date.now();
      room.teamScore = 0; // Reset team score for single player

      io.to(room.id).emit('phaseChange', { phase: 1, message: 'Restarting Game...' });
    }
    // In Multiplayer, just respawn the player - don't reset phase or team score

    // Respawn Player
    const player = room.players[socket.id];
    if (player) {
      player.hp = 100;
      player.weapon = 'pistol';
      player.ammo = 0;
      player.vx = 0;
      player.vy = 0;
      player.input = { up: false, down: false, left: false, right: false };
      let rX, rY, attempts = 0;
      do {
        rX = 100 + Math.random() * (CANVAS_WIDTH - 200);
        rY = 100 + Math.random() * (CANVAS_HEIGHT - 200);
        attempts++;
      } while ((checkWallCollision(rX, rY, 25) || checkDecorationCollision(rX, rY, 25)) && attempts < 100);

      player.x = rX;
      player.y = rY;

      // Notify player they are alive effectively by updating state
      io.to(room.id).emit('updatePlayers', room.players);
    }
  });

  // Pause game
  socket.on('pauseGame', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;

    // Only host or single player can pause
    if (room.isSinglePlayer || room.hostId === socket.id) {
      room.isPaused = true;
      io.to(room.id).emit('gamePaused', { pausedBy: socket.id, isHost: room.hostId === socket.id });
    }
  });

  // Resume game
  socket.on('resumeGame', () => {
    const room = getPlayerRoom(socket.id);
    if (!room || !room.inProgress) return;

    // Only host or single player can resume
    if (room.isSinglePlayer || room.hostId === socket.id) {
      room.isPaused = false;
      io.to(room.id).emit('gameResumed');
    }
  });

});

// ==========================================
// CENTRAL GAME LOOP PROCESSING ALL ROOMS
// ==========================================
setInterval(() => {
  const now = Date.now();

  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (!room.inProgress) continue;
    if (room.isPaused) continue; // Skip updates when paused

    updateRoom(room, now);
  }
}, 1000 / 60);

function updateRoom(room, now) {
  // 0. Process Player Movement with Acceleration
  for (const id in room.players) {
    const player = room.players[id];
    if (player.hp <= 0) continue;

    const input = player.input || { up: false, down: false, left: false, right: false };

    // Apply acceleration based on input
    if (input.left) player.vx -= ACCELERATION;
    if (input.right) player.vx += ACCELERATION;
    if (input.up) player.vy -= ACCELERATION;
    if (input.down) player.vy += ACCELERATION;

    // Clamp velocity to max speed
    const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (speed > MAX_SPEED) {
      player.vx = (player.vx / speed) * MAX_SPEED;
      player.vy = (player.vy / speed) * MAX_SPEED;
    }

    // Apply friction when not moving in a direction
    if (!input.left && !input.right) player.vx *= FRICTION;
    if (!input.up && !input.down) player.vy *= FRICTION;

    // Stop completely if very slow
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
    if (Math.abs(player.vy) < 0.1) player.vy = 0;

    // Calculate new position
    let newX = player.x + player.vx;
    let newY = player.y + player.vy;

    // Bounds check
    newX = Math.max(0, Math.min(CANVAS_WIDTH, newX));
    newY = Math.max(0, Math.min(CANVAS_HEIGHT, newY));

    // Wall collision with velocity bounce-back
    if (!checkWallCollision(newX, player.y, 20) && !checkDecorationCollision(newX, player.y, 15)) {
      player.x = newX;
    } else {
      player.vx = 0; // Stop horizontal movement on collision
    }

    if (!checkWallCollision(player.x, newY, 20) && !checkDecorationCollision(player.x, newY, 15)) {
      player.y = newY;
    } else {
      player.vy = 0; // Stop vertical movement on collision
    }
  }

  // 1. Process Projectiles
  for (let i = room.projectiles.length - 1; i >= 0; i--) {
    const p = room.projectiles[i];
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    p.x += p.vx;
    p.y += p.vy;
    p.distanceTraveled = (p.distanceTraveled || 0) + speed;

    // Range check - remove if traveled too far
    if (p.range && p.distanceTraveled > p.range) {
      room.projectiles.splice(i, 1); continue;
    }

    // Bounds & Wall Collision
    if (p.x < -100 || p.x > CANVAS_WIDTH + 100 || p.y < -100 || p.y > CANVAS_HEIGHT + 100) {
      room.projectiles.splice(i, 1); continue;
    }
    let hitWall = false;
    for (const wall of buildingWalls) {
      if (p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
        hitWall = true; break;
      }
    }
    if (hitWall) { room.projectiles.splice(i, 1); continue; }

    const damage = p.damage || 10;
    const isZombieProjectile = p.isZombieProjectile || false;

    // Alert nearby zombies to bullet sound (only player projectiles)
    if (!isZombieProjectile && p.ownerId) {
      const shooter = room.players[p.ownerId];
      if (shooter) {
        for (const zombie of room.zombies) {
          const dx = p.x - zombie.x, dy = p.y - zombie.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ZOMBIE_HEARING_RADIUS && !zombie.targetId) {
            // Zombie heard the bullet - investigate shooter's position
            zombie.alertedPosition = { x: shooter.x, y: shooter.y };
            zombie.alertedTime = now;
          }
        }
      }
    }

    // Hit Player (zombie projectiles and other player projectiles can hit)
    for (const id in room.players) {
      const player = room.players[id];
      // Zombie projectiles hit all players, player projectiles hit other players
      const canHit = isZombieProjectile || p.ownerId !== id;
      if (canHit && player.hp > 0) {
        const dx = p.x - player.x, dy = p.y - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          player.hp -= damage;
          io.to(id).emit('hurt');
          if (!isZombieProjectile) {
            io.to(p.ownerId).emit('hit');
          }
          room.projectiles.splice(i, 1);
          if (player.hp <= 0) {
            player.hp = 0;
            const killerName = isZombieProjectile ? '🧟 Armed Zombie' : (room.players[p.ownerId]?.name || 'Unknown');
            io.to(room.id).emit('playerDeath', { x: player.x, y: player.y, killerName: killerName, victimName: player.name });
          }
          break; // Projectile destroyed
        }
      }
    }
    // If projectile already hit player, processed in break. If not present (index valid), check zombies.
    if (i >= room.projectiles.length) continue;

    // Hit Zombie (only player projectiles, not zombie projectiles)
    if (!isZombieProjectile) {
      for (const zombie of room.zombies) {
        const dx = p.x - zombie.x, dy = p.y - zombie.y;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          zombie.hp -= damage;

          // Notify player who hit the zombie (for sound)
          io.to(p.ownerId).emit('zombieHit');

          // Zombie got hit - track towards shooter even if can't see them
          const shooter = room.players[p.ownerId];
          if (shooter) {
            zombie.alertedPosition = { x: shooter.x, y: shooter.y };
            zombie.alertedTime = now;
          }

          // Knockback - push zombie in direction of projectile
          const knockbackStrength = 8;
          const projSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (projSpeed > 0) {
            const knockX = (p.vx / projSpeed) * knockbackStrength;
            const knockY = (p.vy / projSpeed) * knockbackStrength;
            const newX = zombie.x + knockX;
            const newY = zombie.y + knockY;
            // Only apply if not hitting a wall
            if (!checkWallCollision(newX, newY, 15) && !checkDecorationCollision(newX, newY, 15)) {
              zombie.x = Math.max(0, Math.min(CANVAS_WIDTH, newX));
              zombie.y = Math.max(0, Math.min(CANVAS_HEIGHT, newY));
            }
          }

          room.projectiles.splice(i, 1);
          if (zombie.hp <= 0) {
            io.to(room.id).emit('zombieDeath', { x: zombie.x, y: zombie.y });
            room.zombiesKilledThisPhase++;
            // Award points to team score (75 for armed zombies, 50 for regular)
            const points = zombie.weapon ? 75 : 50;
            room.teamScore += points;
          }
          break;
        }
      }
    }
  }

  // 1.5 Process Grenades
  for (let i = room.grenades.length - 1; i >= 0; i--) {
    const g = room.grenades[i];

    if (!g.stopped) {
      // Move grenade
      const speed = Math.sqrt(g.vx * g.vx + g.vy * g.vy);
      g.x += g.vx;
      g.y += g.vy;
      g.distanceTraveled += speed;

      // Apply friction
      g.vx *= GRENADE_FRICTION;
      g.vy *= GRENADE_FRICTION;

      // Check wall/decoration collision
      if (checkWallCollision(g.x, g.y, 8) || checkDecorationCollision(g.x, g.y, 8)) {
        g.stopped = true;
        g.vx = 0;
        g.vy = 0;
      }

      // Check max distance or stopped rolling
      if (g.distanceTraveled >= GRENADE_MAX_DISTANCE || speed < 0.5) {
        g.stopped = true;
        g.vx = 0;
        g.vy = 0;
      }

      // Keep in bounds
      g.x = Math.max(10, Math.min(CANVAS_WIDTH - 10, g.x));
      g.y = Math.max(10, Math.min(CANVAS_HEIGHT - 10, g.y));
    }

    // Check if grenade should explode
    if (now - g.thrownAt >= GRENADE_FUSE_TIME) {
      // EXPLOSION!
      io.to(room.id).emit('grenadeExplode', { x: g.x, y: g.y });

      // Damage all entities in blast radius
      // Damage players
      for (const id in room.players) {
        const player = room.players[id];
        if (player.hp <= 0) continue;
        const dx = player.x - g.x;
        const dy = player.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRENADE_BLAST_RADIUS) {
          // Damage falls off with distance
          const damageFactor = 1 - (dist / GRENADE_BLAST_RADIUS);
          const damage = Math.floor(GRENADE_MIN_DAMAGE + (GRENADE_DAMAGE - GRENADE_MIN_DAMAGE) * damageFactor);
          player.hp -= damage;
          io.to(id).emit('hurt');
          if (player.hp <= 0) {
            player.hp = 0;
            const killerName = room.players[g.ownerId]?.name || 'Grenade';
            io.to(room.id).emit('playerDeath', { x: player.x, y: player.y, killerName: killerName + ' (grenade)', victimName: player.name });
          }
        }
      }

      // Damage zombies
      for (const zombie of room.zombies) {
        const dx = zombie.x - g.x;
        const dy = zombie.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < GRENADE_BLAST_RADIUS) {
          const damageFactor = 1 - (dist / GRENADE_BLAST_RADIUS);
          const damage = Math.floor(GRENADE_MIN_DAMAGE + (GRENADE_DAMAGE - GRENADE_MIN_DAMAGE) * damageFactor);
          zombie.hp -= damage;
          if (zombie.hp <= 0) {
            io.to(room.id).emit('zombieDeath', { x: zombie.x, y: zombie.y });
            room.zombiesKilledThisPhase++;
            room.teamScore += zombie.weapon ? 75 : 50;
          }
        }
      }

      // Remove grenade
      room.grenades.splice(i, 1);
    }
  }

  // 2. Cleanup Dead Zombies
  for (let i = room.zombies.length - 1; i >= 0; i--) {
    if (room.zombies[i].hp <= 0) room.zombies.splice(i, 1);
  }

  // 3. Zombie Logic (Move & Attack)
  const activePlayers = Object.values(room.players).filter(p => p.hp > 0);

  for (const zombie of room.zombies) {
    let target = null;
    const hadTarget = !!zombie.targetId;

    // Check current target
    if (zombie.targetId && room.players[zombie.targetId] && room.players[zombie.targetId].hp > 0) {
      if (canSeePlayer(zombie, room.players[zombie.targetId], room.currentPhase)) {
        target = room.players[zombie.targetId];
      } else {
        zombie.targetId = null; // Lost sight of target
      }
    }

    // Find new target if needed
    if (!target && activePlayers.length > 0) {
      // Simple heuristic: closest visible
      let minDist = Infinity;
      for (const p of activePlayers) {
        const dist = Math.sqrt((p.x - zombie.x) ** 2 + (p.y - zombie.y) ** 2);
        if (dist < minDist && canSeePlayer(zombie, p, room.currentPhase)) {
          minDist = dist;
          target = p;
          zombie.targetId = p.playerId;
        }
      }

      // Zombie just acquired a new target - roar!
      if (target && !hadTarget) {
        io.to(target.playerId).emit('zombieRoar');
      }
    }

    if (target) {
      const dx = target.x - zombie.x;
      const dy = target.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        let speed = zombie.speed || ZOMBIE_SPEED;
        let moveX = dx / dist;
        let moveY = dy / dist;

        // Lunge attack for unarmed zombies
        if (!zombie.weapon) {
          // Check if currently lunging
          if (zombie.lungeStartTime && now - zombie.lungeStartTime < ZOMBIE_LUNGE_DURATION) {
            // During lunge - use stored lunge direction and high speed
            speed = ZOMBIE_LUNGE_SPEED;
            moveX = zombie.lungeDirX;
            moveY = zombie.lungeDirY;
          } else if (zombie.lungeStartTime && now - zombie.lungeStartTime >= ZOMBIE_LUNGE_DURATION) {
            // Lunge just ended - start rest period
            zombie.lungeStartTime = null;
            zombie.restStartTime = now;
          } else if (zombie.restStartTime && now - zombie.restStartTime < ZOMBIE_LUNGE_REST) {
            // Resting after lunge - zombie pauses to recover
            speed = 0;
          } else if (zombie.restStartTime && now - zombie.restStartTime >= ZOMBIE_LUNGE_REST) {
            // Rest period ended - set cooldown and resume normal behavior
            zombie.restStartTime = null;
            zombie.lastLungeTime = now;
          } else if (dist <= ZOMBIE_LUNGE_DISTANCE && dist > 25) {
            // In lunge range - check cooldown and start lunge
            if (!zombie.lastLungeTime || now - zombie.lastLungeTime > ZOMBIE_LUNGE_COOLDOWN) {
              // Start lunge!
              zombie.lungeStartTime = now;
              zombie.lungeDirX = dx / dist;
              zombie.lungeDirY = dy / dist;
              speed = ZOMBIE_LUNGE_SPEED;
              moveX = zombie.lungeDirX;
              moveY = zombie.lungeDirY;
              // Emit lunge event for client animation
              io.to(room.id).emit('zombieLunge', { id: zombie.id, x: zombie.x, y: zombie.y });
            }
          }
        }

        const newX = zombie.x + moveX * speed;
        const newY = zombie.y + moveY * speed;

        // Check wall collision before moving
        if (!checkWallCollision(newX, zombie.y, 15)) {
          zombie.x = newX;
        }
        if (!checkWallCollision(zombie.x, newY, 15)) {
          zombie.y = newY;
        }
        zombie.angle = Math.atan2(dy, dx);
      }
      zombie.wandering = false;

      // Armed zombie shooting
      if (zombie.weapon && dist > 50 && dist < 400) {
        const shootInterval = zombie.weapon === 'machine_gun' ? 300 : (zombie.weapon === 'shotgun' ? 1500 : 800);
        if (now - zombie.lastShootTime > shootInterval) {
          zombie.lastShootTime = now;

          // Create projectile(s) based on weapon
          if (zombie.weapon === 'shotgun') {
            // Shotgun: 3 pellets with spread
            for (let i = 0; i < 3; i++) {
              const spreadAngle = zombie.angle + (Math.random() - 0.5) * 0.6;
              room.projectiles.push({
                x: zombie.x, y: zombie.y,
                vx: Math.cos(spreadAngle) * 12,
                vy: Math.sin(spreadAngle) * 12,
                ownerId: zombie.id,
                isZombieProjectile: true,
                damage: 15,
                range: 250,
                distanceTraveled: 0
              });
            }
          } else {
            // Pistol or machine gun
            const spread = zombie.weapon === 'machine_gun' ? 0.15 : 0.05;
            const spreadAngle = zombie.angle + (Math.random() - 0.5) * spread;
            room.projectiles.push({
              x: zombie.x, y: zombie.y,
              vx: Math.cos(spreadAngle) * 14,
              vy: Math.sin(spreadAngle) * 14,
              ownerId: zombie.id,
              isZombieProjectile: true,
              damage: zombie.weapon === 'machine_gun' ? 8 : 10,
              range: zombie.weapon === 'machine_gun' ? 500 : 600,
              distanceTraveled: 0
            });
          }
        }
      }

      // Melee Attack (only for unarmed or very close)
      if (dist < 25 && !zombie.weapon) {
        target.hp -= 1; // Damage frame? Or interval? Original was instant but maybe too fast.
        // Original code had 10 dmg + pushback.
        // Let's replicate original pushback logic lightly
        target.hp -= 9; // Reduce slightly to avoid insta-kill logic from previous if loop ran fast
        io.to(target.playerId).emit('hurt');
        zombie.x -= (dx / dist) * 30; // Bounce back
        zombie.y -= (dy / dist) * 30;
        zombie.targetId = null; // Scan again

        if (target.hp <= 0) {
          target.hp = 0;
          io.to(room.id).emit('playerDeath', { x: target.x, y: target.y, killerName: '🧟 Zombie', victimName: target.name });
        }
      }

    } else if (zombie.alertedPosition && now - zombie.alertedTime < ZOMBIE_ALERT_DURATION) {
      // No visible target but heard a sound - investigate
      const dx = zombie.alertedPosition.x - zombie.x;
      const dy = zombie.alertedPosition.y - zombie.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 30) {
        // Move towards the sound location
        const speed = (zombie.speed || ZOMBIE_SPEED) * 0.8; // Slightly slower when investigating
        const newX = zombie.x + (dx / dist) * speed;
        const newY = zombie.y + (dy / dist) * speed;

        if (!checkWallCollision(newX, zombie.y, 15)) {
          zombie.x = newX;
        }
        if (!checkWallCollision(zombie.x, newY, 15)) {
          zombie.y = newY;
        }
        zombie.angle = Math.atan2(dy, dx);
      } else {
        // Reached the sound location - clear alert and start searching
        zombie.alertedPosition = null;
      }
      zombie.wandering = false;

    } else {
      // Clear expired alert
      if (zombie.alertedPosition && now - zombie.alertedTime >= ZOMBIE_ALERT_DURATION) {
        zombie.alertedPosition = null;
      }

      // Wander
      if (!zombie.wandering || Math.random() < 0.02) {
        zombie.wanderAngle = Math.random() * Math.PI * 2;
        zombie.wandering = true;
      }

      const wanderX = zombie.x + Math.cos(zombie.wanderAngle) * 1;
      const wanderY = zombie.y + Math.sin(zombie.wanderAngle) * 1;

      // Check wall collision for wandering
      if (!checkWallCollision(wanderX, zombie.y, 15)) {
        zombie.x = wanderX;
      } else {
        zombie.wanderAngle = Math.PI - zombie.wanderAngle; // Bounce off wall
      }
      if (!checkWallCollision(zombie.x, wanderY, 15)) {
        zombie.y = wanderY;
      } else {
        zombie.wanderAngle = -zombie.wanderAngle; // Bounce off wall
      }
      zombie.angle = zombie.wanderAngle;

      // Bounds
      if (zombie.x < 0 || zombie.x > CANVAS_WIDTH) zombie.wanderAngle = Math.PI - zombie.wanderAngle;
      if (zombie.y < 0 || zombie.y > CANVAS_HEIGHT) zombie.wanderAngle = -zombie.wanderAngle;
    }
  }

  // 4. Phase Management & Spawning (skip for PvP)
  if (room.isPvp) {
    // PvP mode: no zombies, no phases, no game over
    // Just let players fight each other
  } else if (activePlayers.length === 0 && Object.keys(room.players).length > 0) {
    // All players dead - trigger team game over (only once)
    if (!room.teamGameOver) {
      room.teamGameOver = true;
      // Generate signed token for score submission
      const scoreToken = generateScoreToken(room.teamScore, room.currentPhase);
      io.to(room.id).emit('teamGameOver', {
        teamScore: room.teamScore,
        phase: room.currentPhase,
        token: scoreToken
      });
    }
    // Don't spawn or process - wait for restart
  } else {
    // At least one player alive - clear game over flag
    room.teamGameOver = false;
    // Valid game
    if (!room.phaseInProgress) {
      room.phaseInProgress = true;
      room.zombiesSpawnedThisPhase = 0;
      room.zombiesKilledThisPhase = 0;
      room.phaseStartTime = now;
      io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: `Phase ${room.currentPhase} Starting!` });
    }

    const phaseTotal = getPhaseZombieCount(room.currentPhase);

    // Check Next Phase
    if (room.zombiesKilledThisPhase >= phaseTotal && room.zombies.length === 0) {
      // Calculate phase clear time bonus
      const phaseTime = (now - room.phaseStartTime) / 1000; // seconds
      const timeBonus = Math.max(100, Math.floor(1000 - phaseTime * 10));
      const phaseBonus = room.currentPhase * 100;
      const totalBonus = timeBonus + phaseBonus;

      // Award bonus to team score
      room.teamScore += totalBonus;

      // Emit phase clear bonus info
      io.to(room.id).emit('phaseClear', {
        phase: room.currentPhase,
        timeBonus: timeBonus,
        phaseBonus: phaseBonus,
        totalBonus: totalBonus,
        timeSeconds: Math.floor(phaseTime)
      });

      if (room.currentPhase < MAX_PHASE) {
        room.currentPhase++;
        room.zombiesSpawnedThisPhase = 0;
        room.zombiesKilledThisPhase = 0;
        room.phaseStartTime = now;
        io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: `Phase ${room.currentPhase} Starting!` });
      } else {
        // Win?
        io.to(room.id).emit('phaseChange', { phase: room.currentPhase, message: 'You Win!' });
        room.phaseInProgress = false;
      }
    }

    // Spawn Zombies
    if (room.zombiesSpawnedThisPhase < phaseTotal && room.zombies.length < 15) {
      if (now - room.lastZombieSpawnTime > ZOMBIE_SPAWN_INTERVAL) {
        // Spawn logic - spawn at edges but inside game area
        const edge = Math.floor(Math.random() * 4);
        let zx, zy;
        switch (edge) {
          case 0: zx = Math.random() * CANVAS_WIDTH; zy = 20; break;          // Top edge
          case 1: zx = CANVAS_WIDTH - 20; zy = Math.random() * CANVAS_HEIGHT; break;  // Right edge
          case 2: zx = Math.random() * CANVAS_WIDTH; zy = CANVAS_HEIGHT - 20; break;  // Bottom edge
          case 3: zx = 20; zy = Math.random() * CANVAS_HEIGHT; break;         // Left edge
        }

        // Determine if zombie is armed based on phase
        let zombieWeapon = null;
        let zombieHP = ZOMBIE_HP;
        const phase = room.currentPhase;

        if (phase >= 3) {
          const armedChance = phase >= 7 ? 0.4 : (phase >= 5 ? 0.3 : 0.2);
          if (Math.random() < armedChance) {
            // Pick weapon based on phase
            if (phase >= 7) {
              const weapons = ['pistol', 'shotgun', 'machine_gun'];
              zombieWeapon = weapons[Math.floor(Math.random() * weapons.length)];
            } else if (phase >= 5) {
              zombieWeapon = Math.random() < 0.5 ? 'pistol' : 'shotgun';
            } else {
              zombieWeapon = 'pistol';
            }
            zombieHP = ZOMBIE_HP + 20; // Armed zombies have more HP
          }
        }

        room.zombies.push({
          id: 'z_' + (++zombieIdCounter),
          x: zx, y: zy, angle: 0, hp: zombieHP,
          targetId: activePlayers[Math.floor(Math.random() * activePlayers.length)]?.playerId,
          speed: getZombieSpeed(room.currentPhase),
          weapon: zombieWeapon,
          lastShootTime: 0
        });

        room.zombiesSpawnedThisPhase++;
        room.lastZombieSpawnTime = now;
      }
    }

    // Spawn Items
    if (room.items.length < MAX_ITEMS && now - room.lastItemSpawnTime > ITEM_SPAWN_INTERVAL) {
      let ix, iy, attempts = 0;
      do {
        ix = 150 + Math.random() * (CANVAS_WIDTH - 300);
        iy = 150 + Math.random() * (CANVAS_HEIGHT - 300);
        attempts++;
      } while ((checkWallCollision(ix, iy, 30) || checkDecorationCollision(ix, iy, 30)) && attempts < 50);

      if (attempts < 50) {
        const itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
        room.items.push({
          id: 'item_' + (++itemIdCounter),
          x: ix,
          y: iy,
          type: itemType
        });
        room.lastItemSpawnTime = now;
      }
    }

    // Item Pickup
    for (let i = room.items.length - 1; i >= 0; i--) {
      const item = room.items[i];
      for (const player of activePlayers) {
        const dx = item.x - player.x;
        const dy = item.y - player.y;
        if (Math.sqrt(dx * dx + dy * dy) < 40) {
          // Pickup item
          if (item.type === 'health') {
            player.hp = Math.min(100, player.hp + 25);
            io.to(player.playerId).emit('heal', { hp: player.hp });
          } else if (item.type === 'machine_gun') {
            player.weapon = 'machine_gun';
            player.ammo = WEAPONS.machine_gun.maxAmmo;
            io.to(player.playerId).emit('weaponPickup', { weapon: 'machine_gun', ammo: player.ammo });
          } else if (item.type === 'shotgun') {
            player.weapon = 'shotgun';
            player.ammo = WEAPONS.shotgun.maxAmmo;
            io.to(player.playerId).emit('weaponPickup', { weapon: 'shotgun', ammo: player.ammo });
          } else if (item.type === 'grenade') {
            player.grenades = (player.grenades || 0) + 1;
            io.to(player.playerId).emit('grenadePickup', { grenades: player.grenades });
          }
          room.items.splice(i, 1);
          break;
        }
      }
    }
  }

  // 5. Send Update to Room (throttled to 30fps for network performance)
  const STATE_UPDATE_INTERVAL = 33; // ~30 updates per second
  if (!room.lastStateUpdate || now - room.lastStateUpdate >= STATE_UPDATE_INTERVAL) {
    room.lastStateUpdate = now;
    io.to(room.id).emit('stateUpdate', {
      players: room.players,
      projectiles: room.projectiles,
      zombies: room.zombies,
      items: room.items,
      grenades: room.grenades,
      teamScore: room.teamScore
    });
  }
}

// ... Keep PORT and listen at bottom ...


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});
