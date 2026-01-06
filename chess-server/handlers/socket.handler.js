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

  socket.on("joinGame", ({ gameId, userId, timeMinutes, incrementSeconds, playerColor } = {}) => {
    handleJoinGame(io, socket, gameId, userId, timeMinutes, incrementSeconds, playerColor);
  });

  // Game moves
  socket.on("move", ({ gameId, move }) => {
    handleMove(io, socket, gameId, move);
  });

  // Resignation
  socket.on("resign", ({ gameId }) => {
    handleResign(io, socket, gameId);
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
    // Joined existing game, notify both players
    const white = game.players.find((p) => p.color === "w");
    const black = game.players.find((p) => p.color === "b");
    
    // Notify both players individually with their color
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

    console.log(`[Game] Game ${game.id} started with ${white?.socketId} (white) vs ${black?.socketId} (black)`);
  }
}

/**
 * Handle joining a specific game
 */
function handleJoinGame(io, socket, gameId, userId = null, timeMinutes = null, incrementSeconds = null, playerColor = null) {
  const effectiveUserId = userId ?? socket.data.userId ?? socket.handshake.auth?.userId ?? null;
  if (effectiveUserId) socket.data.userId = effectiveUserId;

  const result = gameService.joinGame(socket.id, effectiveUserId, gameId, timeMinutes, incrementSeconds, playerColor);
  
  if (!result || !result.game) {
    socket.emit("error", "Cannot join game");
    return;
  }

  const { game, role, reconnected } = result;

  // Join socket to the room - THIS IS CRITICAL
  socket.join(gameId);
  console.log(`[Socket] ${socket.id} joined room ${gameId}`);
  
  // If player reconnected, send them current game state
  if (reconnected) {
    const player = game.players.find(p => p.socketId === socket.id);
    socket.emit("gameStarted", {
      gameId: game.id,
      color: player.color,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
      history: game.historyMoves,
      movesInTurn: game.movesInTurn,
    });
    console.log(`[Game] ${socket.id} reconnected to game ${gameId} as ${player.color}`);
    return;
  }
  
  // If joining as spectator
  if (role === 'spectator') {
    // Send current game state to spectator
    socket.emit("spectatorJoined", {
      gameId: game.id,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
      history: game.historyMoves,
      isCompleted: game.isCompleted,
      movesInTurn: game.movesInTurn,
      gameResult: game.gameResult,
      winner: game.winner,
    });
    console.log(`[Game] ${socket.id} joined game ${gameId} as spectator`);
    return;
  }
  
  // If only one player (game just created), wait for opponent
  if (game.players.length === 1) {
    socket.emit("waitingForOpponent", { gameId: game.id });
    console.log(`[Game] ${socket.id} created/joined game ${gameId}, waiting for opponent`);
    return;
  }
  
  // Two players - start the game for BOTH players
  const white = game.players.find((p) => p.color === "w");
  const black = game.players.find((p) => p.color === "b");

  console.log(`[Game] Game ${gameId} ready to start with ${white?.socketId} (white) vs ${black?.socketId} (black)`);

  // Use io.to(gameId) to broadcast to the entire room
  const gameStartData = {
    gameId: game.id,
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    whiteMs: game.whiteMs,
    blackMs: game.blackMs,
    serverTime: Date.now(),
  };

  // Send to each player with their specific color
  if (white?.socketId) {
    io.to(white.socketId).emit("gameStarted", {
      ...gameStartData,
      color: "w",
    });
  }

  if (black?.socketId) {
    io.to(black.socketId).emit("gameStarted", {
      ...gameStartData,
      color: "b",
    });
  }

  console.log(`[Game] Game ${gameId} started - emitted gameStarted to both players`);
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

  console.log(`[Move] Game ${gameId}: ${result.move.san} by ${socket.id}`);
  
  // Debug: log room membership
  const room = io.sockets.adapter.rooms.get(gameId);
  console.log(`[Move] Room ${gameId} has ${room ? room.size : 0} members: ${room ? Array.from(room) : []}`);

  // Broadcast move to ALL clients in the game room (including the sender)
  io.to(gameId).emit("moveMade", {
    move: result.move,
    fen: result.fen,
    turn: result.turn,
    movesInTurn: result.movesInTurn,
    whiteMs: result.whiteMs,
    blackMs: result.blackMs,
    serverTime: result.serverTime,
  });

  console.log(`[Move] Game ${gameId}: Broadcasted moveMade event to room`);

  // Check if game is over
  const gameOverReason = gameService.isGameOver(gameId);
  if (gameOverReason) {
    const winner = gameOverReason === 'checkmate' 
      ? (result.turn === 'w' ? 'black' : 'white')  // If it's white's turn and checkmate, black won
      : null;
    
    io.to(gameId).emit("gameOver", { reason: gameOverReason, winner });
    
    // Save game asynchronously (don't delete - keep for spectators)
    gameService.saveGameToDb(gameId, gameOverReason, winner);
    
    console.log(`[Game] Game ${gameId} over: ${gameOverReason}`);
  }
}

/**
 * Handle player disconnection
 */
function handleDisconnect(io, socket) {
  console.log(`[Disconnect] ${socket.id}`);

  // Notify opponents but keep the game for spectators/completed viewing
  for (const [gameId, game] of gameService.games.entries()) {
    if (game.players.some((p) => p.socketId === socket.id)) {
      io.to(gameId).emit("opponentDisconnected");
      console.log(`[Game] Player disconnected from ${gameId}, game preserved for spectators`);
    }
  }
}

/**
 * Handle resignation
 */
function handleResign(io, socket, gameId) {
  const game = gameService.getGame(gameId);
  if (!game) {
    socket.emit("error", "Game not found");
    return;
  }

  const player = game.players.find((p) => p.socketId === socket.id);
  if (!player) {
    socket.emit("error", "Player not in game");
    return;
  }

  const winner = player.color === "w" ? "black" : "white";
  
  io.to(gameId).emit("gameOver", { 
    reason: "resignation",
    winner: winner,
    resignedColor: player.color
  });

  // Save game asynchronously (don't delete - keep for spectators)
  gameService.saveGameToDb(gameId, "resignation", winner);

  console.log(`[Game] ${player.color} resigned in game ${gameId}`);
}

module.exports = { registerSocketHandlers };
