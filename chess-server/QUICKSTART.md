# Quick Start Guide

## Prerequisites
- Node.js (v14+)
- MongoDB (local or Atlas)
- npm or yarn

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
PORT=5001
MONGO_URI=mongodb://localhost:27017/chess-db
ACCESS_TOKEN_SECRET=your-secret-key-here-change-in-production
ADMIN_USER=admin@example.com
ADMIN_PASSWORD=admin-password
```

### 3. Start MongoDB (if running locally)
```bash
mongod
```

### 4. Start the Server
```bash
# Development (with auto-reload)
npm run dev

# Production
node index.js
```

You should see:
```
✅ Connected to MongoDB
✅ Admin user created
✅ Server running on port 5001
📝 API: http://localhost:5001/api
🎮 WebSocket: ws://localhost:5001
```

## API Usage

### Register a User
```bash
curl -X POST http://localhost:5001/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player1@example.com",
    "username": "player1",
    "password": "password123"
  }'
```

Response:
```json
{
  "user": {
    "id": "...",
    "email": "player1@example.com",
    "username": "player1",
    "isAdmin": false
  },
  "accessToken": "eyJ..."
}
```

### Login
```bash
curl -X POST http://localhost:5001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "player1@example.com",
    "password": "password123"
  }'
```

### Check Server Health
```bash
curl http://localhost:5001/health
```

## Testing with Frontend

The refactored server is fully compatible with the chess-front application. The frontend will:

1. Connect via WebSocket to `ws://localhost:5001`
2. Emit `findGame` to find/create a game
3. Receive `gameStarted` event with synchronized times:
   ```javascript
   {
     gameId: "abc123",
     color: "w",
     fen: "...",
     turn: "w",
     whiteMs: 300000,
     blackMs: 300000,
     serverTime: Date.now()
   }
   ```
4. On each move, receive updated clock times in `moveMade` events
5. Call `clock.syncFromServer()` to keep clocks synchronized

## WebSocket Events Reference

### Emit (Client to Server)
```javascript
// Find or create a game
socket.emit('findGame');

// Join a specific game
socket.emit('joinGame', gameId);

// Make a move
socket.emit('move', { gameId, move });

// Clock sync
socket.emit('sync_start', { t1_client: Date.now() });
socket.emit('sync_finish', { t4_client: Date.now() });
```

### Listen (Server to Client)
```javascript
// Waiting for opponent
socket.on('waitingForOpponent', ({ gameId }) => {});

// Game started with synchronized clocks
socket.on('gameStarted', ({ gameId, color, fen, turn, whiteMs, blackMs, serverTime }) => {
  // Update clocks: clock.syncFromServer(whiteMs, blackMs, turn);
});

// Move was made
socket.on('moveMade', ({ move, fen, turn, whiteMs, blackMs, serverTime }) => {
  // Update clocks: clock.syncFromServer(whiteMs, blackMs, turn);
});

// Game ended
socket.on('gameOver', ({ reason }) => {});

// Invalid move
socket.on('invalidMove', ({ reason, move }) => {});

// Opponent left
socket.on('opponentDisconnected', () => {});
```

## Project Structure Overview

```
/config         → Game constants and settings
/controllers    → Request handlers for routes
/handlers       → WebSocket event handlers
/middleware     → Express middleware (auth, errors)
/models         → MongoDB schemas
/routes         → API route definitions
/services       → Business logic (GameService)
/index.js       → Main server file
```

## Troubleshooting

### Port Already in Use
```bash
# Kill process on port 5001 (macOS/Linux)
lsof -ti:5001 | xargs kill -9

# Or change PORT in .env
PORT=5002
```

### MongoDB Connection Failed
- Check if MongoDB is running: `mongod`
- Verify MONGO_URI in .env
- Server will still run without MongoDB for testing

### Clock Not Syncing
- Ensure frontend calls `clock.syncFromServer(whiteMs, blackMs, turn)`
- Verify server is sending `whiteMs`, `blackMs`, `serverTime` in events
- Check browser console for errors

## Development Tips

### Logging
The server uses console logging with prefixes:
- `✅` - Success
- `❌` - Error
- `👤` - User action
- `🎮` - Game event
- `🏁` - Game end
- `📝` - API info

### Adding New Routes
1. Create controller function in `controllers/`
2. Add route in `routes/user.route.js`
3. Use `authenticate` and `requireAdmin` middleware as needed

### Adding New Socket Events
1. Create handler function in `handlers/socket.handler.js`
2. Register in `registerSocketHandlers()` function
3. Use `gameService` for game logic

### Modifying Game Constants
Edit `config/constants.js`:
```javascript
CLOCK: {
  INITIAL_TIME_SECONDS: 300,  // Change initial time
  INCREMENT_SECONDS: 2,       // Change increment
}
```

## Next Steps

1. Run the server: `npm run dev`
2. Test the API with curl or Postman
3. Connect frontend and test game flow
4. Monitor logs for any issues

For more details, see [ARCHITECTURE.md](ARCHITECTURE.md) and [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md)
