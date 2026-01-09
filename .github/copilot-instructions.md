# Chess Application - AI Agent Instructions

## Agent Behavior
- **NO GIT COMMITS/PUSHES**: Do not commit or push changes to GitHub unless explicitly requested by the user.

## Architecture Overview

This is a **full-stack real-time chess application** with two main components:
- **chess-front/** - React + Vite frontend with Tailwind CSS v4, Framer Motion animations
- **chess-server/** - Node.js backend with Express, Socket.IO, MongoDB/Mongoose

### Unique Feature: Double-Move Chess Variant
The game implements a custom chess variant where **each player gets 2 moves per turn** unless:
- A check is delivered (ends turn immediately)
- The game ends
- See [useChessController.js](../chess-front/src/hooks/useChessController.js#L72-L95) for the FEN manipulation logic that flips turn back after first move

## Project Structure & Key Files

### Frontend (chess-front/)
- **Entry**: [main.jsx](../chess-front/src/main.jsx) wraps `<App />` in `<UserProvider>` and `<React.StrictMode>`
- **State Management**: Context API via [UserContext.jsx](../chess-front/src/context/UserContext.jsx) for auth, no Redux
- **Custom Hooks Pattern**: All complex logic lives in [hooks/](../chess-front/src/hooks/)
  - `useChessController` - Game state, move validation, history navigation
  - `useChessClock` - Timer logic with increment support
  - `useOnlineGame` - Socket.IO client wrapper
  - `useEngine` - Engine integration for AI opponent (FairyMax)
  - `usePremoves` - Premove queue for online games

### Backend (chess-server/)
- **Entry**: [index.js](../chess-server/index.js) - Sets up Express + Socket.IO on same HTTP server
- **Architecture**: Service layer pattern
  - [handlers/socket.handler.js](../chess-server/handlers/socket.handler.js) - Socket event registration
  - [services/game.service.js](../chess-server/services/game.service.js) - In-memory game state (Map), clock logic
  - [controllers/user.controller.js](../chess-server/controllers/user.controller.js) - REST auth endpoints
  - [models/](../chess-server/models/) - Mongoose schemas for persistence
- **Game Storage**: Games are managed in-memory via `Map` during play, persisted to MongoDB on completion

## Critical Workflows

### Development Setup
```bash
# Install dependencies (root, frontend, and backend)
npm run install:all

# Run both frontend and backend concurrently
npm run dev
```

**Environment Setup**: Backend requires `.env` file (see [QUICKSTART.md](../chess-server/QUICKSTART.md#L18-L25)):
```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/chess-db
ACCESS_TOKEN_SECRET=your-secret-key
```

### Socket Communication Pattern
1. Client connects → server emits `sync_reply` for clock offset calculation
2. Client emits `findGame` → server matches with waiting player or creates new game
3. Server emits `gameStarted` with **synchronized clock times** (`whiteMs`, `blackMs`, `serverTime`)
4. Move flow: `socket.emit("move")` → server validates → `io.to(gameId).emit("moveMade")` to both players

**Critical**: All socket handlers are in [socket.handler.js](../chess-server/handlers/socket.handler.js). Never add socket logic directly in [index.js](../chess-server/index.js).

### Clock Synchronization
- Frontend calculates server offset via 3-way handshake (`sync_start` → `sync_reply` → `sync_finish`)
- Server tracks `lastMoveTime` and `whiteMs`/`blackMs` in game state
- After each move, server subtracts elapsed time + adds increment ([game.service.js#L104-L113](../chess-server/services/game.service.js#L104-L113))
- Frontend syncs from server after each `moveMade` event using `clock.syncFromServer()`

## Code Conventions

### State Management Patterns
- **Refs for mutable state**: Use `useRef` for chess game instance, socket, clock timings (avoid stale closures)
- **State for UI**: Use `useState` for FEN position, move history, player color
- **Example**: [useOnlineGame.js](../chess-front/src/hooks/useOnlineGame.js#L25-L35) uses `socketRef.current` for socket instance

### File Organization
- **Components**: Pure UI components in [components/](../chess-front/src/components/), no business logic
- **Hooks**: All stateful logic extracted to custom hooks (avoid prop drilling)
- **Archive Pattern**: Old code moved to [archive/removed-YYYY-MM-DD/](../chess-front/src/archive/removed-2025-12-29/) instead of deletion

### API Patterns
- **REST**: Auth endpoints only (`/api/users/login`, `/api/users/register`, `/api/users/me`)
- **WebSocket**: All real-time game logic (moves, matchmaking, clock sync)
- **Auth**: JWT in `Authorization: Bearer <token>` header, stored in localStorage as `chess_token`

## Integration Points

### Chess.js Library
- Both frontend and backend use `chess.js` v1.4.0 for move validation
- **Important**: FEN manipulation for double-move variant requires **clearing en-passant target** (`parts[3] = '-'`) when flipping turn back ([useChessController.js#L85-L89](../chess-front/src/hooks/useChessController.js#L85-L89))

### FairyMax Integration
- Uses **FairyMax WASM** - a chess variant engine that natively supports double-move chess
- Files served from [public/fairy-max/](../chess-front/public/fairy-max/) (fairymax.wasm, fairymax.worker.js)
- Loaded as Web Worker and communicates via XBoard/WinBoard protocol
- Managed in [useFairyMax.js](../chess-front/src/hooks/useFairyMax.js)

**Engine Levels Configuration:**
```javascript
ENGINE_LEVELS = {
  1: { depth: 2, approxElo: 800 },
  // ... up to
  10: { depth: 12, approxElo: 2600 },
}
```
- `depth`: Search depth for move calculation

**XBoard Protocol Commands:**
FairyMax uses the XBoard/WinBoard protocol (not UCI):
- `xboard` - Enable XBoard mode
- `protover 2` - Use protocol version 2
- `variant doublemove` - Set double-move chess variant
- `new` - Start a new game
- `setboard FEN` - Set the position
- `sd DEPTH` - Set search depth
- `go` - Start thinking and make a move
- `force` - Stop thinking

**Engine Output:**
- `move MOVE` - The engine's move in coordinate notation (e.g., `move e2e4`)
- FairyMax handles double-move chess natively, so no complex move queuing is needed

**Key Implementation Details:**
- FairyMax natively supports chess variants including double-move
- Communication via Web Worker message passing
- XBoard protocol is simpler than the previous UCI approach
- `isPlayingDoubleMove` flag prevents Board.jsx interference during execution
- Turn guards prevent engine from playing on human's turn

### react-chessboard Library
- Uses `react-chessboard` v5.7.1 for board rendering
- Custom square styles via `optionSquares` state for move highlighting
- Promotion handled via [PromotionModal.jsx](../chess-front/src/components/PromotionModal.jsx)

## Common Patterns

### History Navigation
- `moveHistory` stores SAN notation strings
- `historyIndex` null = live game, number = viewing past position
- FEN snapshots stored in move objects for instant navigation
- Keyboard shortcuts: ← / → (prev/next), ↑ / ↓ (start/live) implemented in [BoardWrapper.jsx](../chess-front/src/components/BoardWrapper.jsx#L51-L83)

### Mode Switching
- Three modes: `"local"` (vs self/AI with FairyMax), `"friend"` (vs player online)
- Clock only enabled for online mode: `enableClock: mode === "friend"` 
- Engine only active in local mode when playing against bot

### Error Handling
- Backend: Centralized error handler middleware in [auth.middleware.js](../chess-server/middleware/auth.middleware.js)
- Frontend: Socket errors logged to console, no global error boundary (consider adding)

## Testing

- **E2E**: Playwright configured ([playwright.config.js](../chess-front/playwright.config.js)), run via `npm run test:e2e`
- **No unit tests**: Consider adding Vitest for hooks/utils testing

## Dependencies Note

- **Frontend**: React 19.1.1 (latest), Tailwind CSS v4 (uses `@tailwindcss/vite` plugin)
- **Backend**: CommonJS (`"type": "commonjs"`), uses `require()` not ES6 imports
- **Nodemon**: Backend auto-reloads on file changes in dev mode

## When Making Changes

1. **Adding socket events**: Register in [socket.handler.js](../chess-server/handlers/socket.handler.js), implement logic in [game.service.js](../chess-server/services/game.service.js)
2. **New game features**: Start with hook in [hooks/](../chess-front/src/hooks/), expose via `useChessController` return object
3. **Clock modifications**: Update both [useChessClock.js](../chess-front/src/hooks/useChessClock.js) AND [game.service.js](../chess-server/services/game.service.js) clock logic
4. **Database models**: Add to [models/](../chess-server/models/), update constants in [constants.js](../chess-server/config/constants.js)
