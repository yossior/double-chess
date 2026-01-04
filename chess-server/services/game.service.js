const { Chess } = require("chess.js");
const { CLOCK } = require("../config/constants");
const Game = require("../models/game.model");
const User = require("../models/user.model");

class GameService {
  constructor() {
    this.games = new Map();
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
    const existingPlayer = game.players.find(p => 
      p.socketId === socketId || (userId && p.userId && p.userId === userId)
    );
    if (existingPlayer) {
      // Update socket ID for reconnection
      existingPlayer.socketId = socketId;
      console.log(`[Game] Player reconnected to game ${gameId} as ${existingPlayer.color}`);
      return { game, role: 'player', reconnected: true };
    }
    
    // If game is completed, return as spectator
    if (game.isCompleted) {
      game.spectators.push({ socketId, userId });
      return { game, role: 'spectator' };
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
    // Don't set lastMoveTime here - it will be set after the first move
    
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

    // Update clock: subtract elapsed time from moving player, then add increment
    // Use game.incrementMs if set, otherwise use default
    const incrementMs = game.incrementMs ?? CLOCK.INCREMENT_MS;
    if (player.color === "w") {
      game.whiteMs = Math.max(0, game.whiteMs - elapsed) + incrementMs;
    } else {
      game.blackMs = Math.max(0, game.blackMs - elapsed) + incrementMs;
    }

    // Update last move time for next move
    game.lastMoveTime = now;

    const fenAfter = game.chess.fen();

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

    if (game.chess.isGameOver()) {
      if (game.chess.isCheckmate()) return "checkmate";
      if (game.chess.isDraw()) return "draw";
      if (game.chess.isStalemate()) return "stalemate";
      return "unknown";
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

      // Save game to database (even for guest games, so they can be viewed)
      const newGame = await Game.create({
        white: whitePlayer?.userId || null,
        black: blackPlayer?.userId || null,
        moves: game.chess.history(),
        fen: game.chess.fen(),
        result: result, // 'checkmate', 'draw', 'resignation', etc.
        winner: winner, // 'white', 'black', or null
        whiteMs: game.whiteMs,
        blackMs: game.blackMs,
        completedAt: new Date()
      });

      // Update users' game history if they're registered
      if (whitePlayer?.userId) {
        await User.findByIdAndUpdate(whitePlayer.userId, { $push: { games: newGame._id } });
      }
      if (blackPlayer?.userId) {
        await User.findByIdAndUpdate(blackPlayer.userId, { $push: { games: newGame._id } });
      }

      game.savedGameId = newGame._id;

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
      const game = await Game.findOne({ _id: gameId })
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
