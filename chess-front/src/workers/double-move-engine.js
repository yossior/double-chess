/**
 * Double-Move Chess Engine
 * 
 * Optimized for Marseillais Chess rules:
 * - Each turn = 2 consecutive moves by same player
 * - If first move is check, turn ends immediately
 * - Checks must be responded to on first move
 * 
 * Uses 10x12 Mailbox representation with Int8Array for speed
 * Uses minimax with alpha-beta pruning
 */

// ============================================================================
// DEBUG LOGGING
// ============================================================================
let ENGINE_DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development' ||
                   (typeof location !== 'undefined' && location.hostname === 'localhost');

export function setEngineDebug(enabled) {
  ENGINE_DEBUG = enabled;
}

function log(...args) {
  if (ENGINE_DEBUG) console.log(...args);
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Piece encoding: positive = white, negative = black
export const EMPTY = 0;
export const OFF_BOARD = 99;

export const W_PAWN = 1;
export const W_KNIGHT = 2;
export const W_BISHOP = 3;
export const W_ROOK = 4;
export const W_QUEEN = 5;
export const W_KING = 6;

export const B_PAWN = -1;
export const B_KNIGHT = -2;
export const B_BISHOP = -3;
export const B_ROOK = -4;
export const B_QUEEN = -5;
export const B_KING = -6;

export const WHITE = 1;
export const BLACK = -1;

// Material values
// MARSEILLAIS CHESS ADJUSTMENT: Pawns devalued to 80cp because spending a full
// turn (2 moves) to win a pawn while opponent develops is a losing trade
const PIECE_VALUES = new Int16Array([0, 80, 320, 330, 500, 900, 20000]);

// 10x12 mailbox - maps 64 squares to 120 array
// The padding allows easy off-board detection for sliding pieces
const MAILBOX_64 = new Int8Array([
  21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48,
  51, 52, 53, 54, 55, 56, 57, 58,
  61, 62, 63, 64, 65, 66, 67, 68,
  71, 72, 73, 74, 75, 76, 77, 78,
  81, 82, 83, 84, 85, 86, 87, 88,
  91, 92, 93, 94, 95, 96, 97, 98,
]);

// Reverse mapping: 120 -> 64 (or -1 if off-board)
const MAILBOX_120 = new Int8Array(120).fill(-1);
for (let i = 0; i < 64; i++) {
  MAILBOX_120[MAILBOX_64[i]] = i;
}

// Move offsets for each piece type (indexed by abs(piece))
const KNIGHT_OFFSETS = [-21, -19, -12, -8, 8, 12, 19, 21];
const BISHOP_OFFSETS = [-11, -9, 9, 11];
const ROOK_OFFSETS = [-10, -1, 1, 10];
const QUEEN_OFFSETS = [-11, -10, -9, -1, 1, 9, 10, 11];
const KING_OFFSETS = [-11, -10, -9, -1, 1, 9, 10, 11];

// Sliding piece flags
const IS_SLIDING = [false, false, false, true, true, true, false]; // 0=empty, 1=P, 2=N, 3=B, 4=R, 5=Q, 6=K

// ============================================================================
// ZOBRIST HASHING
// ============================================================================

// Seed the random generator for reproducibility
let seed = 1234567890;
function seededRandom() {
  seed = (seed * 1103515245 + 12345) & 0x7FFFFFFF;
  return seed / 0x7FFFFFFF;
}

function seededRandomBigInt() {
  const high = Math.floor(seededRandom() * 0xFFFFFFFF);
  const low = Math.floor(seededRandom() * 0xFFFFFFFF);
  return BigInt(high) << 32n | BigInt(low);
}

// Zobrist keys: [piece+6][square] (piece range -6 to 6, square 0-63)
const ZOBRIST_PIECES = [];
for (let p = 0; p <= 12; p++) { // 0-12 maps to pieces -6 to 6
  ZOBRIST_PIECES[p] = [];
  for (let sq = 0; sq < 64; sq++) {
    ZOBRIST_PIECES[p][sq] = seededRandomBigInt();
  }
}

// Zobrist keys for castling rights (16 combinations)
const ZOBRIST_CASTLING = [];
for (let i = 0; i < 16; i++) {
  ZOBRIST_CASTLING[i] = seededRandomBigInt();
}

// Zobrist keys for en passant file (8 files + 1 for no ep)
const ZOBRIST_EP = [];
for (let i = 0; i < 9; i++) {
  ZOBRIST_EP[i] = seededRandomBigInt();
}

// Zobrist key for side to move
const ZOBRIST_SIDE = seededRandomBigInt();

// ============================================================================
// MOVE ORDERING TABLES
// ============================================================================

// Killer moves per ply (moves that caused beta cutoffs) - used in move ordering
const MAX_PLY = 64;
const killerMoves = [];
for (let i = 0; i < MAX_PLY; i++) {
  killerMoves[i] = [0, 0];
}

// History table: [piece][toSquare] - used in move ordering
const historyTable = [];
for (let p = 0; p < 7; p++) {
  historyTable[p] = new Int32Array(64);
}

// ============================================================================
// PIECE-SQUARE TABLES (from white's perspective, index 0-63)
// ============================================================================

const PST_PAWN = new Int16Array([
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  15, 15, 25, 35, 35, 25, 15, 15,
  10, 10, 15, 30, 30, 15, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 15, 15,  0,  0,  0,
   5,  5,-30,-15,-15,-30,  5,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
]);

const PST_KNIGHT = new Int16Array([
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20, 10, 10, 10, 10,-20,-40,
  -30, 10, 25, 30, 30, 25, 10,-30,
  -30, 15, 30, 35, 35, 30, 15,-30,
  -30, 10, 30, 35, 35, 30, 10,-30,
  -30, 15, 25, 30, 30, 25, 15,-30,
  -40,-20,  5, 10, 10,  5,-20,-40,
  -50,-40,-20,-30,-30,-20,-40,-50,
]);

const PST_BISHOP = new Int16Array([
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  0, 15, 15, 15, 15,  0,-10,
  -10,  5, 15, 15, 15, 15,  5,-10,
  -10,  0, 15, 10, 10, 15,  0,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -20,-10,-40,-10,-10,-40,-10,-20,
]);

const PST_ROOK = new Int16Array([
   0,  0,  0,  0,  0,  0,  0,  0,
   5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
   0,  0,  0,  5,  5,  0,  0,  0,
]);

const PST_QUEEN = new Int16Array([
  -30,-20,-20,-10,-10,-20,-20,-30,
  -20,-10,-10, -5, -5,-10,-10,-20,
  -20,-10,  0,  0,  0,  0,-10,-20,
  -10, -5,  0,  0,  0,  0, -5,-10,
  -10, -5,  0,  0,  0,  0, -5,-10,
  -10,  0,  0,  0,  0,  0,  0,-10,
   -5,  0,  0,  0,  0,  0,  0, -5,
  -10, -5, -5,  0,  0, -5, -5,-10,
]);

const PST_KING = new Int16Array([
  -50,-50,-50,-50,-50,-50,-50,-50,
  -50,-50,-50,-50,-50,-50,-50,-50,
  -50,-50,-50,-50,-50,-50,-50,-50,
  -40,-40,-40,-50,-50,-40,-40,-40,
  -30,-30,-30,-40,-40,-30,-30,-30,
  -20,-20,-20,-20,-20,-20,-20,-20,
   10, 20, -5,-10,-10, -5, 20, 10,
   15, 40, 25,  0,  0, 10, 40, 15,
]);

const PST = [null, PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING];

// ============================================================================
// GAME STATE
// ============================================================================

export class GameState {
  constructor() {
    // 120-element board (10x12 mailbox)
    this.board = new Int8Array(120);
    
    // King positions for fast lookup
    this.whiteKingSq = -1;
    this.blackKingSq = -1;
    
    // Castling rights: 4 bits (WK, WQ, BK, BQ)
    this.castling = 0b1111;
    
    // En passant square (mailbox index, or -1 if none)
    this.epSquare = -1;
    
    // Side to move: 1 = white, -1 = black
    this.sideToMove = WHITE;
    
    // Move history for undo
    this.history = [];
    
    // Halfmove clock for 50-move rule (moves since last pawn move or capture)
    this.halfMoveClock = 0;
    
    // Position history for threefold repetition (map of position hash -> count)
    this.positionHistory = new Map();
    
    // Zobrist hash for transposition table
    this.zobristHash = 0n;
    
    this.reset();
  }
  
  reset() {
    // Fill with off-board markers
    this.board.fill(OFF_BOARD);
    
    // Set valid squares to empty
    for (let i = 0; i < 64; i++) {
      this.board[MAILBOX_64[i]] = EMPTY;
    }
    
    // Set up initial position
    // Black pieces (rank 8)
    this.board[21] = B_ROOK;
    this.board[22] = B_KNIGHT;
    this.board[23] = B_BISHOP;
    this.board[24] = B_QUEEN;
    this.board[25] = B_KING;
    this.board[26] = B_BISHOP;
    this.board[27] = B_KNIGHT;
    this.board[28] = B_ROOK;
    
    // Black pawns (rank 7)
    for (let f = 0; f < 8; f++) {
      this.board[31 + f] = B_PAWN;
    }
    
    // White pawns (rank 2)
    for (let f = 0; f < 8; f++) {
      this.board[81 + f] = W_PAWN;
    }
    
    // White pieces (rank 1)
    this.board[91] = W_ROOK;
    this.board[92] = W_KNIGHT;
    this.board[93] = W_BISHOP;
    this.board[94] = W_QUEEN;
    this.board[95] = W_KING;
    this.board[96] = W_BISHOP;
    this.board[97] = W_KNIGHT;
    this.board[98] = W_ROOK;
    
    this.whiteKingSq = 95;
    this.blackKingSq = 25;
    this.castling = 0b1111;
    this.epSquare = -1;
    this.sideToMove = WHITE;
    this.history = [];
    this.halfMoveClock = 0;
    this.positionHistory = new Map();
    
    // Compute initial Zobrist hash
    this.zobristHash = this.computeZobristHash();
    
    // Record initial position
    const initialHash = this.getPositionHash();
    this.positionHistory.set(initialHash, 1);
  }
  
  /**
   * Compute full Zobrist hash from scratch
   */
  computeZobristHash() {
    let hash = 0n;
    
    // Hash all pieces
    for (let sq64 = 0; sq64 < 64; sq64++) {
      const sq = MAILBOX_64[sq64];
      const piece = this.board[sq];
      if (piece !== EMPTY) {
        hash ^= ZOBRIST_PIECES[piece + 6][sq64];
      }
    }
    
    // Hash castling rights
    hash ^= ZOBRIST_CASTLING[this.castling];
    
    // Hash en passant
    if (this.epSquare !== -1) {
      const epFile = MAILBOX_120[this.epSquare] % 8;
      hash ^= ZOBRIST_EP[epFile];
    } else {
      hash ^= ZOBRIST_EP[8]; // No ep
    }
    
    // Hash side to move
    if (this.sideToMove === BLACK) {
      hash ^= ZOBRIST_SIDE;
    }
    
    return hash;
  }
  
  /**
   * Generate a hash string for the current position (for repetition detection)
   */
  getPositionHash() {
    // Include: piece positions, side to move, castling rights, ep square
    let hash = '';
    for (let i = 0; i < 64; i++) {
      const sq = MAILBOX_64[i];
      const piece = this.board[sq];
      hash += String.fromCharCode(piece + 50); // Offset to printable chars
    }
    hash += this.sideToMove === WHITE ? 'w' : 'b';
    hash += String.fromCharCode(this.castling + 65);
    hash += this.epSquare === -1 ? '-' : String.fromCharCode(this.epSquare);
    return hash;
  }
  
  /**
   * Load position from FEN string
   */
  loadFen(fen) {
    this.board.fill(OFF_BOARD);
    for (let i = 0; i < 64; i++) {
      this.board[MAILBOX_64[i]] = EMPTY;
    }
    
    const parts = fen.split(' ');
    const position = parts[0];
    
    let sq64 = 0;
    for (const char of position) {
      if (char === '/') continue;
      
      if (char >= '1' && char <= '8') {
        sq64 += parseInt(char);
      } else {
        const sq120 = MAILBOX_64[sq64];
        let piece = EMPTY;
        
        switch (char) {
          case 'P': piece = W_PAWN; break;
          case 'N': piece = W_KNIGHT; break;
          case 'B': piece = W_BISHOP; break;
          case 'R': piece = W_ROOK; break;
          case 'Q': piece = W_QUEEN; break;
          case 'K': piece = W_KING; this.whiteKingSq = sq120; break;
          case 'p': piece = B_PAWN; break;
          case 'n': piece = B_KNIGHT; break;
          case 'b': piece = B_BISHOP; break;
          case 'r': piece = B_ROOK; break;
          case 'q': piece = B_QUEEN; break;
          case 'k': piece = B_KING; this.blackKingSq = sq120; break;
        }
        
        this.board[sq120] = piece;
        sq64++;
      }
    }
    
    // Side to move
    this.sideToMove = (parts[1] === 'w') ? WHITE : BLACK;
    
    // Castling rights
    this.castling = 0;
    if (parts[2]) {
      if (parts[2].includes('K')) this.castling |= 0b1000;
      if (parts[2].includes('Q')) this.castling |= 0b0100;
      if (parts[2].includes('k')) this.castling |= 0b0010;
      if (parts[2].includes('q')) this.castling |= 0b0001;
    }
    
    // En passant
    this.epSquare = -1;
    if (parts[3] && parts[3] !== '-') {
      const file = parts[3].charCodeAt(0) - 97;
      const rank = 8 - parseInt(parts[3][1]);
      this.epSquare = MAILBOX_64[rank * 8 + file];
    }
    
    this.history = [];
    
    // Recompute Zobrist hash for loaded position
    this.zobristHash = this.computeZobristHash();
  }
  
  /**
   * Clone the game state (for search)
   */
  clone() {
    const copy = new GameState();
    copy.board.set(this.board);
    copy.whiteKingSq = this.whiteKingSq;
    copy.blackKingSq = this.blackKingSq;
    copy.castling = this.castling;
    copy.epSquare = this.epSquare;
    copy.sideToMove = this.sideToMove;
    copy.halfMoveClock = this.halfMoveClock;
    copy.positionHistory = new Map(this.positionHistory);
    copy.zobristHash = this.zobristHash;
    return copy;
  }
}

// ============================================================================
// MOVE REPRESENTATION
// ============================================================================

// Move is packed into 32 bits for speed:
// bits 0-6:   from square (0-119)
// bits 7-13:  to square (0-119)
// bits 14-17: captured piece (encoded as piece + 6 to make positive)
// bits 18-21: promotion piece (0 = none)
// bits 22-23: special flags (0=normal, 1=ep, 2=castle, 3=double pawn)

export function encodeMove(from, to, captured = 0, promotion = 0, flags = 0) {
  return (from & 0x7F) |
         ((to & 0x7F) << 7) |
         (((captured + 6) & 0xF) << 14) |
         ((promotion & 0xF) << 18) |
         ((flags & 0x3) << 22);
}

export function getMoveFrom(move) { return move & 0x7F; }
export function getMoveTo(move) { return (move >> 7) & 0x7F; }
export function getMoveCaptured(move) { return ((move >> 14) & 0xF) - 6; }
export function getMovePromotion(move) { return (move >> 18) & 0xF; }
export function getMoveFlags(move) { return (move >> 22) & 0x3; }

const FLAG_NORMAL = 0;
const FLAG_EP = 1;
const FLAG_CASTLE = 2;
const FLAG_DOUBLE_PAWN = 3;

// ============================================================================
// ATTACK DETECTION
// ============================================================================

/**
 * Check if a square is attacked by the given color
 */
export function isSquareAttacked(state, sq, byColor) {
  const board = state.board;
  
  // Knight attacks
  for (const offset of KNIGHT_OFFSETS) {
    const from = sq + offset;
    const piece = board[from];
    if (piece !== OFF_BOARD && piece * byColor === W_KNIGHT) {
      return true;
    }
  }
  
  // King attacks
  for (const offset of KING_OFFSETS) {
    const from = sq + offset;
    const piece = board[from];
    if (piece !== OFF_BOARD && piece * byColor === W_KING) {
      return true;
    }
  }
  
  // Pawn attacks
  const pawnDir = byColor === WHITE ? -10 : 10;
  const pawn = byColor === WHITE ? W_PAWN : B_PAWN;
  if (board[sq + pawnDir - 1] === pawn || board[sq + pawnDir + 1] === pawn) {
    return true;
  }
  
  // Sliding pieces (bishop/queen diagonals)
  for (const offset of BISHOP_OFFSETS) {
    let from = sq + offset;
    while (board[from] !== OFF_BOARD) {
      const piece = board[from];
      if (piece !== EMPTY) {
        if (piece * byColor === W_BISHOP || piece * byColor === W_QUEEN) {
          return true;
        }
        break;
      }
      from += offset;
    }
  }
  
  // Sliding pieces (rook/queen straights)
  for (const offset of ROOK_OFFSETS) {
    let from = sq + offset;
    while (board[from] !== OFF_BOARD) {
      const piece = board[from];
      if (piece !== EMPTY) {
        if (piece * byColor === W_ROOK || piece * byColor === W_QUEEN) {
          return true;
        }
        break;
      }
      from += offset;
    }
  }
  
  return false;
}

/**
 * Check if the given color's king is in check
 */
export function isInCheck(state, color) {
  const kingSq = color === WHITE ? state.whiteKingSq : state.blackKingSq;
  return isSquareAttacked(state, kingSq, -color);
}

// ============================================================================
// STATIC EXCHANGE EVALUATION (SEE)
// ============================================================================

/**
 * Static Exchange Evaluation - evaluates the material outcome of a capture sequence
 * Returns positive if the capture wins material, 0 if equal, negative if loses
 * @param {GameState} state - Current game state
 * @param {number} move - The capture move to evaluate
 */
export function staticExchangeEval(state, move) {
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  
  // Not a capture - SEE is 0
  if (captured === 0) return 0;
  
  const board = state.board;
  const attacker = Math.abs(board[from]);
  const attackerColor = board[from] > 0 ? WHITE : BLACK;
  
  // Handle promotion - the promoted piece is what sits on the square
  const pieceOnSquare = promotion !== 0 ? promotion : attacker;
  
  // Gain array: stores the material balance at each capture
  const gain = [];
  let depth = 0;
  
  // Initial capture value
  gain[depth] = PIECE_VALUES[Math.abs(captured)];
  
  // Simulate the capture sequence
  // We need to track which pieces have been "used" (removed from the board)
  // Using a simple simulation with a copy of relevant state
  
  // Track occupied squares (piece values, 0 = empty after capture)
  const tempBoard = new Int8Array(120);
  tempBoard.set(board);
  
  // Make the initial capture
  tempBoard[from] = EMPTY;
  tempBoard[to] = pieceOnSquare * attackerColor;
  
  let currentColor = -attackerColor; // Opponent's turn to recapture
  let currentPieceOnSquare = pieceOnSquare;
  
  // Keep capturing until no more attackers
  while (true) {
    depth++;
    
    // Find least valuable attacker for current color
    const nextAttacker = getLeastValuableAttackerFromBoard(tempBoard, to, currentColor);
    
    if (!nextAttacker) break;
    
    // The gain at this depth is: value of piece on square - previous gain
    // (negamax style: we gain what's there, opponent gained what they had)
    gain[depth] = PIECE_VALUES[currentPieceOnSquare] - gain[depth - 1];
    
    // Prune if the best we can do is still losing
    // max(-gain[d-1], gain[d]) < 0 means even with best play we lose
    if (Math.max(-gain[depth - 1], gain[depth]) < 0) break;
    
    // Make the capture
    tempBoard[nextAttacker.sq] = EMPTY;
    currentPieceOnSquare = nextAttacker.piece;
    tempBoard[to] = currentPieceOnSquare * currentColor;
    
    // Switch sides
    currentColor = -currentColor;
  }
  
  // Negamax the gain array to get final SEE value
  while (depth > 1) {
    depth--;
    gain[depth] = -Math.max(-gain[depth], gain[depth + 1]);
  }
  
  return gain[0];
}

/**
 * Helper for SEE: get least valuable attacker from a temporary board state
 */
function getLeastValuableAttackerFromBoard(board, sq, byColor) {
  let bestSq = -1;
  let bestPiece = 7;
  
  // Check pawns first
  const pawnDir = byColor === WHITE ? -10 : 10;
  const pawn = byColor === WHITE ? W_PAWN : B_PAWN;
  for (const sideDir of [-1, 1]) {
    const from = sq + pawnDir + sideDir;
    if (board[from] === pawn) {
      return { sq: from, piece: W_PAWN };
    }
  }
  
  // Knights
  for (const offset of KNIGHT_OFFSETS) {
    const from = sq + offset;
    const piece = board[from];
    if (piece !== OFF_BOARD && piece * byColor === W_KNIGHT) {
      return { sq: from, piece: W_KNIGHT };
    }
  }
  
  // Bishops and diagonal queens
  for (const offset of BISHOP_OFFSETS) {
    let from = sq + offset;
    while (board[from] !== OFF_BOARD) {
      const piece = board[from];
      if (piece !== EMPTY) {
        const absPiece = Math.abs(piece);
        if (piece * byColor > 0 && (absPiece === W_BISHOP || absPiece === W_QUEEN)) {
          if (absPiece < bestPiece) {
            bestSq = from;
            bestPiece = absPiece;
          }
        }
        break;
      }
      from += offset;
    }
  }
  if (bestPiece === W_BISHOP) return { sq: bestSq, piece: bestPiece };
  
  // Rooks and straight queens
  for (const offset of ROOK_OFFSETS) {
    let from = sq + offset;
    while (board[from] !== OFF_BOARD) {
      const piece = board[from];
      if (piece !== EMPTY) {
        const absPiece = Math.abs(piece);
        if (piece * byColor > 0 && (absPiece === W_ROOK || absPiece === W_QUEEN)) {
          if (absPiece < bestPiece) {
            bestSq = from;
            bestPiece = absPiece;
          }
        }
        break;
      }
      from += offset;
    }
  }
  if (bestPiece === W_ROOK) return { sq: bestSq, piece: bestPiece };
  if (bestPiece === W_QUEEN) return { sq: bestSq, piece: bestPiece };
  
  // King
  for (const offset of KING_OFFSETS) {
    const from = sq + offset;
    const piece = board[from];
    if (piece !== OFF_BOARD && piece * byColor === W_KING) {
      return { sq: from, piece: W_KING };
    }
  }
  
  return null;
}

// ============================================================================
// MOVE GENERATION
// ============================================================================

/**
 * Generate all pseudo-legal moves (doesn't verify king safety)
 */
export function generatePseudoLegalMoves(state, color) {
  const moves = [];
  const board = state.board;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const from = MAILBOX_64[sq64];
    const piece = board[from];
    
    if (piece === EMPTY || piece * color <= 0) continue;
    
    const pieceType = Math.abs(piece);
    
    if (pieceType === W_PAWN) {
      generatePawnMoves(state, from, color, moves);
    } else if (pieceType === W_KNIGHT) {
      generateKnightMoves(state, from, color, moves);
    } else if (pieceType === W_KING) {
      generateKingMoves(state, from, color, moves);
    } else {
      // Sliding pieces
      const offsets = pieceType === W_BISHOP ? BISHOP_OFFSETS :
                      pieceType === W_ROOK ? ROOK_OFFSETS : QUEEN_OFFSETS;
      generateSlidingMoves(state, from, color, offsets, moves);
    }
  }
  
  return moves;
}

function generatePawnMoves(state, from, color, moves) {
  const board = state.board;
  const dir = color === WHITE ? -10 : 10;
  const startRank = color === WHITE ? 8 : 3; // Mailbox rank for double push
  const promoRank = color === WHITE ? 2 : 9; // Mailbox rank for promotion
  
  const to = from + dir;
  
  // Check if we're on promotion rank
  const isPromo = Math.floor(to / 10) === promoRank;
  
  // Single push
  if (board[to] === EMPTY) {
    if (isPromo) {
      moves.push(encodeMove(from, to, 0, W_QUEEN, 0));
      moves.push(encodeMove(from, to, 0, W_ROOK, 0));
      moves.push(encodeMove(from, to, 0, W_BISHOP, 0));
      moves.push(encodeMove(from, to, 0, W_KNIGHT, 0));
    } else {
      moves.push(encodeMove(from, to, 0, 0, FLAG_NORMAL));
      
      // Double push
      if (Math.floor(from / 10) === startRank) {
        const to2 = from + dir * 2;
        if (board[to2] === EMPTY) {
          moves.push(encodeMove(from, to2, 0, 0, FLAG_DOUBLE_PAWN));
        }
      }
    }
  }
  
  // Captures
  for (const capDir of [-1, 1]) {
    const capTo = from + dir + capDir;
    const target = board[capTo];
    
    if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
      if (isPromo) {
        moves.push(encodeMove(from, capTo, target, W_QUEEN, 0));
        moves.push(encodeMove(from, capTo, target, W_ROOK, 0));
        moves.push(encodeMove(from, capTo, target, W_BISHOP, 0));
        moves.push(encodeMove(from, capTo, target, W_KNIGHT, 0));
      } else {
        moves.push(encodeMove(from, capTo, target, 0, FLAG_NORMAL));
      }
    }
    
    // En passant - only valid if capturing an ENEMY pawn
    // In double-move chess, a player's own pawn might set the ep square
    // but only the opponent should be able to capture it
    if (capTo === state.epSquare) {
      // The pawn being captured is on the adjacent rank
      const epPawnSq = capTo + (color === WHITE ? 10 : -10);
      const epPawn = board[epPawnSq];
      // Only generate EP if there's an enemy pawn there
      if (epPawn !== EMPTY && epPawn * color < 0 && Math.abs(epPawn) === W_PAWN) {
        const epCaptured = color === WHITE ? B_PAWN : W_PAWN;
        moves.push(encodeMove(from, capTo, epCaptured, 0, FLAG_EP));
      }
    }
  }
}

function generateKnightMoves(state, from, color, moves) {
  const board = state.board;
  
  for (const offset of KNIGHT_OFFSETS) {
    const to = from + offset;
    const target = board[to];
    
    if (target === OFF_BOARD) continue;
    if (target !== EMPTY && target * color > 0) continue; // Own piece
    
    moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
  }
}

function generateKingMoves(state, from, color, moves) {
  const board = state.board;
  
  // Normal king moves
  for (const offset of KING_OFFSETS) {
    const to = from + offset;
    const target = board[to];
    
    if (target === OFF_BOARD) continue;
    if (target !== EMPTY && target * color > 0) continue;
    
    moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
  }
  
  // Castling
  if (!isInCheck(state, color)) {
    if (color === WHITE) {
      // Kingside
      if ((state.castling & 0b1000) && 
          board[96] === EMPTY && board[97] === EMPTY &&
          !isSquareAttacked(state, 96, BLACK)) {
        moves.push(encodeMove(95, 97, 0, 0, FLAG_CASTLE));
      }
      // Queenside
      if ((state.castling & 0b0100) &&
          board[94] === EMPTY && board[93] === EMPTY && board[92] === EMPTY &&
          !isSquareAttacked(state, 94, BLACK)) {
        moves.push(encodeMove(95, 93, 0, 0, FLAG_CASTLE));
      }
    } else {
      // Kingside
      if ((state.castling & 0b0010) &&
          board[26] === EMPTY && board[27] === EMPTY &&
          !isSquareAttacked(state, 26, WHITE)) {
        moves.push(encodeMove(25, 27, 0, 0, FLAG_CASTLE));
      }
      // Queenside
      if ((state.castling & 0b0001) &&
          board[24] === EMPTY && board[23] === EMPTY && board[22] === EMPTY &&
          !isSquareAttacked(state, 24, WHITE)) {
        moves.push(encodeMove(25, 23, 0, 0, FLAG_CASTLE));
      }
    }
  }
}

function generateSlidingMoves(state, from, color, offsets, moves) {
  const board = state.board;
  
  for (const offset of offsets) {
    let to = from + offset;
    
    while (board[to] !== OFF_BOARD) {
      const target = board[to];
      
      if (target !== EMPTY) {
        if (target * color < 0) {
          // Capture
          moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
        }
        break;
      }
      
      moves.push(encodeMove(from, to, 0, 0, FLAG_NORMAL));
      to += offset;
    }
  }
}

/**
 * Generate legal moves (filters out moves that leave king in check)
 * @param isSecondMove - if true, used to handle double-move rules
 */
export function generateLegalMoves(state, color, isSecondMove = false) {
  const pseudoMoves = generatePseudoLegalMoves(state, color);
  const legalMoves = [];
  
  for (const move of pseudoMoves) {
    // Make the move temporarily
    const undoInfo = makeMove(state, move);
    
    // Check if our king is in check after the move
    if (!isInCheck(state, color)) {
      legalMoves.push(move);
    }
    
    // Undo the move
    undoMove(state, move, undoInfo);
  }
  
  return legalMoves;
}

// ============================================================================
// MAKE / UNDO MOVE
// ============================================================================

/**
 * Make a move on the board. Returns undo info.
 */
export function makeMove(state, move) {
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  const flags = getMoveFlags(move);
  
  const board = state.board;
  const piece = board[from];
  const pieceType = Math.abs(piece);
  const color = piece > 0 ? WHITE : BLACK;
  
  const from64 = MAILBOX_120[from];
  const to64 = MAILBOX_120[to];
  
  // Save state for undo
  const undoInfo = {
    castling: state.castling,
    epSquare: state.epSquare,
    piece: piece,
    halfMoveClock: state.halfMoveClock,
    zobristHash: state.zobristHash,
  };
  
  // Update Zobrist hash incrementally
  let hash = state.zobristHash;
  
  // Remove piece from source
  hash ^= ZOBRIST_PIECES[piece + 6][from64];
  
  // Remove captured piece (if any)
  if (captured !== 0 && flags !== FLAG_EP) {
    hash ^= ZOBRIST_PIECES[captured + 6][to64];
  }
  
  // Add piece to destination (or promoted piece)
  const finalPiece = promotion ? (promotion * color) : piece;
  hash ^= ZOBRIST_PIECES[finalPiece + 6][to64];
  
  // Handle en passant capture
  if (flags === FLAG_EP) {
    const epPawnSq = to + (color === WHITE ? 10 : -10);
    const epPawn64 = MAILBOX_120[epPawnSq];
    const epCaptured = color === WHITE ? B_PAWN : W_PAWN;
    hash ^= ZOBRIST_PIECES[epCaptured + 6][epPawn64];
  }
  
  // Handle castling rook movement
  if (flags === FLAG_CASTLE) {
    if (to === 97) { // White kingside
      hash ^= ZOBRIST_PIECES[W_ROOK + 6][MAILBOX_120[98]];
      hash ^= ZOBRIST_PIECES[W_ROOK + 6][MAILBOX_120[96]];
    } else if (to === 93) { // White queenside
      hash ^= ZOBRIST_PIECES[W_ROOK + 6][MAILBOX_120[91]];
      hash ^= ZOBRIST_PIECES[W_ROOK + 6][MAILBOX_120[94]];
    } else if (to === 27) { // Black kingside
      hash ^= ZOBRIST_PIECES[B_ROOK + 6][MAILBOX_120[28]];
      hash ^= ZOBRIST_PIECES[B_ROOK + 6][MAILBOX_120[26]];
    } else if (to === 23) { // Black queenside
      hash ^= ZOBRIST_PIECES[B_ROOK + 6][MAILBOX_120[21]];
      hash ^= ZOBRIST_PIECES[B_ROOK + 6][MAILBOX_120[24]];
    }
  }
  
  // Update castling hash (will be updated below)
  hash ^= ZOBRIST_CASTLING[state.castling];
  
  // Update ep hash
  if (state.epSquare !== -1) {
    const oldEpFile = MAILBOX_120[state.epSquare] % 8;
    hash ^= ZOBRIST_EP[oldEpFile];
  } else {
    hash ^= ZOBRIST_EP[8];
  }
  
  // Update halfmove clock (reset on pawn move or capture, else increment)
  if (pieceType === W_PAWN || captured !== 0) {
    state.halfMoveClock = 0;
  } else {
    state.halfMoveClock++;
  }
  
  // Clear en passant (will be set if double pawn push)
  state.epSquare = -1;
  
  // Move the piece
  board[from] = EMPTY;
  board[to] = promotion ? (promotion * color) : piece;
  
  // Handle special moves
  if (flags === FLAG_EP) {
    // Remove captured pawn
    const epPawnSq = to + (color === WHITE ? 10 : -10);
    board[epPawnSq] = EMPTY;
  } else if (flags === FLAG_CASTLE) {
    // Move rook
    if (to === 97) { // White kingside
      board[98] = EMPTY;
      board[96] = W_ROOK;
    } else if (to === 93) { // White queenside
      board[91] = EMPTY;
      board[94] = W_ROOK;
    } else if (to === 27) { // Black kingside
      board[28] = EMPTY;
      board[26] = B_ROOK;
    } else if (to === 23) { // Black queenside
      board[21] = EMPTY;
      board[24] = B_ROOK;
    }
  } else if (flags === FLAG_DOUBLE_PAWN) {
    // Set en passant square
    state.epSquare = from + (color === WHITE ? -10 : 10);
  }
  
  // Update king position
  if (pieceType === W_KING) {
    if (color === WHITE) {
      state.whiteKingSq = to;
    } else {
      state.blackKingSq = to;
    }
  }
  
  // Update castling rights
  if (pieceType === W_KING) {
    if (color === WHITE) {
      state.castling &= ~0b1100; // Remove white castling
    } else {
      state.castling &= ~0b0011; // Remove black castling
    }
  }
  
  // Rook moves or captures
  if (from === 98 || to === 98) state.castling &= ~0b1000; // White kingside
  if (from === 91 || to === 91) state.castling &= ~0b0100; // White queenside
  if (from === 28 || to === 28) state.castling &= ~0b0010; // Black kingside
  if (from === 21 || to === 21) state.castling &= ~0b0001; // Black queenside
  
  // Update castling hash with new rights
  hash ^= ZOBRIST_CASTLING[state.castling];
  
  // Update ep hash with new ep square
  if (state.epSquare !== -1) {
    const newEpFile = MAILBOX_120[state.epSquare] % 8;
    hash ^= ZOBRIST_EP[newEpFile];
  } else {
    hash ^= ZOBRIST_EP[8];
  }
  
  // Store the updated hash
  state.zobristHash = hash;
  
  // Record position for repetition detection
  if (state.positionHistory) {
    const posHash = state.getPositionHash();
    const count = state.positionHistory.get(posHash) || 0;
    state.positionHistory.set(posHash, count + 1);
    undoInfo.positionHash = posHash;
  }
  
  return undoInfo;
}

/**
 * Undo a move
 */
export function undoMove(state, move, undoInfo) {
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const captured = getMoveCaptured(move);
  const flags = getMoveFlags(move);
  
  const board = state.board;
  const piece = undoInfo.piece;
  const pieceType = Math.abs(piece);
  const color = piece > 0 ? WHITE : BLACK;
  
  // Restore piece to original square
  board[from] = piece;
  board[to] = captured !== 0 ? captured : EMPTY;
  
  // Handle special moves
  if (flags === FLAG_EP) {
    // Restore captured pawn
    const epPawnSq = to + (color === WHITE ? 10 : -10);
    board[epPawnSq] = color === WHITE ? B_PAWN : W_PAWN;
    board[to] = EMPTY;
  } else if (flags === FLAG_CASTLE) {
    // Move rook back
    if (to === 97) { // White kingside
      board[96] = EMPTY;
      board[98] = W_ROOK;
    } else if (to === 93) { // White queenside
      board[94] = EMPTY;
      board[91] = W_ROOK;
    } else if (to === 27) { // Black kingside
      board[26] = EMPTY;
      board[28] = B_ROOK;
    } else if (to === 23) { // Black queenside
      board[24] = EMPTY;
      board[21] = B_ROOK;
    }
  }
  
  // Restore king position
  if (pieceType === W_KING) {
    if (color === WHITE) {
      state.whiteKingSq = from;
    } else {
      state.blackKingSq = from;
    }
  }
  
  // Restore castling and ep
  state.castling = undoInfo.castling;
  state.epSquare = undoInfo.epSquare;
  
  // Restore halfmove clock
  if (undoInfo.halfMoveClock !== undefined) {
    state.halfMoveClock = undoInfo.halfMoveClock;
  }
  
  // Restore Zobrist hash
  if (undoInfo.zobristHash !== undefined) {
    state.zobristHash = undoInfo.zobristHash;
  }
  
  // Remove position from history
  if (state.positionHistory && undoInfo.positionHash) {
    const count = state.positionHistory.get(undoInfo.positionHash) || 0;
    if (count <= 1) {
      state.positionHistory.delete(undoInfo.positionHash);
    } else {
      state.positionHistory.set(undoInfo.positionHash, count - 1);
    }
  }
}

// ============================================================================
// EVALUATION
// ============================================================================

/**
 * Find a piece on the board (returns 64-index or -1 if not found)
 */
function findPiece(board, piece) {
  for (let sq64 = 0; sq64 < 64; sq64++) {
    if (board[MAILBOX_64[sq64]] === piece) return sq64;
  }
  return -1;
}

/**
 * Count legal moves for a side (simplified mobility calculation)
 */
function countMobility(state, forWhite) {
  const color = forWhite ? WHITE : BLACK;
  const moves = generateLegalMoves(state, color, false);
  return moves.length;
}

/**
 * Count pieces attacking squares near a king
 */
function countKingAttackers(state, kingSq, byWhite) {
  const board = state.board;
  let attackers = 0;
  
  // Check the 8 squares around the king + 2 knight jump squares
  const nearKingOffsets = [-11, -10, -9, -1, 1, 9, 10, 11, -21, -19, -12, -8, 8, 12, 19, 21];
  
  for (const offset of nearKingOffsets) {
    const sq = kingSq + offset;
    const piece = board[sq];
    if (piece === OFF_BOARD || piece === EMPTY) continue;
    
    const isWhitePiece = piece > 0;
    if (isWhitePiece === byWhite) {
      // Enemy piece near our king
      const pieceType = Math.abs(piece);
      if (pieceType >= 2 && pieceType <= 5) { // N, B, R, Q
        attackers++;
      }
    }
  }
  return attackers;
}

/**
 * Static evaluation - ALWAYS from WHITE's perspective
 * 
 * MARSEILLAIS CHESS EVALUATION PRINCIPLES:
 * 1. TEMPO > MATERIAL: A turn = 2 moves. Wasting moves to grab pawns is losing.
 * 2. MOBILITY MATTERS: More legal moves = more double-threat options.
 * 3. DEVELOPMENT IS CRITICAL: Each undeveloped piece = missed opportunity.
 * 4. BISHOP PAIR: Retaining both bishops provides crucial mobility.
 * 5. KING SAFETY: Exposed king can be mated in one double-turn.
 */
export function evaluate(state) {
  const board = state.board;
  let score = 0;
  let whiteMaterial = 0;
  let blackMaterial = 0;
  let whiteBishops = 0;
  let blackBishops = 0;
  
  // =========================================================================
  // PHASE 1: Material + PST
  // =========================================================================
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    if (piece === EMPTY) continue;
    
    const pieceType = Math.abs(piece);
    const color = piece > 0 ? WHITE : BLACK;
    
    // Material value (pawns already devalued to 80cp)
    const matValue = PIECE_VALUES[pieceType];
    
    if (color === WHITE) {
      whiteMaterial += matValue;
      if (pieceType === 3) whiteBishops++; // Count bishops for bishop pair
    } else {
      blackMaterial += matValue;
      if (pieceType === 3) blackBishops++;
    }
    
    // PST bonus
    const pstIndex = color === WHITE ? sq64 : (7 - Math.floor(sq64 / 8)) * 8 + (sq64 % 8);
    const pstValue = PST[pieceType][pstIndex];
    
    score += (matValue + pstValue) * color;
  }
  
  // =========================================================================
  // PHASE 2: Development (BUFFED - 45cp per piece)
  // In Marseillais, development is worth MORE than standard chess
  // =========================================================================
  let whiteUndeveloped = 0;
  let blackUndeveloped = 0;
  
  if (board[MAILBOX_64[57]] === W_KNIGHT) whiteUndeveloped++;
  if (board[MAILBOX_64[62]] === W_KNIGHT) whiteUndeveloped++;
  if (board[MAILBOX_64[58]] === W_BISHOP) whiteUndeveloped++;
  if (board[MAILBOX_64[61]] === W_BISHOP) whiteUndeveloped++;
  if (board[MAILBOX_64[1]] === B_KNIGHT) blackUndeveloped++;
  if (board[MAILBOX_64[6]] === B_KNIGHT) blackUndeveloped++;
  if (board[MAILBOX_64[2]] === B_BISHOP) blackUndeveloped++;
  if (board[MAILBOX_64[5]] === B_BISHOP) blackUndeveloped++;
  
  const whiteDeveloped = 4 - whiteUndeveloped;
  const blackDeveloped = 4 - blackUndeveloped;
  
  // MARSEILLAIS ADJUSTMENT: 60cp per developed piece
  // Developing 2 pieces in a turn = +120cp, beats grabbing pawn (80cp)
  score += whiteDeveloped * 60;
  score -= blackDeveloped * 60;
  
  // =========================================================================
  // PHASE 3: Bishop Pair Bonus (+150cp) - very significant in Marseillais
  // Two bishops can coordinate attacks in a double-move turn (Bc4 Bxf7+)
  // Losing the pair is costly; removing opponent's pair is valuable
  // This strongly encourages: take their bishop (not knight) when given choice
  // =========================================================================
  if (whiteBishops >= 2) score += 150;
  if (blackBishops >= 2) score -= 150;
  
  // =========================================================================
  // PHASE 4: Anti-Trading Piece Count Bonus
  // In Marseillais, more pieces = more double-move threats
  // Each minor/major piece is worth +25cp just for existing (on top of material)
  // This makes even trades bad because you lose the "activity" bonus
  // =========================================================================
  let whitePieceCount = 0;
  let blackPieceCount = 0;
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    if (piece === EMPTY) continue;
    const pieceType = Math.abs(piece);
    // Count knights, bishops, rooks, queens (not pawns or kings)
    if (pieceType >= 2 && pieceType <= 5) {
      if (piece > 0) whitePieceCount++;
      else blackPieceCount++;
    }
  }
  // +25cp per piece - trading pieces loses this bonus for BOTH sides
  // but if you initiate the trade, opponent can recapture and you wasted a turn
  score += whitePieceCount * 25;
  score -= blackPieceCount * 25;
  
  // =========================================================================
  // PHASE 5: King Safety - Aggressive Penalty
  // In double-move chess, pieces near enemy king are VERY dangerous
  // =========================================================================
  const whiteKingAttackers = countKingAttackers(state, state.whiteKingSq, false);
  const blackKingAttackers = countKingAttackers(state, state.blackKingSq, true);
  
  // -30cp per enemy piece near your king
  score -= whiteKingAttackers * 30;
  score += blackKingAttackers * 30;
  
  // =========================================================================
  // PHASE 5b: Pawn Shield - Penalize exposed king diagonals
  // The f-pawn (f2/f7) is critical for protecting the king from Qh5+/Qxf7# attacks
  // In Marseillais, this is EXTREMELY dangerous because opponent can Qh5+ Qxf7#
  // or Bc4 Bxf7+ in a single turn. Penalty must outweigh any pawn capture gain.
  // =========================================================================
  // f2 pawn missing for white (king on e1 or g1) = big penalty
  if (state.whiteKingSq === 95 || state.whiteKingSq === 97) { // e1 or g1
    // Check if f2 pawn is missing (sq64=53 = f2)
    if (board[MAILBOX_64[53]] !== W_PAWN) {
      score -= 150; // Exposed king diagonal - very dangerous in Marseillais
    }
    // Also penalize missing g2 pawn if king is on g1
    if (state.whiteKingSq === 97 && board[MAILBOX_64[54]] !== W_PAWN) {
      score -= 80;
    }
  }
  
  // f7 pawn missing for black (king on e8 or g8) = big penalty  
  if (state.blackKingSq === 25 || state.blackKingSq === 27) { // e8 or g8
    // Check if f7 pawn is missing (sq64=5 = f7)
    if (board[MAILBOX_64[5]] !== B_PAWN) {
      score += 150; // Exposed king diagonal (good for white)
    }
    // Also penalize missing g7 pawn if king is on g8
    if (state.blackKingSq === 27 && board[MAILBOX_64[6]] !== B_PAWN) {
      score += 80;
    }
  }
  
  // =========================================================================
  // PHASE 6: Castling and King Safety (CRITICAL in Marseillais Chess)
  // In double-move chess, king safety is paramount - opponent can attack twice!
  // =========================================================================
  
  // Bonus for still having castling rights (can castle later)
  if (state.castling & 0b1000) score += 40;  // White kingside
  if (state.castling & 0b0100) score += 20;  // White queenside
  if (state.castling & 0b0010) score -= 40;  // Black kingside
  if (state.castling & 0b0001) score -= 20;  // Black queenside
  
  // BIG bonus for having castled - king is safe
  if (state.whiteKingSq === 97) score += 150;  // White castled kingside
  if (state.whiteKingSq === 93) score += 120;  // White castled queenside
  if (state.blackKingSq === 27) score -= 150;  // Black castled kingside
  if (state.blackKingSq === 23) score -= 120;  // Black castled queenside
  
  // HEAVY penalty for king on bad squares (moved without castling)
  // f1/f8 is particularly bad - exposed on open file
  const whiteKingOnF1 = state.whiteKingSq === 96; // f1
  const blackKingOnF8 = state.blackKingSq === 26; // f8
  if (whiteKingOnF1) score -= 200;
  if (blackKingOnF8) score += 200;
  
  // General penalty for king not on starting square or castled position
  const whiteKingBad = state.whiteKingSq !== 95 && state.whiteKingSq !== 97 && state.whiteKingSq !== 93;
  const blackKingBad = state.blackKingSq !== 25 && state.blackKingSq !== 27 && state.blackKingSq !== 23;
  if (whiteKingBad) score -= 120;
  if (blackKingBad) score += 120;
  
  // EXTRA penalty: Lost castling rights while still in opening (undeveloped pieces)
  // This catches the case where king moved and LOST the option to castle
  const whiteLostCastling = (state.castling & 0b1100) === 0; // No white castling rights
  const blackLostCastling = (state.castling & 0b0011) === 0; // No black castling rights
  
  if (whiteLostCastling && !whiteKingBad && state.whiteKingSq === 95) {
    // White is on e1 but can't castle (rooks moved) - mild penalty
    score -= 40;
  }
  if (blackLostCastling && !blackKingBad && state.blackKingSq === 25) {
    // Black is on e8 but can't castle (rooks moved) - mild penalty
    score += 40;
  }
  
  // If still have undeveloped pieces but lost castling, extra penalty
  if (whiteLostCastling && whiteUndeveloped >= 2 && whiteKingBad) {
    score -= 100; // Moved king early while undeveloped = bad
  }
  if (blackLostCastling && blackUndeveloped >= 2 && blackKingBad) {
    score += 100; // Moved king early while undeveloped = bad
  }
  
  // =========================================================================
  // PHASE 7: Center Control (count attacks, not just pawns)
  // =========================================================================
  // Central squares in 64-index: d4=27, e4=28, d5=35, e5=36
  const centerSquares64 = [27, 28, 35, 36];
  let whiteCenterControl = 0;
  let blackCenterControl = 0;
  
  for (const sq64 of centerSquares64) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    // Pawn on center = strong control
    if (piece === W_PAWN) whiteCenterControl += 2;
    else if (piece === B_PAWN) blackCenterControl += 2;
    // Piece on center = some control
    else if (piece > 0) whiteCenterControl += 1;
    else if (piece < 0) blackCenterControl += 1;
  }
  
  score += whiteCenterControl * 15;
  score -= blackCenterControl * 15;
  
  // =========================================================================
  // PHASE 8: Early Queen Penalty
  // =========================================================================
  const whiteQueenSq = findPiece(board, W_QUEEN);
  const blackQueenSq = findPiece(board, B_QUEEN);
  
  if (whiteQueenSq !== -1 && whiteQueenSq !== 59 && whiteUndeveloped >= 2) {
    score -= 50;
  }
  if (blackQueenSq !== -1 && blackQueenSq !== 3 && blackUndeveloped >= 2) {
    score += 50;
  }
  
  // =========================================================================
  // PHASE 9: ANTI-TRADE PENALTY (Critical for Marseillais)
  // If you've traded pieces while still undeveloped, you've wasted tempo
  // Count total minor+major pieces - if below starting count while undeveloped, penalty
  // =========================================================================
  const totalPieces = whitePieceCount + blackPieceCount;
  const startingPieces = 14; // 4 knights + 4 bishops + 4 rooks + 2 queens
  const piecesTradedAway = startingPieces - totalPieces;
  
  // Heavy penalty for trading while undeveloped
  // If black is undeveloped and pieces have been traded, black is doing it wrong
  if (blackUndeveloped >= 2 && piecesTradedAway > 0) {
    score += piecesTradedAway * 40; // +40cp penalty to black per piece traded
  }
  if (whiteUndeveloped >= 2 && piecesTradedAway > 0) {
    score -= piecesTradedAway * 40; // +40cp penalty to white per piece traded
  }
  
  return score;
}

/**
 * Material-only evaluation - ALWAYS from WHITE's perspective
 */
export function evaluateMaterial(state) {
  const board = state.board;
  let score = 0;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    if (piece === EMPTY) continue;
    
    const pieceType = Math.abs(piece);
    score += PIECE_VALUES[pieceType] * (piece > 0 ? 1 : -1);
  }
  
  return score;
}

// ============================================================================
// MOVE ORDERING (MVV-LVA)
// ============================================================================

const MVV_LVA = new Int16Array(49); // 7x7 for victim/attacker combinations

// Initialize MVV-LVA table
for (let victim = 1; victim <= 6; victim++) {
  for (let attacker = 1; attacker <= 6; attacker++) {
    // Higher score = better capture (high value victim by low value attacker)
    MVV_LVA[victim * 7 + attacker] = PIECE_VALUES[victim] * 10 - PIECE_VALUES[attacker];
  }
}

/**
 * Score a move for ordering (higher = search first)
 * Uses SEE to properly order captures: winning > equal > quiet > losing
 */
function scoreMove(state, move, ply, ttMove) {
  // TT move gets highest priority
  if (move === ttMove) {
    return 2000000;
  }
  
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  
  let score = 0;
  
  // Captures: Use SEE to determine if it's winning, equal, or losing
  if (captured !== 0) {
    const seeScore = staticExchangeEval(state, move);
    const attacker = Math.abs(state.board[from]);
    const victim = Math.abs(captured);
    
    if (seeScore > 0) {
      // Winning capture - highest priority (after TT move)
      // Add MVV-LVA for ordering among winning captures
      score = 100000 + MVV_LVA[victim * 7 + attacker];
    } else if (seeScore === 0) {
      // Equal trade - medium priority (below killers)
      // This prevents blind trading when development is better
      score = 60000 + MVV_LVA[victim * 7 + attacker];
    } else {
      // Losing capture - very low priority (below quiet moves)
      // Still use MVV-LVA to order among losing captures
      score = 5000 + MVV_LVA[victim * 7 + attacker];
    }
    return score;
  }
  
  // Promotions (non-capture)
  if (promotion !== 0) {
    score += 90000 + PIECE_VALUES[promotion];
    return score;
  }
  
  // Killer moves - now above equal captures!
  if (ply < MAX_PLY) {
    if (move === killerMoves[ply][0]) {
      return 80000;
    }
    if (move === killerMoves[ply][1]) {
      return 70000;
    }
  }
  
  // History heuristic for quiet moves
  const piece = Math.abs(state.board[from]);
  const to64 = MAILBOX_120[to];
  if (piece > 0 && piece <= 6 && to64 >= 0) {
    score += historyTable[piece][to64];
  }
  
  return score;
}

/**
 * Sort moves by score (highest first)
 */
export function orderMoves(state, moves, ply = 0, ttMove = 0) {
  const scored = moves.map(move => ({ move, score: scoreMove(state, move, ply, ttMove) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.move);
}

/**
 * Calculate a "quiet score" for tiebreaking when full search scores are equal.
 * Penalizes captures (risky) and rewards safe development.
 * Higher = safer/quieter move.
 */
function getQuietScore(state, turn) {
  let score = 100; // Base score
  
  for (const move of turn) {
    const captured = getMoveCaptured(move);
    const from = getMoveFrom(move);
    const to = getMoveTo(move);
    const piece = Math.abs(state.board[from] || state.board[to]);
    const from64 = MAILBOX_120[from];
    const to64 = MAILBOX_120[to];
    const fromRank = from64 >= 0 ? Math.floor(from64 / 8) : -1;
    const toRank = to64 >= 0 ? Math.floor(to64 / 8) : -1;
    const toFile = to64 >= 0 ? to64 % 8 : -1;
    
    // Penalize captures - they often lead to trades/tactics
    if (captured !== 0) {
      score -= 50;
      // Especially penalize piece captures (not pawns)
      if (Math.abs(captured) >= 2) {
        score -= 30;
      }
    }
    
    // Development scoring for knights/bishops
    if (piece === 2 || piece === 3) { // Knight or Bishop
      // Reward moving FROM back rank (development)
      if (fromRank === 0 || fromRank === 7) {
        score += 30; // Developing from back rank is great
      }
      
      // PENALIZE moving TO back rank (retreating is terrible!)
      if (toRank === 0 || toRank === 7) {
        score -= 50; // Retreating to back rank is very bad
      }
    }
    
    // Reward central control
    if (to64 >= 0) {
      // Central squares
      if (toFile >= 2 && toFile <= 5 && toRank >= 2 && toRank <= 5) {
        score += 10;
      }
    }
    
    // Reward central pawn pushes (d4/e4 for White, d5/e5 for Black)
    if (piece === 1) { // Pawn
      const toSq = squareToAlgebraic(to);
      if (toSq === 'd4' || toSq === 'e4' || toSq === 'd5' || toSq === 'e5') {
        score += 40; // Strong bonus for central pawn control
      }
    }
    
    // Reward castling
    if (getMoveFlags(move) === 2) { // FLAG_CASTLE
      score += 40;
    }
    
    // HEAVILY penalize non-castling king moves (loses castling rights!)
    if (piece === 6) { // King
      const flags = getMoveFlags(move);
      if (flags !== 2) { // Not castling
        score -= 80; // Very bad - loses all castling rights
      }
    }
    
    // Penalize moving pieces to edge
    if (to64 >= 0 && piece !== 4) { // Not rook
      if (toFile === 0 || toFile === 7) {
        score -= 10;
      }
    }
  }
  
  return score;
}

// ============================================================================
// SEARCH - MINIMAX WITH ALPHA-BETA FOR DOUBLE-MOVE CHESS
// ============================================================================

const CHECKMATE_SCORE = 100000;
const DRAW_SCORE = 0;

let nodesSearched = 0;

/**
 * Check if the game is over
 * Returns: 'checkmate', 'stalemate', 'draw', or null
 */
export function getGameResult(state, color) {
  const moves = generateLegalMoves(state, color);
  
  if (moves.length === 0) {
    if (isInCheck(state, color)) {
      return 'checkmate';
    }
    return 'stalemate';
  }
  
  // Check for 50-move rule (100 half-moves = 50 full moves)
  if (state.halfMoveClock >= 100) {
    return 'fifty-move';
  }
  
  // Check for threefold repetition
  if (state.positionHistory) {
    const hash = state.getPositionHash();
    const count = state.positionHistory.get(hash) || 0;
    if (count >= 3) {
      return 'repetition';
    }
  }
  
  return null;
}

/**
 * Negamax-style evaluation from the perspective of the given color
 */
function evalForColor(state, color) {
  const whiteScore = evaluate(state);
  return color === WHITE ? whiteScore : -whiteScore;
}

/**
 * Generate only capture moves (for quiescence search)
 */
function generateCaptureMoves(state, color) {
  const moves = [];
  const board = state.board;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    if (piece === EMPTY) continue;
    if (piece * color <= 0) continue; // Not our piece
    
    const pieceType = Math.abs(piece);
    
    switch (pieceType) {
      case W_PAWN:
        generatePawnCaptures(state, sq, color, moves);
        break;
      case W_KNIGHT:
        generatePieceCaptures(state, sq, color, KNIGHT_OFFSETS, false, moves);
        break;
      case W_BISHOP:
        generatePieceCaptures(state, sq, color, BISHOP_OFFSETS, true, moves);
        break;
      case W_ROOK:
        generatePieceCaptures(state, sq, color, ROOK_OFFSETS, true, moves);
        break;
      case W_QUEEN:
        generatePieceCaptures(state, sq, color, QUEEN_OFFSETS, true, moves);
        break;
      case W_KING:
        generatePieceCaptures(state, sq, color, KING_OFFSETS, false, moves);
        break;
    }
  }
  
  return moves;
}

/**
 * Generate pawn captures only (including promotions)
 */
function generatePawnCaptures(state, from, color, moves) {
  const board = state.board;
  const dir = color === WHITE ? -10 : 10;
  const promoRank = color === WHITE ? 2 : 9;
  const fromRank = Math.floor(MAILBOX_120[from] / 8);
  const isPromo = (color === WHITE && fromRank === 1) || (color === BLACK && fromRank === 6);
  
  // Captures
  for (const capDir of [-1, 1]) {
    const capTo = from + dir + capDir;
    const target = board[capTo];
    
    if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
      if (isPromo) {
        moves.push(encodeMove(from, capTo, target, W_QUEEN, 0));
        moves.push(encodeMove(from, capTo, target, W_ROOK, 0));
        moves.push(encodeMove(from, capTo, target, W_BISHOP, 0));
        moves.push(encodeMove(from, capTo, target, W_KNIGHT, 0));
      } else {
        moves.push(encodeMove(from, capTo, target, 0, FLAG_NORMAL));
      }
    }
    
    // En passant
    if (capTo === state.epSquare) {
      const epPawnSq = capTo + (color === WHITE ? 10 : -10);
      const epPawn = board[epPawnSq];
      if (epPawn !== EMPTY && epPawn * color < 0 && Math.abs(epPawn) === W_PAWN) {
        const epCaptured = color === WHITE ? B_PAWN : W_PAWN;
        moves.push(encodeMove(from, capTo, epCaptured, 0, FLAG_EP));
      }
    }
  }
  
  // Promotion pushes (not captures but tactically critical)
  if (isPromo) {
    const pushTo = from + dir;
    if (board[pushTo] === EMPTY) {
      moves.push(encodeMove(from, pushTo, 0, W_QUEEN, 0));
    }
  }
}

/**
 * Generate captures only for non-pawn pieces
 */
function generatePieceCaptures(state, from, color, offsets, sliding, moves) {
  const board = state.board;
  
  for (const offset of offsets) {
    let to = from + offset;
    
    if (sliding) {
      while (board[to] !== OFF_BOARD) {
        const target = board[to];
        if (target !== EMPTY) {
          if (target * color < 0) { // Enemy piece - capture
            moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
          }
          break; // Blocked
        }
        to += offset;
      }
    } else {
      const target = board[to];
      if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
        moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
      }
    }
  }
}

// ============================================================================
// TURN-BASED SEARCH (Simple & Correct for Double-Move Chess)
// ============================================================================

/**
 * Score a first move for ordering/pruning decisions.
 * Used to identify promising first moves that get full second-move expansion.
 */
function scoreFirstMove(state, move) {
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const piece = Math.abs(state.board[from]);
  
  let score = 0;
  
  // Captures - prioritize by SEE
  if (captured !== 0) {
    const seeScore = staticExchangeEval(state, move);
    if (seeScore > 0) {
      score += 10000 + PIECE_VALUES[Math.abs(captured)];
    } else if (seeScore === 0) {
      score += 5000 + PIECE_VALUES[Math.abs(captured)];
    } else {
      score += 1000; // Losing capture still might enable tactics
    }
  }
  
  // Promotions
  if (promotion !== 0) {
    score += 9000 + PIECE_VALUES[promotion];
  }
  
  // Central squares bonus (d4, e4, d5, e5) for pieces
  const to64 = MAILBOX_120[to];
  if (to64 >= 0 && piece >= W_KNIGHT) {
    const rank = Math.floor(to64 / 8);
    const file = to64 % 8;
    if ((rank === 3 || rank === 4) && (file === 3 || file === 4)) {
      score += 200;
    }
  }
  
  // Development bonus - moving minor pieces from back rank
  const from64 = MAILBOX_120[from];
  if (from64 >= 0 && (piece === W_KNIGHT || piece === W_BISHOP)) {
    const fromRank = Math.floor(from64 / 8);
    if (fromRank === 0 || fromRank === 7) {
      score += 150; // Developing from home square
    }
  }
  
  // PST bonus for destination
  if (piece > 0 && piece <= 6 && to64 >= 0) {
    const color = state.board[from] > 0 ? WHITE : BLACK;
    const pstIndex = color === WHITE ? to64 : (7 - Math.floor(to64 / 8)) * 8 + (to64 % 8);
    score += PST[piece][pstIndex] / 2;
  }
  
  // ENABLE-CAPTURE DETECTION: If this move enables a high-value capture on move 2
  // Check what pieces can be captured from the destination square
  // This is critical for double-move tactics like Nc5 Nxa4 winning a rook
  if (captured === 0 && piece >= W_KNIGHT && piece <= W_QUEEN) {
    const board = state.board;
    const color = board[from] > 0 ? WHITE : BLACK;
    let bestCaptureValue = 0;
    
    if (piece === W_KNIGHT) {
      // Check knight's attack squares from destination
      for (const offset of KNIGHT_OFFSETS) {
        const targetSq = to + offset;
        const target = board[targetSq];
        if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
          const targetValue = PIECE_VALUES[Math.abs(target)];
          if (targetValue > bestCaptureValue) {
            bestCaptureValue = targetValue;
          }
        }
      }
    } else if (piece === W_BISHOP) {
      // Check bishop's attack squares from destination
      for (const offset of BISHOP_OFFSETS) {
        let sq = to + offset;
        while (board[sq] !== OFF_BOARD) {
          if (board[sq] !== EMPTY) {
            if (board[sq] * color < 0) {
              const targetValue = PIECE_VALUES[Math.abs(board[sq])];
              if (targetValue > bestCaptureValue) {
                bestCaptureValue = targetValue;
              }
            }
            break;
          }
          sq += offset;
        }
      }
    } else if (piece === W_ROOK) {
      // Check rook's attack squares from destination
      for (const offset of ROOK_OFFSETS) {
        let sq = to + offset;
        while (board[sq] !== OFF_BOARD) {
          if (board[sq] !== EMPTY) {
            if (board[sq] * color < 0) {
              const targetValue = PIECE_VALUES[Math.abs(board[sq])];
              if (targetValue > bestCaptureValue) {
                bestCaptureValue = targetValue;
              }
            }
            break;
          }
          sq += offset;
        }
      }
    } else if (piece === W_QUEEN) {
      // Check queen's attack squares from destination
      for (const offset of QUEEN_OFFSETS) {
        let sq = to + offset;
        while (board[sq] !== OFF_BOARD) {
          if (board[sq] !== EMPTY) {
            if (board[sq] * color < 0) {
              const targetValue = PIECE_VALUES[Math.abs(board[sq])];
              if (targetValue > bestCaptureValue) {
                bestCaptureValue = targetValue;
              }
            }
            break;
          }
          sq += offset;
        }
      }
    }
    
    // Bonus proportional to what can be captured from destination
    // Scale down since this is speculative (capture might be defended)
    if (bestCaptureValue >= PIECE_VALUES[W_ROOK]) {
      // High-value target (rook or queen) - worth exploring
      score += bestCaptureValue / 2;
    } else if (bestCaptureValue >= PIECE_VALUES[W_KNIGHT]) {
      // Minor piece target - smaller bonus
      score += bestCaptureValue / 4;
    }
  }
  
  // PAWN ENABLE-CAPTURE: Check if a pawn push enables a capture on the next move
  // This is key for tactics like b5 bxa4 winning material
  if (captured === 0 && piece === W_PAWN) {
    const board = state.board;
    const color = board[from] > 0 ? WHITE : BLACK;
    const dir = color === WHITE ? -10 : 10;
    let bestCaptureValue = 0;
    
    // Check what the pawn can capture from its destination
    for (const capDir of [-1, 1]) {
      const targetSq = to + dir + capDir;
      const target = board[targetSq];
      if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
        const targetValue = PIECE_VALUES[Math.abs(target)];
        if (targetValue > bestCaptureValue) {
          bestCaptureValue = targetValue;
        }
      }
    }
    
    // Bonus for pawn moves that enable captures
    if (bestCaptureValue >= PIECE_VALUES[W_ROOK]) {
      score += bestCaptureValue / 2;
    } else if (bestCaptureValue >= PIECE_VALUES[W_KNIGHT]) {
      score += bestCaptureValue / 4;
    }
  }
  
  // KING MOVE PENALTY: Heavily penalize king moves that lose castling rights
  if (piece === W_KING) {
    const color = state.board[from] > 0 ? WHITE : BLACK;
    const hasKingsideCastle = color === WHITE ? (state.castling & 0b1000) : (state.castling & 0b0010);
    const hasQueensideCastle = color === WHITE ? (state.castling & 0b0100) : (state.castling & 0b0001);
    
    // Check if this is a castling move (king moves 2 squares)
    const isCastling = Math.abs(to - from) === 2;
    
    if (isCastling) {
      // Castling is great - boost it
      score += 5000;
    } else if (hasKingsideCastle || hasQueensideCastle) {
      // Moving king when can castle = very bad
      score -= 8000;
    } else {
      // Already lost castling but king moves are still usually bad
      score -= 2000;
    }
  }
  
  // ROOK MOVE PENALTY: Penalize rook moves that lose castling rights
  if (piece === W_ROOK) {
    const color = state.board[from] > 0 ? WHITE : BLACK;
    if (color === WHITE) {
      if (from === 98 && (state.castling & 0b1000)) score -= 500; // h1 rook loses kingside
      if (from === 91 && (state.castling & 0b0100)) score -= 300; // a1 rook loses queenside
    } else {
      if (from === 28 && (state.castling & 0b0010)) score -= 500; // h8 rook loses kingside
      if (from === 21 && (state.castling & 0b0001)) score -= 300; // a8 rook loses queenside
    }
  }
  
  return score;
}

/**
 * Generate all legal turns for a color.
 * A turn is [move1, move2] or [move1] if move1 gives check.
 * Returns array of turns, each turn is an array of 1-2 encoded moves.
 * 
 * OPTIMIZATION: Late first moves only get tactical second-move expansion.
 * This skips the expensive generateLegalMoves call for unpromising first moves.
 */
function generateAllTurns(state, color, maxMoves = 2) {
  const turns = [];
  const firstMoves = generateLegalMoves(state, color);
  
  if (maxMoves === 1) {
    // Single-move mode (balanced first turn)
    for (const move1 of firstMoves) {
      turns.push([move1]);
    }
    return turns;
  }
  
  // Score and sort first moves for pruning decisions
  // Top moves get full expansion, rest only get captures as second moves
  const FULL_EXPANSION_LIMIT = 15;
  const TACTICAL_EXPANSION_LIMIT = 25; // Beyond this, only single-move or check turns
  
  const scoredFirst = firstMoves.map(m => ({
    move: m,
    score: scoreFirstMove(state, m)
  }));
  scoredFirst.sort((a, b) => b.score - a.score);
  
  for (let i = 0; i < scoredFirst.length; i++) {
    const move1 = scoredFirst[i].move;
    const undoInfo1 = makeMove(state, move1);
    
    // Check if first move gave check - turn ends
    const gaveCheck = isInCheck(state, -color);
    
    if (gaveCheck) {
      turns.push([move1]);
    } else if (i < FULL_EXPANSION_LIMIT) {
      // Full expansion for top first moves
      const secondMoves = generateLegalMoves(state, color);
      if (secondMoves.length === 0) {
        turns.push([move1]);
      } else {
        for (const move2 of secondMoves) {
          turns.push([move1, move2]);
        }
      }
    } else if (i < TACTICAL_EXPANSION_LIMIT) {
      // FAST tactical expansion: only generate captures (skip full legal gen)
      // Use pseudo-legal captures, then filter for legality
      const captures = generateTacticalMoves(state, color);
      if (captures.length === 0) {
        turns.push([move1]); // Single-move turn as fallback
      } else {
        for (const move2 of captures) {
          turns.push([move1, move2]);
        }
      }
    } else {
      // Very late first moves: just add as single-move turn
      // These are unlikely to be best anyway
      turns.push([move1]);
    }
    
    undoMove(state, move1, undoInfo1);
  }
  
  return turns;
}

/**
 * Generate only tactical moves (captures and promotions) - FAST version.
 * Filters for legality but skips quiet moves entirely.
 */
function generateTacticalMoves(state, color) {
  const moves = [];
  const board = state.board;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const from = MAILBOX_64[sq64];
    const piece = board[from];
    
    if (piece === EMPTY || piece * color <= 0) continue;
    
    const pieceType = Math.abs(piece);
    
    if (pieceType === W_PAWN) {
      // Pawn captures and promotions only
      const dir = color === WHITE ? -10 : 10;
      const promoRank = color === WHITE ? 2 : 9;
      const to = from + dir;
      const isPromo = Math.floor(to / 10) === promoRank;
      
      // Promotion pushes
      if (isPromo && board[to] === EMPTY) {
        moves.push(encodeMove(from, to, 0, W_QUEEN, 0));
      }
      
      // Captures (including promotion captures)
      for (const capDir of [-1, 1]) {
        const capTo = from + dir + capDir;
        const target = board[capTo];
        
        if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
          if (isPromo) {
            moves.push(encodeMove(from, capTo, target, W_QUEEN, 0));
          } else {
            moves.push(encodeMove(from, capTo, target, 0, FLAG_NORMAL));
          }
        }
        
        // En passant
        if (capTo === state.epSquare) {
          const epPawnSq = capTo + (color === WHITE ? 10 : -10);
          const epPawn = board[epPawnSq];
          if (epPawn !== EMPTY && epPawn * color < 0 && Math.abs(epPawn) === W_PAWN) {
            const epCaptured = color === WHITE ? B_PAWN : W_PAWN;
            moves.push(encodeMove(from, capTo, epCaptured, 0, FLAG_EP));
          }
        }
      }
    } else if (pieceType === W_KNIGHT) {
      // Knight captures only
      for (const offset of KNIGHT_OFFSETS) {
        const to = from + offset;
        const target = board[to];
        if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
          moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
        }
      }
    } else if (pieceType === W_KING) {
      // King captures only (no castling in tactical gen)
      for (const offset of KING_OFFSETS) {
        const to = from + offset;
        const target = board[to];
        if (target !== OFF_BOARD && target !== EMPTY && target * color < 0) {
          moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
        }
      }
    } else {
      // Sliding piece captures
      const offsets = pieceType === W_BISHOP ? BISHOP_OFFSETS :
                      pieceType === W_ROOK ? ROOK_OFFSETS : QUEEN_OFFSETS;
      for (const offset of offsets) {
        let to = from + offset;
        while (board[to] !== OFF_BOARD) {
          const target = board[to];
          if (target !== EMPTY) {
            if (target * color < 0) {
              moves.push(encodeMove(from, to, target, 0, FLAG_NORMAL));
            }
            break;
          }
          to += offset;
        }
      }
    }
  }
  
  // Filter for legality
  const legalMoves = [];
  for (const move of moves) {
    const undoInfo = makeMove(state, move);
    if (!isInCheck(state, color)) {
      legalMoves.push(move);
    }
    undoMove(state, move, undoInfo);
  }
  
  return legalMoves;
}

/**
 * Apply a turn (1-2 moves) to the state. Returns undo info.
 */
function applyTurn(state, turn) {
  const undoInfos = [];
  for (const move of turn) {
    undoInfos.push(makeMove(state, move));
  }
  return undoInfos;
}

/**
 * Undo a turn.
 */
function undoTurn(state, turn, undoInfos) {
  for (let i = turn.length - 1; i >= 0; i--) {
    undoMove(state, turn[i], undoInfos[i]);
  }
}

/**
 * Score a turn for ordering. Higher = search first.
 * FAST version - doesn't apply turn, just looks at move properties
 */
function scoreTurn(state, turn) {
  let score = 0;
  
  // Count opponent's bishops to detect bishop pair breaking captures
  const board = state.board;
  let oppBishops = 0;
  const oppColor = -state.sideToMove;
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    if (piece !== EMPTY && Math.abs(piece) === W_BISHOP && piece * oppColor > 0) {
      oppBishops++;
    }
  }
  
  // Score individual moves based on their properties
  for (const move of turn) {
    const captured = getMoveCaptured(move);
    const promotion = getMovePromotion(move);
    const flags = getMoveFlags(move);
    const from = getMoveFrom(move);
    const piece = Math.abs(board[from]);
    
    if (captured !== 0) {
      // Capture - MVV-LVA: prioritize capturing high-value pieces
      score += 1000 + PIECE_VALUES[Math.abs(captured)] * 10;
      
      // BONUS: Capturing a bishop when opponent has 2 bishops breaks their pair!
      // This is worth an extra ~150cp, so add significant bonus
      if (Math.abs(captured) === W_BISHOP && oppBishops >= 2) {
        score += 1500; // High priority - breaks bishop pair
      }
    }
    if (promotion !== 0) {
      score += 800 + PIECE_VALUES[promotion];
    }
    
    // CASTLING: Very strong bonus - castling is almost always good
    if (flags === FLAG_CASTLE) {
      score += 8000; // Very high priority - king safety is critical in Marseillais
    }
    
    // KING MOVES WITHOUT CASTLING: Heavy penalty for losing castling rights
    if (piece === W_KING && flags !== FLAG_CASTLE) {
      const color = board[from] > 0 ? WHITE : BLACK;
      const hasKingsideCastle = color === WHITE ? (state.castling & 0b1000) : (state.castling & 0b0010);
      const hasQueensideCastle = color === WHITE ? (state.castling & 0b0100) : (state.castling & 0b0001);
      if (hasKingsideCastle || hasQueensideCastle) {
        // Moving king when we can still castle = VERY bad, search these turns LAST
        score -= 10000;
      } else {
        // Already lost castling, but moving king is still usually bad
        score -= 3000;
      }
    }
    
    // ROOK MOVES that lose castling rights - also penalize
    if (piece === W_ROOK) {
      const color = board[from] > 0 ? WHITE : BLACK;
      // Check if this rook is on its original square
      if (color === WHITE) {
        if (from === 98 && (state.castling & 0b1000)) score -= 1000; // h1 rook, has kingside
        if (from === 91 && (state.castling & 0b0100)) score -= 500;  // a1 rook, has queenside
      } else {
        if (from === 28 && (state.castling & 0b0010)) score -= 1000; // h8 rook, has kingside
        if (from === 21 && (state.castling & 0b0001)) score -= 500;  // a8 rook, has queenside
      }
    }
    
    // Bonus for checks (first move giving check ends turn, so it's move1)
    if (turn.length === 1 && flags !== FLAG_CASTLE) {
      // Single-move turn might be a check
      score += 500;
    }
  }
  
  return score;
}

/**
 * Order turns by score (best first for alpha-beta efficiency)
 */
function orderTurns(state, turns) {
  const scored = turns.map(turn => ({ turn, score: scoreTurn(state, turn) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.turn);
}

// Simple transposition table - caches search results
const TT_SIZE = 65536; // 64K entries
const ttable = new Map();

// TT entry flags - must track bound type for correct alpha-beta
const TT_FLAG_EXACT = 0;  // True minimax value
const TT_FLAG_ALPHA = 1;  // Upper bound (all moves failed low)
const TT_FLAG_BETA = 2;   // Lower bound (cutoff occurred)

function ttProbe(hash, depth, alpha, beta) {
  const entry = ttable.get(hash);
  if (entry && entry.depth >= depth) {
    const score = entry.score;
    const flag = entry.flag;
    
    // Only return exact scores directly
    if (flag === TT_FLAG_EXACT) {
      return score;
    }
    // Lower bound: can cause beta cutoff if score >= beta
    if (flag === TT_FLAG_BETA && score >= beta) {
      return score;
    }
    // Upper bound: can cause alpha cutoff if score <= alpha
    if (flag === TT_FLAG_ALPHA && score <= alpha) {
      return score;
    }
  }
  return null;
}

function ttStore(hash, depth, score, flag) {
  // Simple replacement: always replace (or keep deeper)
  const existing = ttable.get(hash);
  if (!existing || existing.depth <= depth) {
    if (ttable.size >= TT_SIZE) {
      // Clear half the table when full (simple strategy)
      const keys = Array.from(ttable.keys()).slice(0, TT_SIZE / 2);
      for (const k of keys) ttable.delete(k);
    }
    ttable.set(hash, { depth, score, flag });
  }
}

// ============================================================================
// HANGING PIECE DETECTION - Fast tactical awareness without full quiescence
// ============================================================================

/**
 * Detect hanging pieces and return a penalty.
 * A piece is "hanging" if:
 * 1. It's attacked and not defended
 * 2. It's attacked by a less valuable piece (bad trade)
 * 3. It CAN BE attacked by a pawn advance + capture (Marseillais key tactic!)
 * 
 * In double-move chess, the opponent can advance a pawn AND capture in one turn,
 * so pieces that are "one pawn push away" from being captured are in danger.
 */
function getHangingPiecePenalty(state, color) {
  const board = state.board;
  const opponent = -color;
  let penalty = 0;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    if (piece === EMPTY) continue;
    if (piece * color <= 0) continue; // Not our piece
    
    const pieceType = Math.abs(piece);
    if (pieceType === W_KING) continue; // Don't count king
    
    // Check if this piece is attacked by opponent
    if (isSquareAttacked(state, sq, opponent)) {
      // Check if it's defended by us
      const isDefended = isSquareAttacked(state, sq, color);
      
      if (!isDefended) {
        // Undefended and attacked = hanging!
        penalty += PIECE_VALUES[pieceType];
      } else {
        // Defended but attacked - check for unfavorable trades
        const pawnDir = opponent === WHITE ? -10 : 10;
        const oppPawn = opponent === WHITE ? W_PAWN : B_PAWN;
        if (pieceType > W_PAWN && 
            (board[sq + pawnDir - 1] === oppPawn || board[sq + pawnDir + 1] === oppPawn)) {
          penalty += PIECE_VALUES[pieceType] - PIECE_VALUES[W_PAWN];
        }
      }
    }
    
    // MARSEILLAIS SPECIAL: Check if piece can be captured by pawn advance + capture
    // This is the key tactic - opponent plays pawn push, then pawn captures
    // Example: Knight on f6, pawn on e4 -> e5 exf6 wins the knight
    // Example: Knight on c6, pawn on d4 -> d5 dxc6 wins the knight
    if (pieceType >= W_KNIGHT) { // Only check for pieces, not pawns
      const pawnAdvanceDir = opponent === WHITE ? -10 : 10; // Direction pawns move
      const pawnStartDir = opponent === WHITE ? 10 : -10;   // Where pawn comes from
      const oppPawn = opponent === WHITE ? W_PAWN : B_PAWN;
      
      // Check both diagonal attack squares
      for (const sideDir of [-1, 1]) {
        const attackFromSq = sq + pawnAdvanceDir + sideDir; // Square pawn attacks from
        const pawnCurrentSq = attackFromSq + pawnStartDir;  // Where pawn is now
        
        // Is there an opponent pawn that can advance to attack us?
        if (board[pawnCurrentSq] === oppPawn && board[attackFromSq] === EMPTY) {
          // Pawn can advance and then capture us!
          // Check if we'd be defended after the pawn advances
          // (Simplified: assume we're not defended from this new angle)
          const isDefended = isSquareAttacked(state, sq, color);
          if (!isDefended) {
            // Completely undefended - full piece value at risk
            penalty += PIECE_VALUES[pieceType];
          } else {
            // Defended, but pawn trade is still bad for us
            penalty += PIECE_VALUES[pieceType] - PIECE_VALUES[W_PAWN];
          }
          break; // Don't double-count
        }
        
        // Also check 2-square pawn advance from starting rank
        const pawnDoubleStartSq = pawnCurrentSq + pawnStartDir;
        const pawnStartRank = opponent === WHITE ? 6 : 1; // Rank 2 or 7 (0-indexed)
        const pawnDoubleRank = Math.floor(MAILBOX_120[pawnDoubleStartSq] / 8);
        
        if (pawnDoubleRank === pawnStartRank && 
            board[pawnDoubleStartSq] === oppPawn && 
            board[pawnCurrentSq] === EMPTY &&
            board[attackFromSq] === EMPTY) {
          // Pawn can double-advance and then capture!
          const isDefended = isSquareAttacked(state, sq, color);
          if (!isDefended) {
            penalty += PIECE_VALUES[pieceType];
          } else {
            penalty += PIECE_VALUES[pieceType] - PIECE_VALUES[W_PAWN];
          }
          break;
        }
      }
    }
  }
  
  return penalty;
}

/**
 * Evaluation with hanging piece detection.
 * This replaces quiescence search with a fast static analysis.
 */
function evalWithHanging(state, color) {
  const baseEval = evalForColor(state, color);
  
  // Penalize our hanging pieces
  const ourHanging = getHangingPiecePenalty(state, color);
  
  // Bonus for opponent's hanging pieces (we can capture them)
  const theirHanging = getHangingPiecePenalty(state, -color);
  
  // In double-move chess, hanging pieces are VERY bad because
  // opponent can attack+capture in one turn. Apply 80% of the penalty.
  let score = baseEval - Math.floor(ourHanging * 0.8) + Math.floor(theirHanging * 0.8);
  
  // Apply 50-move rule adjustment if approaching draw
  score += get50MoveAdjustment(state, color, score);
  
  return score;
}

/**
 * Check if the current position is a draw by repetition or 50-move rule.
 * Returns true if it's a draw, false otherwise.
 */
function isDrawPosition(state) {
  // 50-move rule: 100 half-moves without pawn move or capture
  if (state.halfMoveClock >= 100) {
    return true;
  }
  
  // Threefold repetition
  if (state.positionHistory) {
    const hash = state.getPositionHash();
    const count = state.positionHistory.get(hash) || 0;
    if (count >= 3) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if a position would be a draw after applying a turn.
 * Returns the repetition count (3 = immediate draw).
 */
function getRepetitionCount(state) {
  if (!state.positionHistory) return 0;
  const hash = state.getPositionHash();
  return state.positionHistory.get(hash) || 0;
}

/**
 * Get draw score with contempt based on current evaluation.
 * If we're winning, draws are bad (negative score).
 * If we're losing, draws are good (positive score).
 * This makes the engine avoid draws when ahead and seek them when behind.
 */
function getDrawScore(state, color) {
  // Get a quick material evaluation to determine if we're winning or losing
  const materialEval = evalForColor(state, color);
  
  // Contempt factor: how much we "dislike" draws
  // Positive materialEval = we're winning, so draw is bad (return negative)
  // Negative materialEval = we're losing, so draw is good (return positive)
  const CONTEMPT = 50; // Base contempt value
  
  if (materialEval > 150) {
    // We're clearly winning - avoid draws strongly
    return -CONTEMPT - Math.min(materialEval / 10, 200);
  } else if (materialEval < -150) {
    // We're clearly losing - seek draws
    return CONTEMPT + Math.min(-materialEval / 10, 200);
  } else {
    // Position is roughly equal - slight preference against draws (play for a win)
    return -CONTEMPT / 2;
  }
}

/**
 * Get a score adjustment based on proximity to 50-move draw.
 * When approaching 50 moves, adjust evaluation towards draw score.
 */
function get50MoveAdjustment(state, color, currentEval) {
  const movesLeft = 100 - state.halfMoveClock;
  
  if (movesLeft > 20) {
    // Plenty of time, no adjustment
    return 0;
  }
  
  // Calculate draw score
  const drawScore = getDrawScore(state, color);
  
  if (movesLeft <= 5) {
    // Very close to 50-move draw - blend heavily towards draw score
    return Math.floor((drawScore - currentEval) * 0.7);
  } else if (movesLeft <= 10) {
    // Getting close - moderate blend
    return Math.floor((drawScore - currentEval) * 0.4);
  } else {
    // 10-20 moves left - slight adjustment
    return Math.floor((drawScore - currentEval) * 0.2);
  }
}

/**
 * Simple negamax search on TURNS (not moves).
 * This is correct for double-move chess because we search atomic turns.
 */
function searchTurns(state, depth, alpha, beta, color) {
  nodesSearched++;
  
  // Check for draws BEFORE evaluating position
  if (isDrawPosition(state)) {
    return getDrawScore(state, color);
  }
  
  // Leaf node - use hanging piece detection for tactical awareness
  if (depth <= 0) {
    return evalWithHanging(state, color);
  }
  
  // Save original alpha for TT flag determination
  const origAlpha = alpha;
  
  // Check transposition table
  const hash = state.zobristHash;
  const ttScore = ttProbe(hash, depth, alpha, beta);
  if (ttScore !== null) {
    return ttScore;
  }
  
  // Generate all turns
  const turns = generateAllTurns(state, color);
  
  // No moves = terminal
  if (turns.length === 0) {
    if (isInCheck(state, color)) {
      return -CHECKMATE_SCORE;
    }
    return getDrawScore(state, color); // Stalemate - use draw score with contempt
  }
  
  // Order turns for better pruning - ALWAYS order at depth 1 to find captures first
  const orderedTurns = turns.length > 8 ? orderTurns(state, turns) : turns;
  
  let bestScore = -Infinity;
  
  for (const turn of orderedTurns) {
    const undoInfos = applyTurn(state, turn);
    
    // Check for repetition after this turn
    const repCount = getRepetitionCount(state);
    let score;
    
    if (repCount >= 3) {
      // This turn leads to immediate draw by repetition
      score = -getDrawScore(state, -color);
    } else if (repCount === 2) {
      // This is the 2nd occurrence - opponent could force draw on next move
      // Apply a penalty/bonus depending on position
      score = -searchTurns(state, depth - 1, -beta, -alpha, -color);
      // Adjust score towards draw if opponent is losing (they'll take the draw)
      const oppEval = evalForColor(state, -color);
      if (oppEval < -100) {
        // Opponent is losing, they might repeat for a draw
        score = Math.max(score, -getDrawScore(state, -color));
      }
    } else {
      // Normal search
      score = -searchTurns(state, depth - 1, -beta, -alpha, -color);
    }
    
    undoTurn(state, turn, undoInfos);
    
    if (score > bestScore) {
      bestScore = score;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      break; // Alpha-beta cutoff
    }
  }
  
  // Determine TT flag based on what happened
  let ttFlag;
  if (bestScore <= origAlpha) {
    ttFlag = TT_FLAG_ALPHA;  // Failed low - upper bound
  } else if (bestScore >= beta) {
    ttFlag = TT_FLAG_BETA;   // Failed high - lower bound
  } else {
    ttFlag = TT_FLAG_EXACT;  // True minimax value
  }
  
  // Store in transposition table
  ttStore(hash, depth, bestScore, ttFlag);
  
  return bestScore;
}

/**
 * Find the best turn for the current position.
 * Uses iterative deepening for better move ordering.
 * Considers draws by repetition and 50-move rule.
 */
export function findBestTurn(state, depth = 2, color = undefined, maxMoves = 2) {
  nodesSearched = 0;
  const startTime = Date.now();
  
  if (color === undefined) {
    color = state.sideToMove;
  }
  
  // Check if we're already in a drawn position
  if (isDrawPosition(state)) {
    log('[Engine] Position is already drawn');
    // Still need to make a move, but any legal move will do
  }
  
  const turns = generateAllTurns(state, color, maxMoves);
  if (turns.length === 0) {
    return null;
  }
  
  // Order turns for better alpha-beta pruning
  const orderedTurns = turns.length > 8 ? orderTurns(state, turns) : turns;
  
  let bestTurn = orderedTurns[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  
  // Track if we should prefer/avoid draws based on our position
  const ourEval = evalForColor(state, color);
  const preferDraw = ourEval < -200; // We're losing, prefer draws
  const avoidDraw = ourEval > 200;   // We're winning, avoid draws
  
  for (const turn of orderedTurns) {
    const undoInfos = applyTurn(state, turn);
    
    // Check if this turn causes a draw
    const repCount = getRepetitionCount(state);
    let score;
    
    if (repCount >= 3) {
      // This turn leads to immediate draw by repetition
      score = getDrawScore(state, color);
      log(`[Engine] Turn ${turnToString(state, turn)} causes repetition draw, score=${score}`);
    } else {
      // Search opponent's response
      score = -searchTurns(state, depth - 1, -beta, -alpha, -color);
      
      // If this is the 2nd repetition, adjust score based on whether we want draws
      if (repCount === 2) {
        if (preferDraw) {
          // We're losing - this turn could lead to a draw, which is good
          score = Math.max(score, getDrawScore(state, color));
        } else if (avoidDraw) {
          // We're winning - penalize moves that could lead to draws
          score = Math.min(score, score - 50);
        }
      }
    }
    
    undoTurn(state, turn, undoInfos);
    
    if (score > bestScore) {
      bestScore = score;
      bestTurn = turn;
    }
    if (score > alpha) {
      alpha = score;
    }
  }
  
  const elapsed = Date.now() - startTime;
  log(`[Engine] Search: depth=${depth} nodes=${nodesSearched} time=${elapsed}ms score=${bestScore}`);
  
  return bestTurn;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert mailbox square to algebraic notation
 */
export function squareToAlgebraic(sq) {
  const sq64 = MAILBOX_120[sq];
  if (sq64 < 0) return null;
  
  const file = String.fromCharCode(97 + (sq64 % 8));
  const rank = 8 - Math.floor(sq64 / 8);
  return file + rank;
}

/**
 * Convert algebraic notation to mailbox square
 */
export function algebraicToSquare(alg) {
  const file = alg.charCodeAt(0) - 97;
  const rank = 8 - parseInt(alg[1]);
  return MAILBOX_64[rank * 8 + file];
}

/**
 * Convert move to SAN-like format
 */
export function moveToSan(state, move) {
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  const flags = getMoveFlags(move);
  const piece = state.board[from];
  const pieceType = Math.abs(piece);
  
  // Castling
  if (flags === FLAG_CASTLE) {
    return to === 97 || to === 27 ? 'O-O' : 'O-O-O';
  }
  
  const pieces = ['', '', 'N', 'B', 'R', 'Q', 'K'];
  const toAlg = squareToAlgebraic(to);
  const fromAlg = squareToAlgebraic(from);
  
  let san = '';
  
  if (pieceType === W_PAWN) {
    if (captured !== 0) {
      san = fromAlg[0] + 'x' + toAlg;
    } else {
      san = toAlg;
    }
    if (promotion !== 0) {
      san += '=' + pieces[promotion];
    }
  } else {
    san = pieces[pieceType];
    if (captured !== 0) {
      san += 'x';
    }
    san += toAlg;
  }
  
  return san;
}

/**
 * Convert a turn (array of moves) to readable format
 */
export function turnToString(state, turn) {
  if (!turn) return 'null';
  
  const clone = state.clone();
  const sans = [];
  
  for (const move of turn) {
    sans.push(moveToSan(clone, move));
    makeMove(clone, move);
  }
  
  return sans.join(' ');
}

/**
 * Clear all search tables (call when starting a new game)
 */
export function clearSearchTables() {
  ttable.clear();
  nodesSearched = 0;
}
