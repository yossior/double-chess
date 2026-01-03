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
    const chess = new Chess();
    
    const game = {
      id: gameId,
      chess,
      players: [{ socketId, userId, color: "w" }],
      createdAt: Date.now(),
      startedAt: null,
      whiteMs: CLOCK.INITIAL_TIME_MS,
      blackMs: CLOCK.INITIAL_TIME_MS,
      lastMoveTime: null,
    };

    this.games.set(gameId, game);
    return game;
  }

  /**
   * Join an existing game
   */
  joinGame(socketId, userId = null, gameId) {
    const game = this.games.get(gameId);
    if (!game) return null;
    if (game.players.length >= 2) return null;

    game.players.push({ socketId, userId, color: "b" });
    game.startedAt = Date.now();
    // Don't set lastMoveTime here - it will be set after the first move
    
    return game;
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
      return { game: this.joinGame(socketId, userId, waitingGame.id), isNew: false };
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

    // Calculate elapsed time since last move (or game start)
    const now = Date.now();
    const elapsed = game.lastMoveTime ? (now - game.lastMoveTime) : 0;

    // Update clock: subtract elapsed time from moving player, then add increment
    if (player.color === "w") {
      game.whiteMs = Math.max(0, game.whiteMs - elapsed) + CLOCK.INCREMENT_MS;
    } else {
      game.blackMs = Math.max(0, game.blackMs - elapsed) + CLOCK.INCREMENT_MS;
    }

    // Update last move time for next move
    game.lastMoveTime = now;

    return {
      success: true,
      move: result,
      fen: game.chess.fen(),
      turn: game.chess.turn(),
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
   * Save game to database
   */
  async saveGameToDb(gameId, result) {
    const game = this.games.get(gameId);
    if (!game) return;

    try {
      const whitePlayer = game.players.find(p => p.color === 'w');
      const blackPlayer = game.players.find(p => p.color === 'b');

      // Only save if at least one player is a registered user
      if (!whitePlayer?.userId && !blackPlayer?.userId) return;

      const newGame = await Game.create({
        white: whitePlayer?.userId || null,
        black: blackPlayer?.userId || null,
        moves: game.chess.history(),
        fen: game.chess.fen(),
        result: result, // 'checkmate', 'draw', etc.
        winner: result === 'checkmate' ? (game.chess.turn() === 'w' ? 'black' : 'white') : null
      });

      // Update users' game history
      if (whitePlayer?.userId) {
        await User.findByIdAndUpdate(whitePlayer.userId, { $push: { games: newGame._id } });
      }
      if (blackPlayer?.userId) {
        await User.findByIdAndUpdate(blackPlayer.userId, { $push: { games: newGame._id } });
      }

      console.log(`[DB] Saved game ${gameId} to database`);
    } catch (error) {
      console.error(`[DB] Failed to save game ${gameId}:`, error);
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
