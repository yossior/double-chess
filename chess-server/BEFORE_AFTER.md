# Before & After Comparison

## Directory Structure

### Before
```
chess-server/
├── controllers/user.controller.js
├── models/
│   ├── game.model.js (empty)
│   └── user.model.js
├── routes/user.route.js
├── index.js (190 lines, all logic)
└── package.json
```

### After
```
chess-server/
├── config/
│   └── constants.js (centralized settings)
├── controllers/
│   └── user.controller.js (refactored)
├── handlers/
│   └── socket.handler.js (new - socket logic)
├── middleware/
│   └── auth.middleware.js (new - auth layer)
├── models/
│   ├── game.model.js (implemented)
│   └── user.model.js
├── services/
│   └── game.service.js (new - business logic)
├── routes/
│   └── user.route.js (refactored)
├── index.js (80 lines, orchestration)
├── ARCHITECTURE.md (new - documentation)
└── REFACTORING_SUMMARY.md (new - summary)
```

## Code Examples

### Socket Handler - Before vs After

#### Before: All in index.js
```javascript
io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  socket.on("findGame", () => {
    // find a game with only one player waiting
    const waitingGame = [...games.entries()].find(
      ([_, game]) => game.players.length === 1
    );

    if (waitingGame) {
      const [gameId] = waitingGame;
      joinGame(socket, gameId);
    } else {
      createGame(socket);
    }
  });

  socket.on("move", ({ gameId, move }) => {
    const game = games.get(gameId);
    if (!game) return;

    const { chess } = game;
    const player = game.players.find((p) => p.id === socket.id);
    if (!player) return;

    // enforce turn order
    if (player.color !== chess.turn()) {
      socket.emit("invalidMove", { reason: "not your turn" });
      return;
    }

    const result = chess.move(move);
    if (!result) {
      socket.emit("invalidMove", { reason: "illegal move", move });
      return;
    }

    io.to(gameId).emit("moveMade", {
      move: result,
      fen: chess.fen(),
      turn: chess.turn(),
      // ❌ NO CLOCK SYNC DATA!
    });
    // ... more code
  });
});
```

#### After: Separated and Clean
```javascript
// index.js
io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

// handlers/socket.handler.js
function registerSocketHandlers(io, socket) {
  socket.on("findGame", () => handleFindGame(io, socket));
  socket.on("move", ({ gameId, move }) => handleMove(io, socket, gameId, move));
  socket.on("disconnect", () => handleDisconnect(io, socket));
}

function handleMove(io, socket, gameId, move) {
  const result = gameService.makeMove(gameId, socket.id, move);
  
  if (!result.success) {
    socket.emit("invalidMove", { reason: result.error, move });
    return;
  }

  io.to(gameId).emit("moveMade", {
    move: result.move,
    fen: result.fen,
    turn: result.turn,
    whiteMs: result.whiteMs,        // ✅ CLOCK SYNC!
    blackMs: result.blackMs,        // ✅ CLOCK SYNC!
    serverTime: result.serverTime   // ✅ SERVER TIME!
  });
}
```

### Game Logic - Before vs After

#### Before: Inline in handlers
```javascript
function createGame(socket) {
  const gameId = Math.random().toString(36).substr(2, 9);
  const chess = new Chess();
  games.set(gameId, {
    chess,
    players: [{ id: socket.id, color: "w" }],
  });
  socket.join(gameId);
  socket.emit("waitingForOpponent", { gameId, color: "w" });
  console.log(`🆕 Game created: ${gameId}`);
  return gameId;
}
```

#### After: Encapsulated in Service
```javascript
// services/game.service.js
class GameService {
  createGame(playerId) {
    const gameId = Math.random().toString(36).substr(2, 9);
    const chess = new Chess();
    const game = {
      id: gameId,
      chess,
      players: [{ id: playerId, color: "w" }],
      createdAt: Date.now(),
      startedAt: null,
      whiteMs: CLOCK.INITIAL_TIME_MS,  // Uses constants!
      blackMs: CLOCK.INITIAL_TIME_MS,
    };
    this.games.set(gameId, game);
    return game;
  }

  makeMove(gameId, playerId, move) {
    const game = this.games.get(gameId);
    // ... validation ...
    const result = chess.move(move);
    
    // Auto-increment clock!
    if (player.color === "w") {
      game.whiteMs += CLOCK.INCREMENT_MS;
    } else {
      game.blackMs += CLOCK.INCREMENT_MS;
    }

    return {
      success: true,
      move: result,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
    };
  }
}
```

### Authentication - Before vs After

#### Before: Inline in controller
```javascript
const authenticateUser = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) throw new Error('No token provided');

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) throw new Error('User not found');

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: err.message });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user?.isAdmin) {
        throw new Error("Admin access required");
    }
    next();
};
```

#### After: Middleware Module
```javascript
// middleware/auth.middleware.js
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token', error: err.message });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user?.isAdmin) {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};
```

#### After: Routes using middleware
```javascript
// routes/user.route.js
router.get('/', authenticate, requireAdmin, getUsers);
router.get('/:id', authenticate, getUser);
router.post('/login', login);
router.post('/register', register);
```

### Main Server File - Before vs After

#### Before: 190 lines
```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Chess } = require("chess.js");
const cors = require("cors");
const mongoose = require("mongoose");

require("dotenv").config();

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    app.listen(3000, () => {
      console.log("✅ Server is running on port 3000");
    });
  })
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
// ... middleware ...

// store games in memory
const games = new Map();

function createGame(socket) { /* ... */ }
function joinGame(socket, gameId) { /* ... */ }
function findGame(socket) { /* ... */ }

io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  socket.on("sync_start", ({t1_client}) => { /* ... */ });
  socket.on("sync_finish", ({t4_client}) => { /* ... */ });
  socket.on("findGame", () => { /* ... */ });
  socket.on("joinGame", (gameId) => { /* ... */ });
  socket.on("move", ({ gameId, move }) => { /* ... */ });
  socket.on("disconnect", () => { /* ... */ });
});

server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
```

#### After: 80 lines (clean orchestration)
```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const { registerSocketHandlers } = require("./handlers/socket.handler");
const userRoutes = require("./routes/user.route");
const { errorHandler } = require("./middleware/auth.middleware");
const { initializeAdminUser } = require("./controllers/user.controller");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/users", userRoutes);
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: Date.now() });
});
app.use(errorHandler);

io.on("connection", (socket) => {
  console.log(`👤 User connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

const PORT = process.env.PORT || 5001;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB");
    initializeAdminUser();
    startServer();
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    console.log("⚠️ Starting server without database...");
    startServer();
  });

function startServer() {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} already in use`);
      process.exit(1);
    } else {
      throw err;
    }
  });

  server.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📝 API: http://localhost:${PORT}/api`);
    console.log(`🎮 WebSocket: ws://localhost:${PORT}`);
  });
}

process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB disconnected");
      process.exit(0);
    });
  });
});

module.exports = { app, io, server };
```

## Benefits Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Clock Sync** | ❌ No | ✅ Yes (whiteMs, blackMs, serverTime) |
| **Code Organization** | ❌ Monolithic | ✅ Modular (services, handlers, middleware) |
| **Error Handling** | ❌ Scattered | ✅ Centralized middleware |
| **Configuration** | ❌ Hardcoded | ✅ constants.js |
| **Testability** | ❌ Hard | ✅ Easy (GameService can be unit tested) |
| **Maintainability** | ❌ 190 lines in one file | ✅ Organized by responsibility |
| **Auth Logic** | ❌ In controller | ✅ Dedicated middleware |
| **Game Logic** | ❌ In handlers | ✅ Encapsulated in service |
| **Lines of Code** | 190 (index.js) | 80 (index.js) + modular |
