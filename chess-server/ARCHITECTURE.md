# Chess Server - Refactored Architecture

## Overview

A refactored and reorganized Node.js chess server built with Express, Socket.IO, and MongoDB. The server handles real-time online chess games with synchronized clocks and proper separation of concerns.

## Project Structure

```
chess-server/
├── config/                      # Configuration and constants
│   └── constants.js            # Game constants, settings
├── controllers/                 # Business logic for routes
│   └── user.controller.js      # User authentication and management
├── handlers/                    # Socket.IO event handlers
│   └── socket.handler.js       # Game and connection event handlers
├── middleware/                  # Express middleware
│   └── auth.middleware.js      # Authentication and error handling
├── models/                      # MongoDB schemas
│   ├── game.model.js           # Game schema
│   └── user.model.js           # User schema
├── routes/                      # API route definitions
│   └── user.route.js           # User endpoints
├── services/                    # Service layer for game logic
│   └── game.service.js         # Game management and logic
├── .env                         # Environment variables
├── index.js                     # Server entry point
└── package.json                # Dependencies
```

## Key Features

### 1. **Clock Synchronization**
- Servers sends synchronized clock times (`whiteMs`, `blackMs`) with every game event
- Clients can call `clock.syncFromServer()` to keep clocks in sync
- 2-second increment per move by default
- Prevents desynchronization between players

### 2. **Service Layer (`GameService`)**
- Encapsulates all game logic
- Manages game creation, joining, and move validation
- Handles clock updates with increments
- Single instance shared across all socket connections

### 3. **Socket Handler Organization**
- All socket events in one module: `handlers/socket.handler.js`
- Named event handlers for clarity
- Proper error handling and logging
- Clear separation from business logic

### 4. **Authentication Middleware**
- JWT-based user authentication
- Admin role management
- Centralized error handling
- Request/response validation

### 5. **Configuration Management**
- Centralized constants in `config/constants.js`
- Easy to modify game settings
- Consistent across the application

## API Endpoints

### User Management
- `POST /api/users/register` - Register new user
- `POST /api/users/login` - Login user (returns JWT token)
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID

### Health Check
- `GET /health` - Server health status

## Socket.IO Events

### Client → Server
- `findGame` - Find or create a game
- `joinGame(gameId)` - Join a specific game
- `move({ gameId, move })` - Make a move
- `sync_start({ t1_client })` - Clock sync start
- `sync_finish({ t4_client })` - Clock sync finish

### Server → Client
- `waitingForOpponent({ gameId })` - Waiting for opponent to join
- `gameStarted({ gameId, color, fen, turn, whiteMs, blackMs, serverTime })` - Game started
- `moveMade({ move, fen, turn, whiteMs, blackMs, serverTime })` - Move made
- `gameOver({ reason })` - Game ended
- `invalidMove({ reason, move })` - Invalid move attempted
- `opponentDisconnected` - Opponent disconnected
- `error(message)` - Error occurred

## Environment Variables

```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/chess-db
ACCESS_TOKEN_SECRET=your-secret-key-here
ADMIN_USER=admin@example.com
ADMIN_PASSWORD=admin-password
```

## Game Clock Synchronization

The server maintains accurate clock times and sends them with every game event:

```javascript
// Example gameStarted event
{
  gameId: "abc123",
  color: "w",
  fen: "...",
  turn: "w",
  whiteMs: 300000,      // 5 minutes in milliseconds
  blackMs: 300000,
  serverTime: 1704000000000  // Server timestamp
}
```

Frontend can sync using:
```javascript
if (clock?.syncFromServer) {
  clock.syncFromServer(whiteMs, blackMs, turn);
}
```

## Running the Server

```bash
# Install dependencies
npm install

# Development (with auto-reload)
npm run dev

# Production
node index.js
```

## Database Models

### User Model
- `username` - Unique username
- `email` - Unique email
- `hash` - Bcrypt hashed password
- `isAdmin` - Admin flag
- `games` - Reference to games
- `timestamps` - createdAt, updatedAt

### Game Model
- `gameId` - Unique game identifier
- `white/black` - User references
- `fen` - Current board state
- `moves` - Array of moves
- `whiteMs/blackMs` - Clock times
- `status` - waiting/active/completed/abandoned
- `result` - Game result
- `timestamps` - createdAt, startedAt, completedAt

## Improvements Made

1. **Separation of Concerns** - Business logic in services, routes in routes, middleware for cross-cutting concerns
2. **Clock Synchronization** - Server sends `whiteMs`, `blackMs`, and `serverTime` with every event
3. **Error Handling** - Centralized error middleware with proper HTTP status codes
4. **Configuration** - Constants centralized for easy modification
5. **Code Organization** - Clear directory structure with dedicated handlers, services, and middleware
6. **Documentation** - Clear comments and structure
7. **Graceful Shutdown** - Proper cleanup of connections on server shutdown
8. **Logging** - Better logging with prefixes ([Game], [Move], [Sync], etc.)

## Future Enhancements

1. Rate limiting on API endpoints
2. Game history persistence
3. Player statistics tracking
4. Rating system (ELO)
5. Chat functionality
6. Tournament support
7. Move validation on server
8. Time management optimizations
