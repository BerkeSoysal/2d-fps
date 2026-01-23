// Shared Game Logic - runs on both server (multiplayer) and client (single player)
// This module is environment-agnostic and uses callbacks for events

(function(exports) {
  'use strict';

  // ==========================================
  // SEEDED PRNG (Mulberry32)
  // ==========================================
  function createSeededRNG(seed) {
    let state = seed >>> 0; // Ensure unsigned 32-bit
    return {
      // Returns float between 0 and 1 (like Math.random())
      next: function() {
        state |= 0;
        state = state + 0x6D2B79F5 | 0;
        let t = Math.imul(state ^ state >>> 15, 1 | state);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      },
      // Returns integer between min (inclusive) and max (exclusive)
      nextInt: function(min, max) {
        return Math.floor(this.next() * (max - min)) + min;
      },
      // Returns current state (for debugging/serialization)
      getState: function() {
        return state;
      }
    };
  }

  // ==========================================
  // CONSTANTS
  // ==========================================
  const CONSTANTS = {
    MAX_SPEED: 5,
    ACCELERATION: 0.5,
    FRICTION: 0.85,
    PROJECTILE_SPEED: 18,
    ZOMBIE_SPEED: 2.2,
    CANVAS_WIDTH: 2000,
    CANVAS_HEIGHT: 1200,
    ZOMBIE_SPAWN_INTERVAL: 500,
    ZOMBIE_HP: 30,
    MAX_PHASE: 10,
    ZOMBIE_HEARING_RADIUS: 150,
    ZOMBIE_ALERT_DURATION: 5000,
    MAX_ZOMBIES_ON_SCREEN: 15,
    ITEM_SPAWN_INTERVAL: 15000,
    MAX_ITEMS: 5,
    // Zombie lunge attack
    ZOMBIE_LUNGE_DISTANCE: 120,
    ZOMBIE_LUNGE_SPEED: 8,
    ZOMBIE_LUNGE_DURATION: 250,
    ZOMBIE_LUNGE_REST: 600,
    ZOMBIE_LUNGE_COOLDOWN: 2000,
    ZOMBIE_BASE_SPEED: 2.2,
    // Grenade constants
    GRENADE_SPEED: 12,
    GRENADE_FRICTION: 0.95,
    GRENADE_MAX_DISTANCE: 350,
    GRENADE_FUSE_TIME: 2000,
    GRENADE_BLAST_RADIUS: 150,
    GRENADE_DAMAGE: 80,
    GRENADE_MIN_DAMAGE: 20
  };

  const WEAPONS = {
    pistol: { damage: 10, speed: 18, range: 1000, spread: 0 },
    machine_gun: { damage: 12, speed: 20, range: 800, spread: 0.1, maxAmmo: 50 },
    shotgun: { damage: 25, speed: 15, range: 300, spread: 0.4, pellets: 5, maxAmmo: 12 }
  };

  const ITEM_TYPES = ['health', 'machine_gun', 'shotgun', 'grenade'];

  const SKINS = [
    'hitman1', 'manBlue', 'manBrown', 'manOld', 'robot1', 'soldier1', 'survivor1', 'womanGreen'
  ];

  // ==========================================
  // MAP DATA
  // ==========================================
  const floors = [
    // Extended to show through windows
    { x: 580, y: 380, w: 560, h: 450, tile: 'wood' },
    { x: 580, y: 800, w: 340, h: 240, tile: 'wood' },
    { x: 1100, y: 400, w: 200, h: 200, tile: 'bathroom' },
    { x: 900, y: 800, w: 200, h: 240, tile: 'wood' }
  ];

  // Glass windows that can be destroyed by bullets
  const glassTiles = [
    { id: 'glass_top_1', x: 708, y: 380, w: 64, h: 64 },
    { id: 'glass_top_2', x: 772, y: 380, w: 64, h: 64 },
    { id: 'glass_top_3', x: 900, y: 380, w: 64, h: 64 },
    { id: 'glass_top_4', x: 964, y: 380, w: 64, h: 64 },
    { id: 'glass_left_1', x: 580, y: 508, w: 64, h: 64 },
    { id: 'glass_left_2', x: 580, y: 572, w: 64, h: 64 }
  ];

  const decorations = [
    { x: 700, y: 840, w: 128, h: 64, tile: 'couch_teal', collidable: true },
    { x: 400, y: 300, w: 64, h: 64, tile: 'bush', collidable: true },
    { x: 450, y: 350, w: 64, h: 64, tile: 'bush', collidable: true },
    { x: 1450, y: 600, w: 64, h: 64, tile: 'bush', collidable: true },
    { x: 300, y: 900, w: 64, h: 64, tile: 'bush', collidable: true },
    { x: 1500, y: 300, w: 64, h: 64, tile: 'crate', collidable: true },
    { x: 1564, y: 300, w: 64, h: 64, tile: 'crate', collidable: true },
    // Kitchen wall (shelves with appliances)
    { x: 1016, y: 828, w: 64, h: 64, tile: 'kitchen_shelf', collidable: true },
    { x: 1016, y: 892, w: 64, h: 64, tile: 'kitchen_shelf', collidable: true },
    { x: 1016, y: 956, w: 64, h: 64, tile: 'kitchen_shelf', collidable: true },
    { x: 1016, y: 828, w: 64, h: 64, tile: 'kitchen_323', collidable: true, rotate: -90 },
    { x: 1016, y: 892, w: 64, h: 64, tile: 'kitchen_324', collidable: true, rotate: -90 },
    { x: 1016, y: 956, w: 64, h: 64, tile: 'kitchen_268', collidable: true, rotate: -90 }
  ];

  // Collision walls (rectangles for physics)
  const buildingWalls = [
    // Main house top wall (thinner for window visibility)
    { x: 580, y: 380, w: 540, h: 32 },
    // Main house left wall (thinner for window visibility)
    { x: 580, y: 380, w: 32, h: 384 },
    // Divider wall left section (with doorway gap from 836-888)
    { x: 580, y: 764, w: 256, h: 64 },
    // Divider wall right section
    { x: 888, y: 764, w: 192, h: 64 },
    // Bathroom top wall
    { x: 1092, y: 380, w: 228, h: 64 },
    // Bathroom right wall
    { x: 1284, y: 380, w: 64, h: 256 },
    // Bathroom bottom wall
    { x: 1092, y: 572, w: 256, h: 64 },
    // Bathroom left wall (with door gap)
    { x: 1092, y: 400, w: 64, h: 108 },
    // Lower left room left wall
    { x: 580, y: 764, w: 64, h: 320 },
    // Bottom wall left section
    { x: 580, y: 1020, w: 384, h: 64 },
    // Bottom wall right section
    { x: 900, y: 1020, w: 244, h: 64 },
    // Lower right room right wall
    { x: 1080, y: 764, w: 64, h: 320 }
  ];

  // Visual wall tiles (for rendering)
  // Use rotate: 90 for vertical walls (rotated tile_113)
  const wallTiles = [
    // Main house top wall (with windows)
    { x: 580, y: 380, tile: 'nw_corner' },
    { x: 644, y: 380, tile: 'horizontal' },
    { x: 708, y: 380, tile: 'glass_horizontal' },
    { x: 772, y: 380, tile: 'glass_horizontal' },
    { x: 836, y: 380, tile: 'horizontal' },
    { x: 900, y: 380, tile: 'glass_horizontal' },
    { x: 964, y: 380, tile: 'glass_horizontal' },
    { x: 1028, y: 380, tile: 'horizontal' },
    { x: 1092, y: 380, tile: 'separator_down' },
    // Main house left wall (with windows)
    { x: 580, y: 444, tile: 'horizontal', rotate: 90 },
    { x: 580, y: 508, tile: 'glass_vertical' },
    { x: 580, y: 572, tile: 'glass_vertical' },
    { x: 580, y: 636, tile: 'horizontal', rotate: 90 },
    { x: 580, y: 700, tile: 'horizontal', rotate: 90 },
    // Divider wall left section (intersection at y:764 covers down to divider)
    { x: 580, y: 764, tile: 'separator_down', rotate: -90 },
    { x: 644, y: 764, tile: 'horizontal' },
    { x: 708, y: 764, tile: 'horizontal' },
    { x: 772, y: 764, tile: 'end_right' },
    // Divider wall right section (doorway gap, then horizontal at y:764)
    { x: 888, y: 764, tile: 'end_right', rotate: 180 },
    { x: 952, y: 764, tile: 'horizontal' },
    { x: 1016, y: 764, tile: 'horizontal' },
    // Bathroom top wall
    { x: 1156, y: 380, tile: 'horizontal' },
    { x: 1220, y: 380, tile: 'horizontal' },
    { x: 1284, y: 380, tile: 'ne_corner' },
    // Bathroom right wall (vertical)
    { x: 1284, y: 444, tile: 'horizontal', rotate: 90 },
    { x: 1284, y: 508, tile: 'horizontal', rotate: 90 },
    { x: 1284, y: 572, tile: 'nw_corner', rotate: 180 },
    // Bathroom bottom wall
    { x: 1092, y: 572, tile: 'end_right', rotate: 180 },
    { x: 1156, y: 572, tile: 'horizontal' },
    { x: 1220, y: 572, tile: 'horizontal' },
    // Internal wall between main and bathroom (with door gap)
    { x: 1092, y: 444, tile: 'end_down' },
    // Lower left room walls (vertical - rotated tile_111)
    { x: 580, y: 828, tile: 'horizontal', rotate: 90 },
    { x: 580, y: 892, tile: 'horizontal', rotate: 90 },
    { x: 580, y: 956, tile: 'horizontal', rotate: 90 },
    { x: 580, y: 1020, tile: 'ne_corner', rotate: 180 },
    { x: 644, y: 1020, tile: 'horizontal' },
    { x: 708, y: 1020, tile: 'horizontal' },
    { x: 772, y: 1020, tile: 'horizontal' },
    { x: 836, y: 1020, tile: 'horizontal' },
    // Room divider bottom connection
    { x: 900, y: 1020, tile: 'horizontal' },
    // Right side bottom wall
    { x: 964, y: 1020, tile: 'horizontal' },
    { x: 1028, y: 1020, tile: 'horizontal' },
    // Lower right room right wall (vertical) - corner connects to divider
    { x: 1080, y: 764, tile: 'ne_corner' },
    { x: 1080, y: 828, tile: 'horizontal', rotate: 90 },
    { x: 1080, y: 892, tile: 'horizontal', rotate: 90 },
    { x: 1080, y: 956, tile: 'horizontal', rotate: 90 },
    { x: 1080, y: 1020, tile: 'nw_corner', rotate: 180 }
  ];

  // ==========================================
  // HELPER FUNCTIONS
  // ==========================================
  function getPhaseZombieCount(phase) {
    return 15 + (phase - 1) * 12;
  }

  function getZombieSpeed(phase) {
    return CONSTANTS.ZOMBIE_SPEED + (phase - 1) * 0.2;
  }

  function getZombieSightRadius(phase) {
    return 400 + (phase - 1) * 20;
  }

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

  function checkDecorationCollision(x, y, radius) {
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

  function checkGlassCollision(x, y, destroyedGlass) {
    for (const glass of glassTiles) {
      if (destroyedGlass && destroyedGlass.includes(glass.id)) continue;
      if (x >= glass.x && x <= glass.x + glass.w && y >= glass.y && y <= glass.y + glass.h) {
        return glass;
      }
    }
    return false;
  }

  function canSeePlayer(zombie, player, currentPhase) {
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

  function findSafeSpawnPosition() {
    let x, y, attempts = 0;
    do {
      x = 100 + Math.random() * (CONSTANTS.CANVAS_WIDTH - 200);
      y = 100 + Math.random() * (CONSTANTS.CANVAS_HEIGHT - 200);
      attempts++;
    } while ((checkWallCollision(x, y, 25) || checkDecorationCollision(x, y, 25)) && attempts < 100);
    return { x, y };
  }

  function findSafeSpawnPositionWithRNG(rng) {
    let x, y, attempts = 0;
    do {
      x = 100 + rng.next() * (CONSTANTS.CANVAS_WIDTH - 200);
      y = 100 + rng.next() * (CONSTANTS.CANVAS_HEIGHT - 200);
      attempts++;
    } while ((checkWallCollision(x, y, 25) || checkDecorationCollision(x, y, 25)) && attempts < 100);
    return { x, y };
  }

  // ==========================================
  // GAME STATE FACTORY
  // ==========================================
  let zombieIdCounter = 0;
  let itemIdCounter = 0;
  let grenadeIdCounter = 0;

  function createGameState(playerId, playerName, seed) {
    // Use provided seed or generate random one
    const gameSeed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
    const rng = createSeededRNG(gameSeed);

    const spawnPos = findSafeSpawnPositionWithRNG(rng);
    const skin = SKINS[rng.nextInt(0, SKINS.length)];

    return {
      seed: gameSeed,
      rng: rng,
      frame: 0,
      players: {
        [playerId]: {
          x: spawnPos.x,
          y: spawnPos.y,
          angle: 0,
          hp: 100,
          vx: 0,
          vy: 0,
          playerId: playerId,
          name: playerName,
          skin: skin,
          score: 0,
          weapon: 'pistol',
          ammo: 0,
          grenades: 0,
          input: { up: false, down: false, left: false, right: false }
        }
      },
      projectiles: [],
      zombies: [],
      grenades: [],
      items: [],
      destroyedGlass: [],
      currentPhase: 1,
      zombiesSpawnedThisPhase: 0,
      zombiesKilledThisPhase: 0,
      phaseInProgress: false,
      phaseStartTime: Date.now(),
      lastZombieSpawnTime: 0,
      lastItemSpawnTime: 0,
      isPaused: false,
      inputLog: [] // For replay verification
    };
  }

  // ==========================================
  // SHOOTING
  // ==========================================
  function createProjectile(player, gameState) {
    const weapon = WEAPONS[player.weapon] || WEAPONS.pistol;
    const projectiles = [];

    // Check ammo for special weapons
    if (player.weapon !== 'pistol') {
      if (player.ammo <= 0) {
        player.weapon = 'pistol';
        player.ammo = 0;
        return { projectiles: [], weaponChanged: true, newWeapon: 'pistol' };
      }
      player.ammo--;
    }

    if (player.weapon === 'shotgun') {
      const pelletCount = weapon.pellets;
      const totalSpread = weapon.spread * 2;
      for (let i = 0; i < pelletCount; i++) {
        // Evenly distribute pellets across the spread arc
        const spreadOffset = (i / (pelletCount - 1)) * totalSpread - weapon.spread;
        const spreadAngle = player.angle + spreadOffset + (gameState.rng.next() - 0.5) * 0.05;
        projectiles.push({
          x: player.x, y: player.y,
          vx: Math.cos(spreadAngle) * weapon.speed,
          vy: Math.sin(spreadAngle) * weapon.speed,
          ownerId: player.playerId,
          damage: weapon.damage,
          range: weapon.range,
          distanceTraveled: 0
        });
      }
    } else {
      const spreadAngle = player.angle + (gameState.rng.next() - 0.5) * weapon.spread * 2;
      projectiles.push({
        x: player.x, y: player.y,
        vx: Math.cos(spreadAngle) * weapon.speed,
        vy: Math.sin(spreadAngle) * weapon.speed,
        ownerId: player.playerId,
        damage: weapon.damage,
        range: weapon.range,
        distanceTraveled: 0
      });
    }

    return { projectiles, weaponChanged: false, ammo: player.ammo };
  }

  // ==========================================
  // GRENADE THROWING
  // ==========================================
  function createGrenade(player, gameState) {
    if (player.grenades <= 0) return null;

    player.grenades--;

    const C = CONSTANTS;
    return {
      id: 'g_' + (++grenadeIdCounter),
      x: player.x,
      y: player.y,
      vx: Math.cos(player.angle) * C.GRENADE_SPEED,
      vy: Math.sin(player.angle) * C.GRENADE_SPEED,
      ownerId: player.playerId,
      spawnTime: Date.now(),
      distanceTraveled: 0
    };
  }

  // ==========================================
  // MAIN UPDATE FUNCTION
  // ==========================================
  function updateGameState(gameState, now, events) {
    // events is a callback object: { onHurt, onHit, onZombieHit, onZombieDeath, onPlayerDeath, onZombieRoar, onPhaseChange, onPhaseClear, onHeal, onWeaponPickup }
    events = events || {};

    const C = CONSTANTS;

    // 0. Process Player Movement
    for (const id in gameState.players) {
      const player = gameState.players[id];
      if (player.hp <= 0) continue;

      const input = player.input || { up: false, down: false, left: false, right: false };

      if (input.left) player.vx -= C.ACCELERATION;
      if (input.right) player.vx += C.ACCELERATION;
      if (input.up) player.vy -= C.ACCELERATION;
      if (input.down) player.vy += C.ACCELERATION;

      const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      if (speed > C.MAX_SPEED) {
        player.vx = (player.vx / speed) * C.MAX_SPEED;
        player.vy = (player.vy / speed) * C.MAX_SPEED;
      }

      if (!input.left && !input.right) player.vx *= C.FRICTION;
      if (!input.up && !input.down) player.vy *= C.FRICTION;

      if (Math.abs(player.vx) < 0.1) player.vx = 0;
      if (Math.abs(player.vy) < 0.1) player.vy = 0;

      let newX = player.x + player.vx;
      let newY = player.y + player.vy;

      newX = Math.max(0, Math.min(C.CANVAS_WIDTH, newX));
      newY = Math.max(0, Math.min(C.CANVAS_HEIGHT, newY));

      if (!checkWallCollision(newX, player.y, 20) && !checkDecorationCollision(newX, player.y, 15)) {
        player.x = newX;
      } else {
        // Wall slide: blocked on X, slide vertically opposite to aim direction
        player.vx = 0;
        if (input.left || input.right) {
          const aimY = Math.sin(player.angle);
          const slideSpeed = C.ACCELERATION * 0.8;
          // If aiming down, slide up; if aiming up, slide down
          player.vy += aimY > 0 ? -slideSpeed : slideSpeed;
        }
      }

      if (!checkWallCollision(player.x, newY, 20) && !checkDecorationCollision(player.x, newY, 15)) {
        player.y = newY;
      } else {
        // Wall slide: blocked on Y, slide horizontally opposite to aim direction
        player.vy = 0;
        if (input.up || input.down) {
          const aimX = Math.cos(player.angle);
          const slideSpeed = C.ACCELERATION * 0.8;
          // If aiming right, slide left; if aiming left, slide right
          player.vx += aimX > 0 ? -slideSpeed : slideSpeed;
        }
      }
    }

    // 1. Process Projectiles
    for (let i = gameState.projectiles.length - 1; i >= 0; i--) {
      const p = gameState.projectiles[i];
      const projSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.x += p.vx;
      p.y += p.vy;
      p.distanceTraveled = (p.distanceTraveled || 0) + projSpeed;

      if (p.range && p.distanceTraveled > p.range) {
        gameState.projectiles.splice(i, 1);
        continue;
      }

      if (p.x < -100 || p.x > C.CANVAS_WIDTH + 100 || p.y < -100 || p.y > C.CANVAS_HEIGHT + 100) {
        gameState.projectiles.splice(i, 1);
        continue;
      }

      // Check glass collision first
      let hitGlass = null;
      let glassIsDestroyed = false;
      for (const glass of glassTiles) {
        if (p.x >= glass.x && p.x <= glass.x + glass.w && p.y >= glass.y && p.y <= glass.y + glass.h) {
          hitGlass = glass;
          glassIsDestroyed = gameState.destroyedGlass.indexOf(glass.id) !== -1;
          break;
        }
      }
      if (hitGlass && !glassIsDestroyed) {
        // Glass not destroyed - destroy it and stop bullet
        gameState.destroyedGlass.push(hitGlass.id);
        if (events.onGlassBreak) events.onGlassBreak(hitGlass);
        gameState.projectiles.splice(i, 1);
        continue;
      }

      // Skip wall collision if bullet is passing through destroyed glass
      if (!glassIsDestroyed) {
        let hitWall = false;
        for (const wall of buildingWalls) {
          if (p.x >= wall.x && p.x <= wall.x + wall.w && p.y >= wall.y && p.y <= wall.y + wall.h) {
            hitWall = true;
            break;
          }
        }
        if (hitWall) {
          gameState.projectiles.splice(i, 1);
          continue;
        }
      }

      const damage = p.damage || 10;
      const isZombieProjectile = p.isZombieProjectile || false;

      // Alert nearby zombies to bullet sound
      if (!isZombieProjectile && p.ownerId) {
        const shooter = gameState.players[p.ownerId];
        if (shooter) {
          for (const zombie of gameState.zombies) {
            const dx = p.x - zombie.x, dy = p.y - zombie.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < C.ZOMBIE_HEARING_RADIUS && !zombie.targetId) {
              zombie.alertedPosition = { x: shooter.x, y: shooter.y };
              zombie.alertedTime = now;
            }
          }
        }
      }

      // Hit Player
      for (const id in gameState.players) {
        const player = gameState.players[id];
        const canHit = isZombieProjectile || p.ownerId !== id;
        if (canHit && player.hp > 0) {
          const dx = p.x - player.x, dy = p.y - player.y;
          if (Math.sqrt(dx * dx + dy * dy) < 20) {
            player.hp -= damage;
            if (events.onHurt) events.onHurt(id);
            if (!isZombieProjectile && events.onHit) events.onHit(p.ownerId);
            gameState.projectiles.splice(i, 1);
            if (player.hp <= 0) {
              player.hp = 0;
              const killerName = isZombieProjectile ? '🧟 Armed Zombie' : (gameState.players[p.ownerId]?.name || 'Unknown');
              if (events.onPlayerDeath) events.onPlayerDeath({ x: player.x, y: player.y, killerName, victimName: player.name });
            }
            break;
          }
        }
      }

      if (i >= gameState.projectiles.length) continue;

      // Hit Zombie
      if (!isZombieProjectile) {
        for (const zombie of gameState.zombies) {
          const dx = p.x - zombie.x, dy = p.y - zombie.y;
          if (Math.sqrt(dx * dx + dy * dy) < 20) {
            zombie.hp -= damage;

            if (events.onZombieHit) events.onZombieHit(p.ownerId);

            const shooter = gameState.players[p.ownerId];
            if (shooter) {
              zombie.alertedPosition = { x: shooter.x, y: shooter.y };
              zombie.alertedTime = now;
            }

            // Knockback
            const knockbackStrength = 8;
            const pSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
            if (pSpeed > 0) {
              const knockX = (p.vx / pSpeed) * knockbackStrength;
              const knockY = (p.vy / pSpeed) * knockbackStrength;
              const newX = zombie.x + knockX;
              const newY = zombie.y + knockY;
              if (!checkWallCollision(newX, newY, 15) && !checkDecorationCollision(newX, newY, 15)) {
                zombie.x = Math.max(0, Math.min(C.CANVAS_WIDTH, newX));
                zombie.y = Math.max(0, Math.min(C.CANVAS_HEIGHT, newY));
              }
            }

            gameState.projectiles.splice(i, 1);
            if (zombie.hp <= 0) {
              if (events.onZombieDeath) events.onZombieDeath({ x: zombie.x, y: zombie.y });
              gameState.zombiesKilledThisPhase++;
              const killer = gameState.players[p.ownerId];
              if (killer) {
                killer.score += zombie.weapon ? 75 : 50;
              }
            }
            break;
          }
        }
      }
    }

    // 1.5 Process Grenades
    for (let i = gameState.grenades.length - 1; i >= 0; i--) {
      const g = gameState.grenades[i];

      // Apply friction
      g.vx *= C.GRENADE_FRICTION;
      g.vy *= C.GRENADE_FRICTION;

      // Move grenade
      const speed = Math.sqrt(g.vx * g.vx + g.vy * g.vy);
      const newX = g.x + g.vx;
      const newY = g.y + g.vy;
      g.distanceTraveled += speed;

      // Check wall/decoration collision - stop moving
      let hitObstacle = false;
      if (checkWallCollision(newX, newY, 8) || checkDecorationCollision(newX, newY, 8)) {
        hitObstacle = true;
        g.vx = 0;
        g.vy = 0;
      } else {
        g.x = newX;
        g.y = newY;
      }

      // Stop if max distance reached
      if (g.distanceTraveled >= C.GRENADE_MAX_DISTANCE) {
        g.vx = 0;
        g.vy = 0;
      }

      // Check fuse time - explode
      if (now - g.spawnTime >= C.GRENADE_FUSE_TIME) {
        // Damage all players in blast radius
        for (const id in gameState.players) {
          const player = gameState.players[id];
          if (player.hp <= 0) continue;

          const dx = player.x - g.x;
          const dy = player.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < C.GRENADE_BLAST_RADIUS) {
            const damage = Math.floor(
              C.GRENADE_MIN_DAMAGE + (C.GRENADE_DAMAGE - C.GRENADE_MIN_DAMAGE) * (1 - dist / C.GRENADE_BLAST_RADIUS)
            );
            player.hp -= damage;
            if (events.onHurt) events.onHurt(id);

            if (player.hp <= 0) {
              player.hp = 0;
              const thrower = gameState.players[g.ownerId];
              const killerName = thrower ? thrower.name : 'Grenade';
              if (events.onPlayerDeath) events.onPlayerDeath({ x: player.x, y: player.y, killerName, victimName: player.name });
            }
          }
        }

        // Damage zombies in blast radius
        for (const zombie of gameState.zombies) {
          const dx = zombie.x - g.x;
          const dy = zombie.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < C.GRENADE_BLAST_RADIUS) {
            const damage = Math.floor(
              C.GRENADE_MIN_DAMAGE + (C.GRENADE_DAMAGE - C.GRENADE_MIN_DAMAGE) * (1 - dist / C.GRENADE_BLAST_RADIUS)
            );
            zombie.hp -= damage;

            if (zombie.hp <= 0) {
              if (events.onZombieDeath) events.onZombieDeath({ x: zombie.x, y: zombie.y });
              gameState.zombiesKilledThisPhase++;
              const killer = gameState.players[g.ownerId];
              if (killer) {
                killer.score += zombie.weapon ? 75 : 50;
              }
            }
          }
        }

        // Trigger explosion event
        if (events.onGrenadeExplode) events.onGrenadeExplode({ x: g.x, y: g.y, id: g.id });

        // Remove grenade
        gameState.grenades.splice(i, 1);
      }
    }

    // 2. Cleanup Dead Zombies (respawn in training mode)
    for (let i = gameState.zombies.length - 1; i >= 0; i--) {
      if (gameState.zombies[i].hp <= 0) {
        if (gameState.isTrainingMode) {
          // Respawn zombie at a new random location
          gameState.zombies[i].hp = 30;
          gameState.zombies[i].x = 200 + gameState.rng.next() * 1600;
          gameState.zombies[i].y = 100 + gameState.rng.next() * 1000;
          gameState.zombies[i].angle = gameState.rng.next() * Math.PI * 2;
        } else {
          gameState.zombies.splice(i, 1);
        }
      }
    }

    // 3. Zombie Logic
    const activePlayers = Object.values(gameState.players).filter(p => p.hp > 0);

    for (const zombie of gameState.zombies) {
      // Training mode: zombies don't move or attack
      if (gameState.isTrainingMode || zombie.isTrainingZombie) {
        zombie.angle = Math.atan2(
          (activePlayers[0]?.y || zombie.y) - zombie.y,
          (activePlayers[0]?.x || zombie.x) - zombie.x
        );
        continue;
      }

      let target = null;
      const hadTarget = !!zombie.targetId;

      if (zombie.targetId && gameState.players[zombie.targetId] && gameState.players[zombie.targetId].hp > 0) {
        if (canSeePlayer(zombie, gameState.players[zombie.targetId], gameState.currentPhase)) {
          target = gameState.players[zombie.targetId];
        } else {
          zombie.targetId = null;
        }
      }

      if (!target && activePlayers.length > 0) {
        let minDist = Infinity;
        for (const p of activePlayers) {
          const dist = Math.sqrt((p.x - zombie.x) ** 2 + (p.y - zombie.y) ** 2);
          if (dist < minDist && canSeePlayer(zombie, p, gameState.currentPhase)) {
            minDist = dist;
            target = p;
            zombie.targetId = p.playerId;
          }
        }

        if (target && !hadTarget) {
          if (events.onZombieRoar) events.onZombieRoar(target.playerId);
        }
      }

      if (target) {
        const dx = target.x - zombie.x;
        const dy = target.y - zombie.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          let speed = zombie.speed || C.ZOMBIE_SPEED;
          let moveX = dx / dist;
          let moveY = dy / dist;

          // Lunge attack for unarmed zombies
          if (!zombie.weapon) {
            if (zombie.lungeStartTime && now - zombie.lungeStartTime < C.ZOMBIE_LUNGE_DURATION) {
              speed = C.ZOMBIE_LUNGE_SPEED;
              moveX = zombie.lungeDirX;
              moveY = zombie.lungeDirY;
            } else if (zombie.lungeStartTime && now - zombie.lungeStartTime >= C.ZOMBIE_LUNGE_DURATION) {
              // Lunge just ended - start rest period
              zombie.lungeStartTime = null;
              zombie.restStartTime = now;
            } else if (zombie.restStartTime && now - zombie.restStartTime < C.ZOMBIE_LUNGE_REST) {
              // Resting after lunge - zombie pauses to recover
              speed = 0;
            } else if (zombie.restStartTime && now - zombie.restStartTime >= C.ZOMBIE_LUNGE_REST) {
              // Rest period ended - set cooldown and resume normal behavior
              zombie.restStartTime = null;
              zombie.lastLungeTime = now;
            } else if (dist <= C.ZOMBIE_LUNGE_DISTANCE && dist > 25) {
              if (!zombie.lastLungeTime || now - zombie.lastLungeTime > C.ZOMBIE_LUNGE_COOLDOWN) {
                zombie.lungeStartTime = now;
                zombie.lungeDirX = dx / dist;
                zombie.lungeDirY = dy / dist;
                speed = C.ZOMBIE_LUNGE_SPEED;
                moveX = zombie.lungeDirX;
                moveY = zombie.lungeDirY;
                if (events.onZombieLunge) events.onZombieLunge(zombie.id, zombie.x, zombie.y);
              }
            }
          }

          const newX = zombie.x + moveX * speed;
          const newY = zombie.y + moveY * speed;

          // Check if zombie is lunging through destroyed glass
          const isLunging = zombie.lungeStartTime && now - zombie.lungeStartTime < C.ZOMBIE_LUNGE_DURATION;
          let canPassThroughX = false;
          let canPassThroughY = false;

          if (isLunging && gameState.destroyedGlass.length > 0) {
            for (const glass of glassTiles) {
              if (gameState.destroyedGlass.indexOf(glass.id) !== -1) {
                // For X movement: check if zombie's X path crosses the glass X range
                // and zombie's Y is near the glass Y range (with margin for approach)
                const inGlassXRange = (zombie.x >= glass.x - 20 && zombie.x <= glass.x + glass.w + 20) ||
                                      (newX >= glass.x - 20 && newX <= glass.x + glass.w + 20);
                const nearGlassY = zombie.y >= glass.y - 40 && zombie.y <= glass.y + glass.h + 40;

                // For Y movement: check if zombie's Y path crosses the glass Y range
                // and zombie's X is near the glass X range (with margin for approach)
                const inGlassYRange = (zombie.y >= glass.y - 20 && zombie.y <= glass.y + glass.h + 20) ||
                                      (newY >= glass.y - 20 && newY <= glass.y + glass.h + 20);
                const nearGlassX = zombie.x >= glass.x - 40 && zombie.x <= glass.x + glass.w + 40;

                if (inGlassXRange && nearGlassY) canPassThroughX = true;
                if (inGlassYRange && nearGlassX) canPassThroughY = true;
              }
            }
          }

          if (canPassThroughX || !checkWallCollision(newX, zombie.y, 15)) zombie.x = newX;
          if (canPassThroughY || !checkWallCollision(zombie.x, newY, 15)) zombie.y = newY;
          zombie.angle = Math.atan2(dy, dx);
        }
        zombie.wandering = false;

        // Armed zombie shooting
        if (zombie.weapon && dist > 50 && dist < 400) {
          const shootInterval = zombie.weapon === 'machine_gun' ? 300 : (zombie.weapon === 'shotgun' ? 1500 : 800);
          if (now - zombie.lastShootTime > shootInterval) {
            zombie.lastShootTime = now;

            if (zombie.weapon === 'shotgun') {
              for (let i = 0; i < 3; i++) {
                const spreadAngle = zombie.angle + (gameState.rng.next() - 0.5) * 0.6;
                gameState.projectiles.push({
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
              const spread = zombie.weapon === 'machine_gun' ? 0.15 : 0.05;
              const spreadAngle = zombie.angle + (gameState.rng.next() - 0.5) * spread;
              gameState.projectiles.push({
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

        // Melee Attack
        if (dist < 25 && !zombie.weapon) {
          target.hp -= 10;
          if (events.onHurt) events.onHurt(target.playerId);
          zombie.x -= (dx / dist) * 30;
          zombie.y -= (dy / dist) * 30;
          zombie.targetId = null;

          if (target.hp <= 0) {
            target.hp = 0;
            if (events.onPlayerDeath) events.onPlayerDeath({ x: target.x, y: target.y, killerName: '🧟 Zombie', victimName: target.name });
          }
        }

      } else if (zombie.alertedPosition && now - zombie.alertedTime < C.ZOMBIE_ALERT_DURATION) {
        const dx = zombie.alertedPosition.x - zombie.x;
        const dy = zombie.alertedPosition.y - zombie.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 30) {
          const speed = (zombie.speed || C.ZOMBIE_SPEED) * 0.8;
          const newX = zombie.x + (dx / dist) * speed;
          const newY = zombie.y + (dy / dist) * speed;

          if (!checkWallCollision(newX, zombie.y, 15)) zombie.x = newX;
          if (!checkWallCollision(zombie.x, newY, 15)) zombie.y = newY;
          zombie.angle = Math.atan2(dy, dx);
        } else {
          zombie.alertedPosition = null;
        }
        zombie.wandering = false;

      } else {
        if (zombie.alertedPosition && now - zombie.alertedTime >= C.ZOMBIE_ALERT_DURATION) {
          zombie.alertedPosition = null;
        }

        if (!zombie.wandering || gameState.rng.next() < 0.02) {
          zombie.wanderAngle = gameState.rng.next() * Math.PI * 2;
          zombie.wandering = true;
        }

        const wanderX = zombie.x + Math.cos(zombie.wanderAngle) * 1;
        const wanderY = zombie.y + Math.sin(zombie.wanderAngle) * 1;

        if (!checkWallCollision(wanderX, zombie.y, 15)) {
          zombie.x = wanderX;
        } else {
          zombie.wanderAngle = Math.PI - zombie.wanderAngle;
        }
        if (!checkWallCollision(zombie.x, wanderY, 15)) {
          zombie.y = wanderY;
        } else {
          zombie.wanderAngle = -zombie.wanderAngle;
        }
        zombie.angle = zombie.wanderAngle;

        if (zombie.x < 0 || zombie.x > C.CANVAS_WIDTH) zombie.wanderAngle = Math.PI - zombie.wanderAngle;
        if (zombie.y < 0 || zombie.y > C.CANVAS_HEIGHT) zombie.wanderAngle = -zombie.wanderAngle;
      }
    }

    // 4. Phase Management & Spawning
    if (activePlayers.length > 0) {
      if (!gameState.phaseInProgress) {
        gameState.phaseInProgress = true;
        gameState.zombiesSpawnedThisPhase = 0;
        gameState.zombiesKilledThisPhase = 0;
        gameState.phaseStartTime = now;
        if (events.onPhaseChange) events.onPhaseChange({ phase: gameState.currentPhase, message: `Phase ${gameState.currentPhase} Starting!` });
      }

      const phaseTotal = getPhaseZombieCount(gameState.currentPhase);

      if (gameState.zombiesKilledThisPhase >= phaseTotal && gameState.zombies.length === 0) {
        const phaseTime = (now - gameState.phaseStartTime) / 1000;
        const timeBonus = Math.max(100, Math.floor(1000 - phaseTime * 10));
        const phaseBonus = gameState.currentPhase * 100;
        const totalBonus = timeBonus + phaseBonus;

        for (const player of activePlayers) {
          player.score += totalBonus;
        }

        if (events.onPhaseClear) events.onPhaseClear({
          phase: gameState.currentPhase,
          timeBonus,
          phaseBonus,
          totalBonus,
          timeSeconds: Math.floor(phaseTime)
        });

        if (gameState.currentPhase < C.MAX_PHASE) {
          gameState.currentPhase++;
          gameState.zombiesSpawnedThisPhase = 0;
          gameState.zombiesKilledThisPhase = 0;
          gameState.phaseStartTime = now;
          if (events.onPhaseChange) events.onPhaseChange({ phase: gameState.currentPhase, message: `Phase ${gameState.currentPhase} Starting!` });
        } else {
          if (events.onPhaseChange) events.onPhaseChange({ phase: gameState.currentPhase, message: 'You Win!' });
          gameState.phaseInProgress = false;
        }
      }

      // Spawn Zombies
      if (gameState.zombiesSpawnedThisPhase < phaseTotal && gameState.zombies.length < C.MAX_ZOMBIES_ON_SCREEN) {
        if (now - gameState.lastZombieSpawnTime > C.ZOMBIE_SPAWN_INTERVAL) {
          const edge = gameState.rng.nextInt(0, 4);
          let zx, zy;
          switch (edge) {
            case 0: zx = gameState.rng.next() * C.CANVAS_WIDTH; zy = 20; break;
            case 1: zx = C.CANVAS_WIDTH - 20; zy = gameState.rng.next() * C.CANVAS_HEIGHT; break;
            case 2: zx = gameState.rng.next() * C.CANVAS_WIDTH; zy = C.CANVAS_HEIGHT - 20; break;
            case 3: zx = 20; zy = gameState.rng.next() * C.CANVAS_HEIGHT; break;
          }

          let zombieWeapon = null;
          let zombieHP = C.ZOMBIE_HP;
          const phase = gameState.currentPhase;

          if (phase >= 3) {
            const armedChance = phase >= 7 ? 0.4 : (phase >= 5 ? 0.3 : 0.2);
            if (gameState.rng.next() < armedChance) {
              if (phase >= 7) {
                const weapons = ['pistol', 'shotgun', 'machine_gun'];
                zombieWeapon = weapons[gameState.rng.nextInt(0, weapons.length)];
              } else if (phase >= 5) {
                zombieWeapon = gameState.rng.next() < 0.5 ? 'pistol' : 'shotgun';
              } else {
                zombieWeapon = 'pistol';
              }
              zombieHP = C.ZOMBIE_HP + 20;
            }
          }

          gameState.zombies.push({
            id: 'z_' + (++zombieIdCounter),
            x: zx, y: zy, angle: 0, hp: zombieHP,
            targetId: activePlayers[gameState.rng.nextInt(0, activePlayers.length)]?.playerId,
            speed: getZombieSpeed(gameState.currentPhase),
            weapon: zombieWeapon,
            lastShootTime: 0
          });

          gameState.zombiesSpawnedThisPhase++;
          gameState.lastZombieSpawnTime = now;
        }
      }

      // Spawn Items
      if (gameState.items.length < C.MAX_ITEMS && now - gameState.lastItemSpawnTime > C.ITEM_SPAWN_INTERVAL) {
        let ix, iy, attempts = 0;
        do {
          ix = 150 + gameState.rng.next() * (C.CANVAS_WIDTH - 300);
          iy = 150 + gameState.rng.next() * (C.CANVAS_HEIGHT - 300);
          attempts++;
        } while ((checkWallCollision(ix, iy, 30) || checkDecorationCollision(ix, iy, 30)) && attempts < 50);

        if (attempts < 50) {
          const itemType = ITEM_TYPES[gameState.rng.nextInt(0, ITEM_TYPES.length)];
          gameState.items.push({
            id: 'item_' + (++itemIdCounter),
            x: ix, y: iy,
            type: itemType
          });
          gameState.lastItemSpawnTime = now;
        }
      }

      // Item Pickup
      for (let i = gameState.items.length - 1; i >= 0; i--) {
        const item = gameState.items[i];
        for (const player of activePlayers) {
          const dx = item.x - player.x;
          const dy = item.y - player.y;
          if (Math.sqrt(dx * dx + dy * dy) < 40) {
            if (item.type === 'health') {
              player.hp = Math.min(100, player.hp + 25);
              if (events.onHeal) events.onHeal(player.playerId, player.hp);
            } else if (item.type === 'machine_gun') {
              player.weapon = 'machine_gun';
              player.ammo = WEAPONS.machine_gun.maxAmmo;
              if (events.onWeaponPickup) events.onWeaponPickup(player.playerId, { weapon: 'machine_gun', ammo: player.ammo });
            } else if (item.type === 'shotgun') {
              player.weapon = 'shotgun';
              player.ammo = WEAPONS.shotgun.maxAmmo;
              if (events.onWeaponPickup) events.onWeaponPickup(player.playerId, { weapon: 'shotgun', ammo: player.ammo });
            } else if (item.type === 'grenade') {
              player.grenades = (player.grenades || 0) + 1;
              if (events.onGrenadePickup) events.onGrenadePickup(player.playerId, player.grenades);
            }

            // In training mode, respawn weapons in house after short delay
            if (gameState.isTrainingMode && item.type !== 'health') {
              const weaponType = item.type;
              const originalX = item.x;
              const originalY = item.y;
              gameState.items.splice(i, 1);
              // Respawn weapon at same position after 2 seconds
              setTimeout(() => {
                gameState.items.push({
                  id: 'training_respawn_' + Date.now(),
                  type: weaponType,
                  x: originalX,
                  y: originalY
                });
              }, 2000);
            } else {
              gameState.items.splice(i, 1);
            }
            break;
          }
        }
      }
    }

    return gameState;
  }

  // ==========================================
  // EXPORTS
  // ==========================================
  exports.CONSTANTS = CONSTANTS;
  exports.WEAPONS = WEAPONS;
  exports.SKINS = SKINS;
  exports.ITEM_TYPES = ITEM_TYPES;
  exports.floors = floors;
  exports.decorations = decorations;
  exports.buildingWalls = buildingWalls;
  exports.wallTiles = wallTiles;
  exports.glassTiles = glassTiles;
  exports.checkWallCollision = checkWallCollision;
  exports.checkDecorationCollision = checkDecorationCollision;
  exports.canSeePlayer = canSeePlayer;
  exports.findSafeSpawnPosition = findSafeSpawnPosition;
  exports.getPhaseZombieCount = getPhaseZombieCount;
  exports.getZombieSpeed = getZombieSpeed;
  exports.getZombieSightRadius = getZombieSightRadius;
  exports.createGameState = createGameState;
  exports.createProjectile = createProjectile;
  exports.createGrenade = createGrenade;
  exports.updateGameState = updateGameState;
  exports.createSeededRNG = createSeededRNG;

})(typeof exports === 'undefined' ? (this.GameLogic = {}) : exports);
