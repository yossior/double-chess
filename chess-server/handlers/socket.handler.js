const gameService = require('../services/game.service');

/**
 * Register all socket event handlers for a client
 */
function registerSocketHandlers(io, socket) {
  // Clock synchronization
  socket.on("sync_start", ({ t1_client }) => {
    const t2_server = Date.now();
    const t3_server = Date.now();
    socket.data.lastSync = { t1_client, t2_server, t3_server };

    socket.emit("sync_reply", { t3_server });
    console.log(`[Sync] Client ${socket.id} sync_start`);
  });

  socket.on("sync_finish", ({ t4_client }) => {
    const { t1_client, t2_server, t3_server } = socket.data.lastSync || {};
    if (!t1_client) return;
    
    const offset = ((t2_server - t1_client) + (t3_server - t4_client)) / 2;
    socket.data.offset = offset;
    console.log(`[Sync] Client ${socket.id} offset: ${offset}ms`);
  });

  // Game finding and joining
  socket.on("findGame", ({ userId } = {}) => {
    handleFindGame(io, socket, userId);
  });

  socket.on("joinGame", ({ gameId, userId } = {}) => {
    handleJoinGame(io, socket, gameId, userId);
  });

  // Game moves
  socket.on("move", ({ gameId, move }) => {
    handleMove(io, socket, gameId, move);
  });

  // Disconnection
  socket.on("disconnect", () => {
    handleDisconnect(io, socket);
  });
}

/**
 * Handle finding or creating a game
 */
function handleFindGame(io, socket, userId = null) {
  const effectiveUserId = userId ?? socket.data.userId ?? socket.handshake.auth?.userId ?? null;
  if (effectiveUserId) socket.data.userId = effectiveUserId;

  const { game, isNew } = gameService.findOrCreateGame(socket.id, effectiveUserId);
  
  // Always join the socket to the game room
  socket.join(game.id);
  
  if (isNew) {
    // New game created, waiting for opponent
    socket.emit("waitingForOpponent", { gameId: game.id });
    console.log(`[Game] ${socket.id} created game ${game.id}`);
  } else {
    // Joined existing game, notify both players in the room
    const white = game.players.find((p) => p.color === "w");
    const black = game.players.find((p) => p.color === "b");
    
    // Broadcast to room (both players will receive)
    io.to(game.id).emit("gameStarted", {
      gameId: game.id,
      color: null,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
    });

    // Also send color-specific info
    if (white?.socketId) {
      io.to(white.socketId).emit("gameStarted", {
        gameId: game.id,
        color: "w",
        fen: game.chess.fen(),
        turn: game.chess.turn(),
        whiteMs: game.whiteMs,
        blackMs: game.blackMs,
        serverTime: Date.now(),
      });
    }

    if (black?.socketId) {
      io.to(black.socketId).emit("gameStarted", {
        gameId: game.id,
        color: "b",
        fen: game.chess.fen(),
        turn: game.chess.turn(),
        whiteMs: game.whiteMs,
        blackMs: game.blackMs,
        serverTime: Date.now(),
      });
    }

    console.log(`[Game] ${socket.id} joined game ${game.id}`);
  }
}

/**
 * Handle joining a specific game
 */
function handleJoinGame(io, socket, gameId, userId = null) {
  const effectiveUserId = userId ?? socket.data.userId ?? socket.handshake.auth?.userId ?? null;
  if (effectiveUserId) socket.data.userId = effectiveUserId;

  const game = gameService.joinGame(socket.id, effectiveUserId, gameId);
  
  if (!game) {
    socket.emit("error", "Cannot join game");
    return;
  }

  // Join socket to the room
  socket.join(gameId);
  
  const white = game.players.find((p) => p.color === "w");
  const black = game.players.find((p) => p.color === "b");

  // Notify both players in the room
  io.to(gameId).emit("gameStarted", {
    gameId: game.id,
    color: null,
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    whiteMs: game.whiteMs,
    blackMs: game.blackMs,
    serverTime: Date.now(),
  });

  if (white?.socketId) {
    io.to(white.socketId).emit("gameStarted", {
      gameId: game.id,
      color: "w",
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
    });
  }

  if (black?.socketId) {
    io.to(black.socketId).emit("gameStarted", {
      gameId: game.id,
      color: "b",
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
    });
  }

  console.log(`[Game] ${socket.id} joined game ${gameId}`);
}

/**
 * Handle a move in the game
 */
function handleMove(io, socket, gameId, move) {
  const result = gameService.makeMove(gameId, socket.id, move);
  
  if (!result.success) {
    socket.emit("invalidMove", { reason: result.error, move });
    return;
  }

  // Broadcast move to both players
  io.to(gameId).emit("moveMade", {
    move: result.move,
    fen: result.fen,
    turn: result.turn,
    whiteMs: result.whiteMs,
    blackMs: result.blackMs,
    serverTime: result.serverTime,
  });

  console.log(`[Move] Game ${gameId}: ${result.move.san}`);

  // Check if game is over
  const gameOverReason = gameService.isGameOver(gameId);
  if (gameOverReason) {
    io.to(gameId).emit("gameOver", { reason: gameOverReason });
    
    // Save game asynchronously
    gameService.saveGameToDb(gameId, gameOverReason).then(() => {
        gameService.deleteGame(gameId);
    });
    
    console.log(`[Game] Game ${gameId} over: ${gameOverReason}`);
  }
}

/**
 * Handle player disconnection
 */
function handleDisconnect(io, socket) {
  console.log(`[Disconnect] ${socket.id}`);

  // Find and cleanup games with this player
  for (const [gameId, game] of gameService.games.entries()) {
    if (game.players.some((p) => p.socketId === socket.id)) {
      io.to(gameId).emit("opponentDisconnected");
      gameService.deleteGame(gameId);
      console.log(`[Game] Deleted game ${gameId} (player disconnected)`);
    }
  }
}

module.exports = { registerSocketHandlers };
