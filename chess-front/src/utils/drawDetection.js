/**
 * Draw Detection Utility for Marseillais (Double-Move) Chess
 * 
 * Tracks position history for threefold repetition and halfmove clock for 50-move rule.
 * Works independently of chess.js to properly track Marseillais-specific rules.
 */

/**
 * Generate a position hash from a FEN string for repetition detection.
 * Only considers piece positions, side to move, castling rights, and en passant square.
 * Does NOT include halfmove clock or fullmove number (those don't affect repetition).
 */
export function getPositionKey(fen) {
  const parts = fen.split(' ');
  // parts[0] = piece positions, parts[1] = side to move, parts[2] = castling, parts[3] = en passant
  // We ignore parts[4] (halfmove clock) and parts[5] (fullmove number) for repetition
  return `${parts[0]}|${parts[1]}|${parts[2]}|${parts[3]}`;
}

/**
 * DrawTracker class for tracking draw conditions in a game
 */
export class DrawTracker {
  constructor() {
    this.positionHistory = new Map(); // Map<positionKey, count>
    this.halfMoveClock = 0; // Moves since last pawn move or capture
    this.lastMoveWasPawn = false;
    this.lastMoveWasCapture = false;
  }

  /**
   * Reset the tracker to initial state
   */
  reset() {
    this.positionHistory = new Map();
    this.halfMoveClock = 0;
    this.lastMoveWasPawn = false;
    this.lastMoveWasCapture = false;
    
    // Record initial position
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.recordPosition(initialFen);
  }

  /**
   * Record a position for repetition tracking
   * @param {string} fen - The FEN string of the current position
   */
  recordPosition(fen) {
    const key = getPositionKey(fen);
    const count = this.positionHistory.get(key) || 0;
    this.positionHistory.set(key, count + 1);
    return count + 1;
  }

  /**
   * Record a move and update tracking state
   * @param {Object} move - The move object from chess.js (with san, captured, piece properties)
   * @param {string} fenAfterMove - The FEN string after the move
   * @returns {Object} - Draw status { isRepetition, isFiftyMove, repetitionCount }
   */
  recordMove(move, fenAfterMove) {
    // Check if this move resets the halfmove clock
    const isPawnMove = move.piece === 'p';
    const isCapture = !!move.captured;
    
    if (isPawnMove || isCapture) {
      this.halfMoveClock = 0;
    } else {
      this.halfMoveClock++;
    }
    
    this.lastMoveWasPawn = isPawnMove;
    this.lastMoveWasCapture = isCapture;
    
    // Record the new position
    const repetitionCount = this.recordPosition(fenAfterMove);
    
    return {
      isRepetition: repetitionCount >= 3,
      isFiftyMove: this.halfMoveClock >= 100, // 100 half-moves = 50 full moves
      repetitionCount,
      halfMoveClock: this.halfMoveClock
    };
  }

  /**
   * Check current draw status based on a position
   * @param {string} fen - The FEN string to check
   * @returns {Object} - Draw status
   */
  checkDrawStatus(fen) {
    const key = getPositionKey(fen);
    const repetitionCount = this.positionHistory.get(key) || 0;
    
    return {
      isRepetition: repetitionCount >= 3,
      isFiftyMove: this.halfMoveClock >= 100,
      repetitionCount,
      halfMoveClock: this.halfMoveClock
    };
  }

  /**
   * Get the draw reason if any
   * @param {string} fen - The FEN string to check
   * @returns {string|null} - 'repetition', 'fifty-move', or null
   */
  getDrawReason(fen) {
    const status = this.checkDrawStatus(fen);
    if (status.isRepetition) return 'repetition';
    if (status.isFiftyMove) return 'fifty-move';
    return null;
  }

  /**
   * Export state for persistence (e.g., saving game state)
   */
  exportState() {
    return {
      positionHistory: Array.from(this.positionHistory.entries()),
      halfMoveClock: this.halfMoveClock
    };
  }

  /**
   * Import state from persistence
   */
  importState(state) {
    if (state.positionHistory) {
      this.positionHistory = new Map(state.positionHistory);
    }
    if (typeof state.halfMoveClock === 'number') {
      this.halfMoveClock = state.halfMoveClock;
    }
  }
}

/**
 * Create a DrawTracker instance
 */
export function createDrawTracker() {
  const tracker = new DrawTracker();
  tracker.reset();
  return tracker;
}
