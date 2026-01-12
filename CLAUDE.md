# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multiplayer zombie survival top-down shooter game built with Node.js, Express, and Socket.IO. Players can play single-player or create/join multiplayer rooms to survive waves of zombies across 10 phases.

## Commands

```bash
# Start the server locally
node server.js

# Server runs on port 3000 by default (or PORT env variable)

# Deploy to Fly.io
fly deploy
```

## Architecture

### Server (`server.js`)
- Express server with Socket.IO for real-time multiplayer
- Room-based game system supporting both single-player and multiplayer (up to 4 players per room)
- Central game loop at 60fps processes all active rooms
- Highscores persisted to JSON file (`/data/highscores.json` on Fly.io, local `highscores.json` in dev)

### Client (`public/`)
- `index.html` - Multi-screen UI: home, lobby, game, game over, high scores
- `game.js` - Canvas-based rendering, input handling (keyboard + mobile touch joystick), Socket.IO client
- `style.css` - Styling for all screens
- `kenney_top-down-shooter/` - Sprite assets (tiles, player skins, zombie)

### Game Flow
1. Home screen → Single Player or Multiplayer
2. Multiplayer: Room list → Create/Join Room → Lobby → Host starts game
3. Game: Survive 10 phases of zombies, each phase has `phase * 10` zombies
4. Death: Submit score to leaderboard, play again or return to menu

### Key Server Concepts
- `rooms` object holds all active game rooms with their own players, projectiles, zombies, and phase state
- `getPlayerRoom(socketId)` finds which room a socket belongs to
- Phase system: zombies get faster and have better sight radius as phases increase
- Map data (walls, floors, decorations) is static and sent to clients on connect

### Key Client Concepts
- Camera follows the local player
- Mobile controls: single joystick for movement + aim, separate shoot button
- Blood splatters persist for 8 seconds and fade out
- Chat bubbles appear above players for 4 seconds

## Deployment

Deployed on Fly.io (app name: `2d-fps`, region: `ams`). Uses persistent volume mounted at `/data` for highscores.
