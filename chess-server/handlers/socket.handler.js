const gameService = require('../services/game.service');
const statsService = require('../services/stats.service');

// Track disconnect timeouts for players (gameId -> { color, timeout })
const disconnectTimeouts = new Map();
const DISCONNECT_TIMEOUT_MS = 20 * 1000; // 20 seconds

/**
 * Helper to extract client IP from socket handshake
 */
function getSocketClientIp(socket) {
  // Check for forwarded IP (behind proxy/load balancer like Render, Nginx)
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // Check for real IP header
  const realIp = socket.handshake.headers['x-real-ip'];
  if (realIp) {
    return realIp;
  }
  // Fallback to socket's remote address
  return socket.handshake.address || null;
}

/**
 * Helper to get user agent from socket handshake
 */
function getSocketUserAgent(socket) {
  return socket.handshake.headers['user-agent'] || null;
}

/**
 * Register all socket event handlers for a client
 */
function registerSocketHandlers(io, socket) {
  // Store client info on socket data for later use
  socket.data.ip = getSocketClientIp(socket);
  socket.data.userAgent = getSocketUserAgent(socket);

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

  socket.on("joinGame", async ({ gameId, userId, timeMinutes, incrementSeconds, playerColor } = {}) => {
    console.log(`[JoinGame] event received: socket=${socket.id} gameId=${gameId} ts=${Date.now()}`);
    await handleJoinGame(io, socket, gameId, userId, timeMinutes, incrementSeconds, playerColor);
  });

  // Game moves
  socket.on("move", ({ gameId, move }) => {
    handleMove(io, socket, gameId, move);
  });

  // Resignation
  socket.on("resign", ({ gameId }) => {
    handleResign(io, socket, gameId);
  });

  // Bot game tracking (for disconnect/abandonment handling)
  socket.on("botGameStarted", ({ gameId, skillLevel, playerColor, isUnbalanced }) => {
    handleBotGameStarted(socket, gameId, skillLevel, playerColor, isUnbalanced);
  });

  socket.on("botGameMove", ({ gameId, moves, fen }) => {
    handleBotGameMove(socket, gameId, moves, fen);
  });

  socket.on("botGameEnded", ({ gameId }) => {
    handleBotGameEnded(socket, gameId);
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
  
  // Store IP and userAgent on the player record
  const currentPlayer = game.players.find(p => p.socketId === socket.id);
  if (currentPlayer) {
    currentPlayer.ip = socket.data.ip;
    currentPlayer.userAgent = socket.data.userAgent;
  }
  
  // Always join the socket to the game room
  socket.join(game.id);
  
  if (isNew) {
    // New game created, waiting for opponent
    socket.emit("waitingForOpponent", { 
      gameId: game.id,
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      incrementMs: game.incrementMs
    });
    console.log(`[Game] ${socket.id} created game ${game.id}`);
  } else {
    // Joined existing game, notify both players
    const white = game.players.find((p) => p.color === "w");
    const black = game.players.find((p) => p.color === "b");
    
    // Log PvP game started with both players' info
    // In findGame, the first player (waiting) is white, second player is black
    const gameCreatorColor = 'w'; // First player (white) created the game
    statsService.logPvpGameStarted(
      game.id,
      {
        ip: white?.ip || null,
        userAgent: white?.userAgent || null,
        userId: white?.userId || null
      },
      {
        ip: black?.ip || null,
        userAgent: black?.userAgent || null,
        userId: black?.userId || null
      },
      gameCreatorColor
    );
    
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
async function handleJoinGame(io, socket, gameId, userId = null, timeMinutes = null, incrementSeconds = null, playerColor = null) {
  const effectiveUserId = userId ?? socket.data.userId ?? socket.handshake.auth?.userId ?? null;
  if (effectiveUserId) socket.data.userId = effectiveUserId;

  // Track if this is a join attempt for a game that doesn't exist in memory
  const gameNotInMemory = gameId && !gameService.getGame(gameId);
  let hydratedFromDb = false;

  // After a server restart, games may only exist in MongoDB.
  // Hydrate them before joinGame() falls back to creating a new in-memory game.
  if (gameNotInMemory) {
    // Only attempt to hydrate from DB if mongoose is connected - otherwise skip to avoid blocking on timeouts
    const mongoose = require('mongoose');
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
      console.log(`[JoinGame] skipping hydrate for ${gameId} - DB not connected ts=${Date.now()}`);
    } else {
      console.log(`[JoinGame] hydrate check start for ${gameId} ts=${Date.now()}`);
      try {
        const hydratedGame = await gameService.hydrateGameFromDb(gameId);
        hydratedFromDb = !!hydratedGame;
        console.log(`[JoinGame] hydrate complete for ${gameId}, found: ${hydratedFromDb} ts=${Date.now()}`);
      } catch (e) {
        console.error(`[Game] Failed to hydrate game ${gameId}:`, e);
      }
    }
  }

  // If user provided specific game ID that doesn't exist in memory or DB, and they're not providing
  // time/color settings (meaning they're trying to JOIN an existing game, not CREATE one),
  // allow creation only if they're explicitly creating a new friend game.
  // 
  // Scenarios:
  // 1. First player creating game: timeMinutes is set → isCreatingNewGame = true → allow
  // 2. Second player joining via link: settings are null/undefined, game exists in memory → proceed to joinGame
  // 3. Second player joining via link: settings are null/undefined, game NOT in memory but in DB → hydrated → proceed
  // 4. Browsing completed game: settings are null/undefined, game in DB → hydrated → proceed as spectator
  // 5. Invalid/old link: settings are null/undefined, game not anywhere → error
  //
  // We only reject if: game wasn't in memory, wasn't hydrated from DB, AND no creation settings provided
  const hasCreationSettings = (timeMinutes != null && timeMinutes !== undefined);
  if (gameNotInMemory && !hydratedFromDb && !hasCreationSettings) {
    // Game doesn't exist anywhere and no settings to create it - return error
    socket.emit("error", { message: "Game not found", code: "GAME_NOT_FOUND" });
    console.log(`[JoinGame] Game ${gameId} not found in memory or DB, no creation settings, rejecting join`);
    return;
  }

  const result = gameService.joinGame(socket.id, effectiveUserId, gameId, timeMinutes, incrementSeconds, playerColor);
  
  if (!result || !result.game) {
    socket.emit("error", "Cannot join game");
    return;
  }

  const { game, role, reconnected } = result;

  // Store IP and userAgent on the player record
  const currentPlayer = game.players.find(p => p.socketId === socket.id);
  if (currentPlayer) {
    currentPlayer.ip = socket.data.ip;
    currentPlayer.userAgent = socket.data.userAgent;
    
    // Cancel any disconnect timeout for this player
    const timeoutKey = `${gameId}_${currentPlayer.color}`;
    if (disconnectTimeouts.has(timeoutKey)) {
      clearTimeout(disconnectTimeouts.get(timeoutKey).timeout);
      disconnectTimeouts.delete(timeoutKey);
      console.log(`[Game] Cancelled disconnect timeout for ${currentPlayer.color} in game ${gameId}`);
      // Notify other players that opponent has reconnected
      io.to(gameId).emit("opponentReconnected");
    }
  }

  // Join socket to the room
  socket.join(gameId);
  
  // If player reconnected, send them current game state
  if (reconnected) {
    const player = game.players.find(p => p.socketId === socket.id);
    
    // Calculate elapsed time since last move for the active player to sync clocks
    const now = Date.now();
    let adjustedWhiteMs = game.whiteMs;
    let adjustedBlackMs = game.blackMs;
    
    if (game.lastMoveTime && !game.isCompleted) {
      const elapsed = now - game.lastMoveTime;
      const turn = game.chess.turn();
      if (turn === 'w') adjustedWhiteMs = Math.max(0, game.whiteMs - elapsed);
      else adjustedBlackMs = Math.max(0, game.blackMs - elapsed);
    }

    socket.emit("gameStarted", {
      gameId: game.id,
      color: player.color,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: adjustedWhiteMs,
      blackMs: adjustedBlackMs,
      incrementMs: game.incrementMs,
      serverTime: now,
      history: game.historyMoves,
      movesInTurn: game.movesInTurn,
      // Include game over info if game is completed
      isCompleted: game.isCompleted || false,
      gameResult: game.gameResult || null,
      winner: game.winner || null,
    });
    console.log(`[Game] ${socket.id} reconnected to game ${gameId} as ${player.color} (completed: ${game.isCompleted})`);
    return;
  }
  
  // If joining as spectator
  if (role === 'spectator') {
    // Calculate elapsed time since last move for the active player
    const now = Date.now();
    let adjustedWhiteMs = game.whiteMs;
    let adjustedBlackMs = game.blackMs;
    
    if (game.lastMoveTime && !game.isCompleted) {
      const elapsed = now - game.lastMoveTime;
      const activePlayer = game.chess.turn();
      
      if (activePlayer === 'w') {
        adjustedWhiteMs = Math.max(0, game.whiteMs - elapsed);
      } else if (activePlayer === 'b') {
        adjustedBlackMs = Math.max(0, game.blackMs - elapsed);
      }
    }
    
    // Send current game state to spectator with adjusted clock times
    socket.emit("spectatorJoined", {
      gameId: game.id,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: adjustedWhiteMs,
      blackMs: adjustedBlackMs,
      incrementMs: game.incrementMs,
      serverTime: now,
      history: game.historyMoves,
      isCompleted: game.isCompleted,
      movesInTurn: game.movesInTurn,
      gameResult: game.gameResult,
      winner: game.winner,
      whitePlayer: game.players.find(p => p.color === 'w')?.username || 'White',
      blackPlayer: game.players.find(p => p.color === 'b')?.username || 'Black',
      isUnbalanced: game.isUnbalanced
    });
    console.log(`[Game] ${socket.id} joined game ${gameId} as spectator`);
    return;
  }
  
  // If only one player (game just created), wait for opponent
  if (game.players.length === 1) {
    // Find the player who just joined (it's the current socket)
    const currentPlayer = game.players.find(p => p.socketId === socket.id);
    socket.emit("waitingForOpponent", { 
      gameId: game.id,
      color: currentPlayer?.color,
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      incrementMs: game.incrementMs
    });
    console.log(`[Game] ${socket.id} created/joined game ${gameId} as ${currentPlayer?.color}, waiting for opponent`);
    return;
  }
  
  // Two players - start the game
  const white = game.players.find((p) => p.color === "w");
  const black = game.players.find((p) => p.color === "b");

  // Log PvP game started with both players' info
  // Determine who created the game (the one who was already in the game)
  const gameCreatorColor = currentPlayer.color === 'w' ? 'b' : 'w'; // The other player created the game
  statsService.logPvpGameStarted(
    gameId,
    {
      ip: white?.ip || null,
      userAgent: white?.userAgent || null,
      userId: white?.userId || null
    },
    {
      ip: black?.ip || null,
      userAgent: black?.userAgent || null,
      userId: black?.userId || null
    },
    gameCreatorColor
  );

  // Notify both players individually with their color
  if (white?.socketId) {
    io.to(white.socketId).emit("gameStarted", {
      gameId: game.id,
      color: "w",
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      incrementMs: game.incrementMs,
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
      incrementMs: game.incrementMs,
      serverTime: Date.now(),
    });
  }

  console.log(`[Game] Game ${gameId} started with ${white?.socketId} (white) vs ${black?.socketId} (black)`);
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
    movesInTurn: result.movesInTurn,
    whiteMs: result.whiteMs,
    blackMs: result.blackMs,
    serverTime: result.serverTime,
  });

  console.log(`[Move] Game ${gameId}: ${result.move.san}`);

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

  // If the server is shutting down, avoid emitting game-level disconnect
  // events or logging them as they are expected and noisy during shutdown.
  if (io && io.isShuttingDown) {
    console.log(`[Disconnect] ${socket.id} (server shutting down) - ignoring game disconnect handling`);
    return;
  }

  // Handle bot game disconnect - set timeout to save as abandoned
  if (socket.data.botGame && !socket.data.botGame.isCompleted) {
    const botGame = socket.data.botGame;
    
    // Only set timeout if moves were made
    if (botGame.moves && botGame.moves.length > 0) {
      console.log(`[BotGame] Player disconnected from bot game ${botGame.gameId}, starting 1-minute abort timer`);
      
      const timeoutKey = `bot_${botGame.gameId}`;
      if (disconnectTimeouts.has(timeoutKey)) {
        clearTimeout(disconnectTimeouts.get(timeoutKey).timeout);
      }
      
      // Set 1-minute timeout to save the bot game as abandoned
      const timeout = setTimeout(async () => {
        await handleBotGameAbort(socket);
        disconnectTimeouts.delete(timeoutKey);
      }, DISCONNECT_TIMEOUT_MS);
      
      disconnectTimeouts.set(timeoutKey, {
        timeout,
        disconnectedAt: Date.now(),
        socket // Keep reference to socket for the abort handler
      });
    } else {
      console.log(`[BotGame] Player disconnected from bot game ${botGame.gameId} before any moves`);
    }
  }

  // Handle PvP game disconnect
  for (const [gameId, game] of gameService.games.entries()) {
    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) continue;
    
    // Skip if game is already completed
    if (game.isCompleted) {
      console.log(`[Game] Player disconnected from completed game ${gameId}`);
      continue;
    }
    
    // Skip if game hasn't started yet (no moves made)
    if (!game.historyMoves || game.historyMoves.length === 0) {
      console.log(`[Game] Player disconnected from game ${gameId} before any moves, not setting abort timer`);
      io.to(gameId).emit("opponentDisconnected");
      continue;
    }
    
    // Notify opponent
    io.to(gameId).emit("opponentDisconnected");
    console.log(`[Game] Player ${player.color} disconnected from ${gameId}, starting abort timer`);
    
    // Store the disconnected socket ID before clearing it
    const disconnectedSocketId = socket.id;
    
    // Clear the player's socket ID to mark them as disconnected
    player.socketId = null;
    
    // Clear any existing timeout for this game/player
    const timeoutKey = `${gameId}_${player.color}`;
    if (disconnectTimeouts.has(timeoutKey)) {
      clearTimeout(disconnectTimeouts.get(timeoutKey).timeout);
    }
    
    // Set timeout to abort the game
    const timeout = setTimeout(() => {
      handleGameAbort(io, gameId, player.color);
      disconnectTimeouts.delete(timeoutKey);
    }, DISCONNECT_TIMEOUT_MS);
    
    disconnectTimeouts.set(timeoutKey, {
      color: player.color,
      timeout,
      disconnectedAt: Date.now(),
      disconnectedSocketId
    });
  }
}

/**
 * Handle game abort due to disconnect timeout
 */
function handleGameAbort(io, gameId, disconnectedColor) {
  const game = gameService.getGame(gameId);
  if (!game) return;
  
  // Don't abort if game is already completed
  if (game.isCompleted) {
    console.log(`[Game] Abort timer fired but game ${gameId} is already completed`);
    return;
  }
  
  // Check if the disconnected player has reconnected
  const player = game.players.find(p => p.color === disconnectedColor);
  if (player && player.socketId) {
    console.log(`[Game] Player ${disconnectedColor} reconnected to ${gameId}, cancelling abort`);
    return;
  }
  
  const winner = disconnectedColor === 'w' ? 'black' : 'white';
  
  console.log(`[Game] Aborting game ${gameId} - ${disconnectedColor} disconnected for 1 minute`);
  
  io.to(gameId).emit("gameOver", { 
    reason: "abandonment",
    winner: winner,
    abandonedColor: disconnectedColor
  });

  // Save game to database with abandonment result
  gameService.saveGameToDb(gameId, "abandonment", winner);
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

/**
 * Handle bot game started - store in memory for disconnect tracking
 */
function handleBotGameStarted(socket, gameId, skillLevel, playerColor, isUnbalanced) {
  if (!gameId) return;
  
  // Store bot game in the socket's data for tracking
  socket.data.botGame = {
    gameId,
    skillLevel,
    playerColor,
    isUnbalanced,
    moves: [],
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    startedAt: new Date().toISOString(),
    isCompleted: false
  };
  
  console.log(`[BotGame] Started: ${gameId} (socket: ${socket.id}, skill: ${skillLevel}, color: ${playerColor})`);
}

/**
 * Handle bot game move - update stored state
 */
function handleBotGameMove(socket, gameId, moves, fen) {
  if (!socket.data.botGame || socket.data.botGame.gameId !== gameId) return;
  
  socket.data.botGame.moves = moves || [];
  socket.data.botGame.fen = fen || socket.data.botGame.fen;
}

/**
 * Handle bot game ended normally (checkmate, draw, resignation, timeout)
 * This clears the bot game from tracking so it won't be saved as abandoned
 */
function handleBotGameEnded(socket, gameId) {
  if (!socket.data.botGame || socket.data.botGame.gameId !== gameId) return;
  
  socket.data.botGame.isCompleted = true;
  console.log(`[BotGame] Ended normally: ${gameId}`);
}

/**
 * Handle bot game abandonment (called from disconnect timeout)
 */
async function handleBotGameAbort(socket) {
  const botGame = socket.data.botGame;
  if (!botGame) return;
  if (botGame.isCompleted) return;
  if (!botGame.moves || botGame.moves.length === 0) {
    console.log(`[BotGame] Not saving abandoned game ${botGame.gameId} - no moves made`);
    return;
  }
  
  console.log(`[BotGame] Saving abandoned game: ${botGame.gameId} (${botGame.moves.length} moves)`);
  
  // Save to database via stats service
  await statsService.logGameCompleted(
    botGame.gameId,
    'abandonment',
    null, // No winner for abandoned games
    true, // isBotGame
    null, // sessionId
    null, // userId
    socket.data.userAgent,
    socket.data.ip,
    {
      moves: botGame.moves,
      fen: botGame.fen,
      skillLevel: botGame.skillLevel,
      playerColor: botGame.playerColor,
      isUnbalanced: botGame.isUnbalanced,
      startedAt: botGame.startedAt
    }
  );
  
  // Clear the bot game data
  socket.data.botGame = null;
}

module.exports = { registerSocketHandlers };
