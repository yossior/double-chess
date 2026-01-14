const { Chess } = require("chess.js");
const { CLOCK } = require("../config/constants");
const Game = require("../models/game.model");
const User = require("../models/user.model");
const statsService = require("./stats.service");

/**
 * Generate a position key from FEN for repetition detection.
 * Only includes piece positions, side to move, castling, and en passant.
 */
function getPositionKey(fen) {
  const parts = fen.split(' ');
  // parts[0] = piece positions, parts[1] = side to move, parts[2] = castling, parts[3] = en passant
  return `${parts[0]}|${parts[1]}|${parts[2]}|${parts[3]}`;
}

class GameService {
  constructor() {
    this.games = new Map();
  }

  /**
   * Check if a DB game document represents a completed game
   */
  _isDbGameCompleted(dbGame) {
    if (!dbGame) return false;
    return Boolean(
      dbGame.completedAt ||
      dbGame.result ||
      dbGame.winner ||
      dbGame.status === 'completed'
    );
  }

  /**
   * Replay moves from DB to rebuild Chess instance and history for spectators
   */
  _replayMovesForSpectator(moves = [], isUnbalanced = true) {
    const chess = new Chess();
    const historyMoves = [];
    let movesInTurn = 0;
    let halfMoveClock = 0;
    const positionHistory = new Map();
    
    // Record initial position
    const initialPosKey = getPositionKey(chess.fen());
    positionHistory.set(initialPosKey, 1);

    for (let i = 0; i < moves.length; i++) {
      const san = moves[i];
      const result = chess.move(san);
      if (!result) break;

      // Apply the same double-move turn-flip logic used during live play
      if (!chess.isGameOver()) {
        const isFirstTurnBalanced = !isUnbalanced && i === 0 && result.color === 'w';
        
        if (isFirstTurnBalanced) {
          movesInTurn = 0;
        } else if (movesInTurn === 0) {
          if (result.san.includes('+')) {
            movesInTurn = 0;
          } else {
            const parts = chess.fen().split(' ');
            parts[1] = parts[1] === 'w' ? 'b' : 'w';
            parts[3] = '-';
            chess.load(parts.join(' '));
            movesInTurn = 1;
          }
        } else {
          movesInTurn = 0;
        }
      } else {
        movesInTurn = 0;
      }
      
      // Track draw conditions
      const isPawnMove = result.piece === 'p';
      const isCapture = !!result.captured;
      if (isPawnMove || isCapture) {
        halfMoveClock = 0;
      } else {
        halfMoveClock++;
      }
      
      // Track position for repetition
      const posKey = getPositionKey(chess.fen());
      positionHistory.set(posKey, (positionHistory.get(posKey) || 0) + 1);

      historyMoves.push({
        san: result.san,
        color: result.color,
        fen: chess.fen(),
      });
    }

    return { chess, historyMoves, movesInTurn, halfMoveClock, positionHistory };
  }

  /**
   * After a server restart, hydrate a game from MongoDB by its public gameId.
   * Returns the in-memory game object or null if not found.
   */
  async hydrateGameFromDb(gameId) {
    if (!gameId) return null;
    if (this.games.has(gameId)) return this.games.get(gameId);

    console.log(`[DB] Attempting to hydrate game ${gameId} from database...`);

    let dbGame = null;
    try {
      dbGame = await Game.findOne({ gameId })
        .populate('white', 'username')
        .populate('black', 'username');
    } catch (error) {
      console.error(`[DB] Failed to query game by gameId ${gameId}:`, error);
      return null;
    }

    if (!dbGame) {
      console.log(`[DB] Game ${gameId} not found in database`);
      return null;
    }

    console.log(`[DB] Hydrating game ${gameId} from database (completed: ${this._isDbGameCompleted(dbGame)}, moves: ${dbGame.moves?.length || 0})`);

    const isCompleted = this._isDbGameCompleted(dbGame);
    const gameIsUnbalanced = dbGame.isUnbalanced !== undefined ? dbGame.isUnbalanced : true;
    
    const { chess, historyMoves, movesInTurn, halfMoveClock, positionHistory } = this._replayMovesForSpectator(dbGame.moves || [], gameIsUnbalanced);

    // Trust the persisted final FEN for the final position
    if (dbGame.fen) {
      try {
        chess.load(dbGame.fen);
      } catch {
        // ignore; keep replayed position
      }
    }

    // Map DB players to the format expected by the service
    const players = [];
    if (dbGame.white) {
      players.push({
        userId: dbGame.white._id || dbGame.white,
        username: dbGame.white.username,
        color: 'w',
        socketId: null // Not connected yet
      });
    }
    if (dbGame.black) {
      players.push({
        userId: dbGame.black._id || dbGame.black,
        username: dbGame.black.username,
        color: 'b',
        socketId: null // Not connected yet
      });
    }

    const game = {
      id: gameId,
      chess,
      players,
      spectators: [],
      createdAt: dbGame.createdAt ? new Date(dbGame.createdAt).getTime() : Date.now(),
      startedAt: dbGame.startedAt ? new Date(dbGame.startedAt).getTime() : null,
      whiteMs: dbGame.whiteMs ?? CLOCK.INITIAL_TIME_MS,
      blackMs: dbGame.blackMs ?? CLOCK.INITIAL_TIME_MS,
      incrementMs: dbGame.increment ?? CLOCK.INCREMENT_MS,
      lastMoveTime: null,
      historyMoves,
      movesInTurn,
      isUnbalanced: gameIsUnbalanced,
      isCompleted,
      completedAt: dbGame.completedAt ? new Date(dbGame.completedAt).getTime() : null,
      savedGameId: dbGame._id,
      gameResult: dbGame.result ?? null,
      winner: dbGame.winner ?? null,
      dbStatus: dbGame.status ?? null,
      // Draw tracking - restored from replayed moves
      positionHistory: positionHistory || new Map(),
      halfMoveClock: halfMoveClock || 0,
    };

    this.games.set(gameId, game);
    return game;
  }

  /**
   * Create a new game with initial player
   */
  createGame(socketId, userId = null) {
    const gameId = Math.random().toString(36).substr(2, 9);
    return this.createGameWithId(gameId, socketId, userId);
  }

  /**
   * Create a new game with specific ID (for friend mode)
   */
  createGameWithId(gameId, socketId, userId = null, isUnbalanced = true, timeMinutes = null, incrementSeconds = null, playerColor = 'w') {
    // Check if game already exists
    if (this.games.has(gameId)) {
      return this.games.get(gameId);
    }

    const chess = new Chess();
    
    // Use custom time or default
    const initialTimeMs = timeMinutes ? timeMinutes * 60 * 1000 : CLOCK.INITIAL_TIME_MS;
    const incrementMs = incrementSeconds !== null ? incrementSeconds * 1000 : CLOCK.INCREMENT_MS;
    
    // Initialize position history for threefold repetition tracking
    const initialPositionKey = getPositionKey(chess.fen());
    const positionHistory = new Map();
    positionHistory.set(initialPositionKey, 1);
    
    const game = {
      id: gameId,
      chess,
      players: [{ socketId, userId, color: playerColor }],
      spectators: [], // Track spectators
      createdAt: Date.now(),
      startedAt: null,
      whiteMs: initialTimeMs,
      blackMs: initialTimeMs,
      incrementMs: incrementMs,
      lastMoveTime: null,
      historyMoves: [],
      movesInTurn: 0,
      isUnbalanced: isUnbalanced,
      isCompleted: false,
      completedAt: null,
      savedGameId: null, // MongoDB _id after saving
      gameResult: null, // 'checkmate', 'resignation', 'timeout', 'draw', etc.
      winner: null, // 'white', 'black', or null
      // Draw tracking for Marseillais chess
      positionHistory, // Map<positionKey, count> for threefold repetition
      halfMoveClock: 0, // Moves since last pawn move or capture (for 50-move rule)
    };

    this.games.set(gameId, game);
    return game;
  }

  /**
   * Join an existing game (or create if doesn't exist for friend mode)
   */
  joinGame(socketId, userId = null, gameId, timeMinutes = null, incrementSeconds = null, playerColor = null) {
    let game = this.games.get(gameId);
    
    // If game doesn't exist, create it (first player joining via link)
    if (!game) {
      // Use provided color or default to white
      const creatorColor = playerColor || 'w';
      game = this.createGameWithId(gameId, socketId, userId, true, timeMinutes, incrementSeconds, creatorColor);
      return { game, role: 'player' };
    }
    
    // Check if this socket or user is already a player in this game (reconnection)
    const existingPlayer = game.players.find(p => {
      // Same socket ID (same browser session)
      if (p.socketId === socketId) return true;
      
      // Same user ID (logged in, different session)
      if (userId && p.userId && p.userId === userId) return true;
      
      // Same color with both being guests (no userIds) - for guest reconnection
      if (playerColor && p.color === playerColor && !p.userId && !userId) return true;
      
      return false;
    });
    if (existingPlayer) {
      // Update socket ID for reconnection
      existingPlayer.socketId = socketId;
      // Also update userId if this is the first time we're getting it
      if (userId && !existingPlayer.userId) {
        existingPlayer.userId = userId;
      }
      console.log(`[Game] Player reconnected to game ${gameId} as ${existingPlayer.color} (completed: ${game.isCompleted})`);
      // Return as player with reconnected flag - even for completed games
      // The handler will send the appropriate event (with game over info if completed)
      return { game, role: 'player', reconnected: true, isCompleted: game.isCompleted };
    }
    
    // If game is completed and not an existing player, return as spectator
    if (game.isCompleted) {
      game.spectators.push({ socketId, userId });
      return { game, role: 'spectator' };
    }

    // Hydrated games (after restart) may have zero active players in memory.
    // Treat the first join as the first player instead of forcing them into the "second player" branch.
    if (game.players.length === 0) {
      const creatorColor = playerColor || 'w';
      game.players.push({ socketId, userId, color: creatorColor });
      if (!game.startedAt && (game.dbStatus === 'in_progress' || game.dbStatus === 'active')) {
        game.startedAt = Date.now();
      }
      return { game, role: 'player' };
    }
    
    // If game already has 2 players, join as spectator
    if (game.players.length >= 2) {
      game.spectators.push({ socketId, userId });
      return { game, role: 'spectator' };
    }

    // Join as second player - assign opposite color of first player
    const firstPlayerColor = game.players[0]?.color || 'w';
    const secondPlayerColor = firstPlayerColor === 'w' ? 'b' : 'w';
    game.players.push({ socketId, userId, color: secondPlayerColor });
    game.startedAt = Date.now();
    // Don't set lastMoveTime here - wait until the first move is actually made
    
    return { game, role: 'player' };
  }

  /**
   * Find a waiting game or create new one
   */
  findOrCreateGame(socketId, userId = null) {
    const waitingGame = [...this.games.values()].find((game) => {
      if (game.players.length !== 1) return false;
      const existingPlayer = game.players[0];

      // Avoid matching the same user with themselves when userId is known
      if (userId && existingPlayer.userId && existingPlayer.userId === userId) return false;

      return true;
    });

    if (waitingGame) {
      const result = this.joinGame(socketId, userId, waitingGame.id);
      return { game: result.game, isNew: false };
    } else {
      return { game: this.createGame(socketId, userId), isNew: true };
    }
  }

  /**
   * Get game by ID
   */
  getGame(gameId) {
    return this.games.get(gameId);
  }

  /**
   * Make a move in a game
   */
  makeMove(gameId, socketId, move) {
    const game = this.games.get(gameId);
    if (!game) return { success: false, error: "Game not found" };

    const player = game.players.find((p) => p.socketId === socketId);
    if (!player) return { success: false, error: "Player not in game" };

    // Check turn
    if (player.color !== game.chess.turn()) {
      return { success: false, error: "Not your turn" };
    }

    // Attempt move
    const result = game.chess.move(move);
    if (!result) {
      return { success: false, error: "Illegal move", move };
    }

    // Initialize lastMoveTime on first move if not already set
    if (!game.lastMoveTime) {
      game.lastMoveTime = Date.now();
    }

    // Double-move logic
    // In balanced mode: white's first turn is single move only, then double moves for everyone
    // In unbalanced mode: always double moves
    const totalMoves = game.historyMoves.length; // moves before this one
    const isFirstTurnBalanced = !game.isUnbalanced && totalMoves === 0 && result.color === 'w';
    
    if (!game.chess.isGameOver()) {
      if (isFirstTurnBalanced) {
        // Balanced mode, first turn - white only gets 1 move
        game.movesInTurn = 0;
      } else if (game.movesInTurn === 0) {
        // First move of the turn (double move applies)
        // If check, turn ends. Otherwise, same player moves again.
        if (result.san.includes('+')) {
          game.movesInTurn = 0;
        } else {
          // Flip turn back to the player who just moved
          const fen = game.chess.fen();
          const parts = fen.split(' ');
          // parts[1] is the current active color (which just switched). We want to revert it.
          parts[1] = parts[1] === 'w' ? 'b' : 'w';
          // Clear en-passant target
          parts[3] = '-';
          const newFen = parts.join(' ');
          game.chess.load(newFen);
          game.movesInTurn = 1;
        }
      } else {
        // Second move of the turn
        game.movesInTurn = 0;
      }
    } else {
      game.movesInTurn = 0;
    }

    // Calculate elapsed time since last move (or game start)
    const now = Date.now();
    const elapsed = game.lastMoveTime ? (now - game.lastMoveTime) : 0;

    // Update clock: subtract elapsed time from moving player
    if (player.color === "w") {
      game.whiteMs = Math.max(0, game.whiteMs - elapsed);
    } else {
      game.blackMs = Math.max(0, game.blackMs - elapsed);
    }

    // Apply increment only when turn ends (movesInTurn becomes 0)
    if (game.movesInTurn === 0) {
      const incrementMs = game.incrementMs ?? CLOCK.INCREMENT_MS;
      if (player.color === "w") {
        game.whiteMs = game.whiteMs + incrementMs;
      } else {
        game.blackMs = game.blackMs + incrementMs;
      }
    }

    // Update last move time for next move
    game.lastMoveTime = now;

    const fenAfter = game.chess.fen();
    
    // Track draw conditions (threefold repetition and 50-move rule)
    // Update halfmove clock: reset on pawn move or capture, otherwise increment
    const isPawnMove = result.piece === 'p';
    const isCapture = !!result.captured;
    if (isPawnMove || isCapture) {
      game.halfMoveClock = 0;
    } else {
      game.halfMoveClock = (game.halfMoveClock || 0) + 1;
    }
    
    // Track position for threefold repetition
    if (!game.positionHistory) {
      game.positionHistory = new Map();
    }
    const posKey = getPositionKey(fenAfter);
    const posCount = (game.positionHistory.get(posKey) || 0) + 1;
    game.positionHistory.set(posKey, posCount);

    // Store move with FEN, clock times, and server time for spectators
    game.historyMoves.push({ ...result, fen: fenAfter, whiteMs: game.whiteMs, blackMs: game.blackMs, serverTime: now });

    return {
      success: true,
      move: result,
      fen: fenAfter,
      turn: game.chess.turn(),
      movesInTurn: game.movesInTurn,
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: now,
    };
  }

  /**
   * Check if game is over
   */
  isGameOver(gameId) {
    const game = this.games.get(gameId);
    if (!game) return null;

    // Check chess.js built-in game over conditions
    if (game.chess.isGameOver()) {
      if (game.chess.isCheckmate()) return "checkmate";
      if (game.chess.isDraw()) return "draw";
      if (game.chess.isStalemate()) return "stalemate";
      return "unknown";
    }
    
    // Check for Marseillais-specific draw conditions
    // Threefold repetition
    if (game.positionHistory) {
      const currentPosKey = getPositionKey(game.chess.fen());
      const posCount = game.positionHistory.get(currentPosKey) || 0;
      if (posCount >= 3) {
        return "repetition";
      }
    }
    
    // 50-move rule (100 half-moves = 50 full moves)
    if (game.halfMoveClock >= 100) {
      return "fifty-move";
    }
    
    return null;
  }

  /**
   * Save game to database and mark as completed
   */
  async saveGameToDb(gameId, result, winner = null) {
    const game = this.games.get(gameId);
    if (!game) return;

    // Mark game as completed in memory FIRST (before async DB operation)
    // This ensures the game state is correct even if DB fails
    game.isCompleted = true;
    game.completedAt = Date.now();
    game.gameResult = result;
    game.winner = winner;

    try {
      const whitePlayer = game.players.find(p => p.color === 'w');
      const blackPlayer = game.players.find(p => p.color === 'b');

      // Get moves from historyMoves array (not chess.history() which can be cleared by load())
      // The double-move logic calls chess.load(newFen) which resets chess.js internal history
      let moves = [];
      if (game.historyMoves && game.historyMoves.length > 0) {
        moves = game.historyMoves.map(m => m.san).filter(Boolean);
      }

      // Save game to database (even for guest games, so they can be viewed)
      // Use upsert by gameId to avoid duplicate key errors if game was already synced
      const newGame = await Game.findOneAndUpdate(
        { gameId },
        {
          $set: {
            white: whitePlayer?.userId || null,
            whiteIp: whitePlayer?.ip || null,
            whiteUserAgent: whitePlayer?.userAgent || null,
            black: blackPlayer?.userId || null,
            blackIp: blackPlayer?.ip || null,
            blackUserAgent: blackPlayer?.userAgent || null,
            moves: moves,
            fen: game.chess?.fen() || game.historyMoves?.[game.historyMoves.length - 1]?.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            status: 'completed',
            result: result, // 'checkmate', 'draw', 'resignation', etc.
            winner: winner, // 'white', 'black', or null
            whiteMs: game.whiteMs,
            blackMs: game.blackMs,
            isUnbalanced: game.isUnbalanced,
            completedAt: new Date(),
          },
          $setOnInsert: {
            gameId,
            startedAt: game.startedAt ? new Date(game.startedAt) : null,
          },
        },
        { upsert: true, new: true }
      );

      // Update users' game history if they're registered
      if (whitePlayer?.userId) {
        await User.findByIdAndUpdate(whitePlayer.userId, { $push: { games: newGame._id } });
      }
      if (blackPlayer?.userId) {
        await User.findByIdAndUpdate(blackPlayer.userId, { $push: { games: newGame._id } });
      }

      game.savedGameId = newGame._id;

      // Log game completion stats (PvP games only - bot games are logged from frontend)
      await statsService.logGameCompleted(
        gameId, 
        result, 
        winner, 
        false, // isBotGame - server-side games are always PvP
        null,  // sessionId
        whitePlayer?.userId || blackPlayer?.userId
      );

      console.log(`[DB] Saved game ${gameId} to database with ID ${newGame._id}`);
      return newGame._id;
    } catch (error) {
      console.error(`[DB] Failed to save game ${gameId}:`, error);
      // Game is still marked completed in memory even if DB save fails
    }
  }

  /**
   * Get completed game from database
   */
  async getCompletedGameFromDb(gameId) {
    try {
      const game = await Game.findOne({ gameId })
        .populate('white', 'username')
        .populate('black', 'username');
      return game;
    } catch (error) {
      console.error(`[DB] Failed to fetch game ${gameId}:`, error);
      return null;
    }
  }

  /**
   * Delete a game
   */
  deleteGame(gameId) {
    return this.games.delete(gameId);
  }

  /**
   * Get game state for a player
   */
  getGameState(gameId, socketId, userId = null) {
    const game = this.games.get(gameId);
    if (!game) return null;

    const player = game.players.find(
      (p) => p.socketId === socketId || (userId && p.userId && p.userId === userId)
    );
    if (!player) return null;

    return {
      gameId: game.id,
      color: player.color,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
      whiteMs: game.whiteMs,
      blackMs: game.blackMs,
      serverTime: Date.now(),
      isGameOver: game.chess.isGameOver(),
      history: game.chess.history({ verbose: true }),
    };
  }
}

module.exports = new GameService();
