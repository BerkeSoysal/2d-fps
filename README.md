# Zombie Survival

A real-time multiplayer top-down zombie shooter game built with Node.js, Express, and Socket.IO.

## Game Overview

Survive waves of zombies in this action-packed browser game. Play solo or team up with friends in multiplayer mode. Fight through 10 phases of increasingly difficult zombie hordes, collect weapons, and try to achieve the highest score.

### Game Modes

- **Single Player** - Survive alone against zombie waves
- **Training Mode** - Practice your skills with infinite respawning zombies and weapons
- **Multiplayer** - Create or join rooms with up to 4 players
- **PvP** - Battle against other players

### Features

- 10 phases of progressively harder zombies
- Multiple weapons: Pistol, Machine Gun, Shotgun
- Throwable grenades with explosion effects
- Armed zombies appear from Phase 3 (pistols, shotguns, machine guns)
- Zombie lunge attacks
- Destructible glass windows (shoot through after breaking)
- Health pickups
- High score leaderboard
- Mobile touch controls with dual joysticks
- Real-time multiplayer with room system
- In-game chat

## How to Run

### Prerequisites

- Node.js (v14 or higher)
- npm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd "cilgin proje"

# Install dependencies
npm install
```

### Running the Game

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

The server runs on `http://localhost:3000` by default (or the PORT environment variable).

### Deployment

The game is configured for deployment on Fly.io:

```bash
fly deploy
```

## Controls

### Desktop

| Key | Action |
|-----|--------|
| W / Arrow Up | Move Up |
| A / Arrow Left | Move Left |
| S / Arrow Down | Move Down |
| D / Arrow Right | Move Right |
| Mouse | Aim |
| Left Click | Shoot |
| G | Throw Grenade |
| ESC | Pause |
| Enter | Chat |

### Mobile

- **Left Joystick** - Movement
- **Right Joystick** - Aim and auto-shoot

## Technical Details

### Architecture

```
├── server.js           # Express + Socket.IO server, game room management
├── public/
│   ├── index.html      # Multi-screen UI (home, lobby, game, game over)
│   ├── game.js         # Client-side rendering, input handling, Socket.IO
│   ├── gameLogic.js    # Shared game logic (runs on both server and client)
│   ├── style.css       # Styling
│   └── kenney_top-down-shooter/  # Sprite assets
```

### Server (`server.js`)

- Express server with Socket.IO for real-time communication
- Room-based game system supporting single-player and multiplayer
- Central game loop at 60fps processes all active rooms
- High scores persisted to JSON file

### Client (`public/game.js`)

- HTML5 Canvas rendering with camera following player
- Pre-rendered static background for performance
- Keyboard and touch input support
- Web Audio API for sound effects

### Shared Logic (`public/gameLogic.js`)

- Deterministic game state updates
- Seeded random number generator for replay consistency
- Collision detection for walls, decorations, and projectiles
- Zombie AI with sight, hearing, and lunge attacks
- Phase progression system

### Key Game Mechanics

- **Zombie Sight**: Zombies detect players within a radius that increases with phase
- **Zombie Hearing**: Gunshots alert nearby zombies
- **Lunge Attack**: Unarmed zombies can lunge at close range
- **Armed Zombies**: From Phase 3, some zombies carry weapons
- **Destructible Windows**: Glass can be shot out, allowing bullets through (zombies can lunge through!)
- **Wall Sliding**: Players slide along walls based on aim direction

### Map System

- Floors defined as rectangular areas with tile patterns
- Walls with collision detection
- Decorations (some collidable)
- Visual wall tiles with rotation support
- Glass windows that can be destroyed

## Assets

Uses the [Kenney Top-Down Shooter](https://kenney.nl/assets/top-down-shooter) asset pack.

## Configuration

Environment variables:
- `PORT` - Server port (default: 3000)

Fly.io configuration in `fly.toml`:
- App name: `2d-fps`
- Region: `ams`
- Persistent volume at `/data` for high scores

## License

ISC
