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

// Engine loaded

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
const PIECE_VALUES = new Int16Array([0, 100, 320, 330, 500, 900, 20000]);

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

// Use BigInt for 64-bit random numbers (better hash distribution)
function randomBigInt() {
  // Generate 64-bit random number using two 32-bit randoms
  const high = Math.floor(Math.random() * 0xFFFFFFFF);
  const low = Math.floor(Math.random() * 0xFFFFFFFF);
  return BigInt(high) << 32n | BigInt(low);
}

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
// TRANSPOSITION TABLE
// ============================================================================

const TT_EXACT = 0;
const TT_ALPHA = 1; // Upper bound (failed low)
const TT_BETA = 2;  // Lower bound (failed high)

class TranspositionTable {
  constructor(sizeMB = 64) {
    // Each entry: ~40 bytes (hash, depth, score, flag, bestMove)
    this.size = Math.floor((sizeMB * 1024 * 1024) / 40);
    this.entries = new Map();
    this.hits = 0;
    this.misses = 0;
  }
  
  clear() {
    this.entries.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  // Use only lower 48 bits as key to save memory
  keyFor(hash) {
    return hash & 0xFFFFFFFFFFFFn;
  }
  
  store(hash, depth, score, flag, bestMove) {
    const key = this.keyFor(hash);
    const existing = this.entries.get(key);
    
    // Replace if: no entry, or deeper search, or same depth with exact score
    if (!existing || depth >= existing.depth || (depth === existing.depth && flag === TT_EXACT)) {
      this.entries.set(key, { hash, depth, score, flag, bestMove });
      
      // Limit size by removing oldest entries if too large
      if (this.entries.size > this.size) {
        const firstKey = this.entries.keys().next().value;
        this.entries.delete(firstKey);
      }
    }
  }
  
  probe(hash, depth, alpha, beta) {
    const key = this.keyFor(hash);
    const entry = this.entries.get(key);
    
    if (!entry || entry.hash !== hash) {
      this.misses++;
      return null;
    }
    
    this.hits++;
    
    // Return best move even if depth is insufficient
    const result = { bestMove: entry.bestMove, score: null };
    
    // Only use score if depth is sufficient
    if (entry.depth >= depth) {
      if (entry.flag === TT_EXACT) {
        result.score = entry.score;
      } else if (entry.flag === TT_ALPHA && entry.score <= alpha) {
        result.score = entry.score;
      } else if (entry.flag === TT_BETA && entry.score >= beta) {
        result.score = entry.score;
      }
    }
    
    return result;
  }
  
  getBestMove(hash) {
    const key = this.keyFor(hash);
    const entry = this.entries.get(key);
    return (entry && entry.hash === hash) ? entry.bestMove : null;
  }
}

// Global transposition table
const tt = new TranspositionTable(64);

// ============================================================================
// KILLER MOVES
// ============================================================================

// Store 2 killer moves per ply (moves that caused beta cutoffs)
const MAX_PLY = 64;
const killerMoves = [];
for (let i = 0; i < MAX_PLY; i++) {
  killerMoves[i] = [0, 0];
}

function clearKillers() {
  for (let i = 0; i < MAX_PLY; i++) {
    killerMoves[i][0] = 0;
    killerMoves[i][1] = 0;
  }
}

function storeKiller(ply, move) {
  if (ply >= MAX_PLY) return;
  // Don't store captures as killers
  if (getMoveCaptured(move) !== 0) return;
  
  // Shift killers
  if (killerMoves[ply][0] !== move) {
    killerMoves[ply][1] = killerMoves[ply][0];
    killerMoves[ply][0] = move;
  }
}

// ============================================================================
// HISTORY HEURISTIC
// ============================================================================

// History table: [piece][toSquare] - indexed by piece type (1-6) and target square (0-63)
const historyTable = [];
for (let p = 0; p < 7; p++) {
  historyTable[p] = new Int32Array(64);
}

function clearHistory() {
  for (let p = 0; p < 7; p++) {
    historyTable[p].fill(0);
  }
}

function updateHistory(state, move, depth) {
  const from = getMoveFrom(move);
  const to = getMoveTo(move);
  const piece = Math.abs(state.board[from]);
  const to64 = MAILBOX_120[to];
  
  if (piece > 0 && piece <= 6 && to64 >= 0) {
    // Increase history score (with aging to prevent overflow)
    historyTable[piece][to64] += depth * depth;
    if (historyTable[piece][to64] > 1000000) {
      // Age all history scores
      for (let p = 1; p < 7; p++) {
        for (let sq = 0; sq < 64; sq++) {
          historyTable[p][sq] = Math.floor(historyTable[p][sq] / 2);
        }
      }
    }
  }
}

// ============================================================================
// PIECE-SQUARE TABLES (from white's perspective, index 0-63)
// ============================================================================

const PST_PAWN = new Int16Array([
   0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
   5,  5, 10, 25, 25, 10,  5,  5,
   0,  0,  0, 20, 20,  0,  0,  0,
   5, -5,-10,  0,  0,-10, -5,  5,
   5, 10, 10,-20,-20, 10, 10,  5,
   0,  0,  0,  0,  0,  0,  0,  0,
]);

const PST_KNIGHT = new Int16Array([
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50,
]);

const PST_BISHOP = new Int16Array([
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20,
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
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
   -5,  0,  5,  5,  5,  5,  0, -5,
    0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20,
]);

const PST_KING = new Int16Array([
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
   20, 20,  0,  0,  0,  0, 20, 20,
   20, 30, 10,  0,  0, 10, 30, 20,
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
    
    // DEBUG_OPT: Verify hash is non-zero
    if (DEBUG_OPT) console.log('[DEBUG_OPT] Initial Zobrist hash:', this.zobristHash.toString(16));
    
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
    
    // DEBUG_OPT: Log loaded position hash
    if (DEBUG_OPT) console.log('[DEBUG_OPT] loadFen Zobrist hash:', this.zobristHash.toString(16), 'side:', this.sideToMove === WHITE ? 'white' : 'black');
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

export function decodeMove(move) {
  return {
    from: move & 0x7F,
    to: (move >> 7) & 0x7F,
    captured: ((move >> 14) & 0xF) - 6,
    promotion: (move >> 18) & 0xF,
    flags: (move >> 22) & 0x3,
  };
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
 * Static evaluation - ALWAYS from WHITE's perspective
 * Positive = good for WHITE, Negative = good for BLACK
 */
export function evaluate(state) {
  const board = state.board;
  let score = 0;
  
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    
    if (piece === EMPTY) continue;
    
    const pieceType = Math.abs(piece);
    const color = piece > 0 ? WHITE : BLACK;
    
    // Material
    let pieceScore = PIECE_VALUES[pieceType];
    
    // PST (flip index for black)
    const pstIndex = color === WHITE ? sq64 : (7 - Math.floor(sq64 / 8)) * 8 + (sq64 % 8);
    pieceScore += PST[pieceType][pstIndex];
    
    // White pieces add to score, black pieces subtract
    score += pieceScore * color;
  }
  
  // Bonus for castling rights (king safety potential)
  // Significantly increased to discourage losing castling rights
  if (state.castling & 0b1000) score += 50; // White kingside
  if (state.castling & 0b0100) score += 25; // White queenside
  if (state.castling & 0b0010) score -= 50; // Black kingside (subtract because Black is negative)
  if (state.castling & 0b0001) score -= 25; // Black queenside
  
  // HEAVY penalty for king that moved without castling
  // King on starting square (95 for white, 25 for black) or castled squares is fine
  // White castled positions: 97 (g1 kingside), 93 (c1 queenside)
  // Black castled positions: 27 (g8 kingside), 23 (c8 queenside)
  const whiteKingBad = state.whiteKingSq !== 95 && state.whiteKingSq !== 97 && state.whiteKingSq !== 93;
  const blackKingBad = state.blackKingSq !== 25 && state.blackKingSq !== 27 && state.blackKingSq !== 23;
  
  if (whiteKingBad) score -= 120; // White king moved without castling - very bad
  if (blackKingBad) score += 120; // Black king moved without castling - very bad for black
  
  // Bonus for central pawn control (d4/e4 for White, d5/e5 for Black)
  // This encourages pawn-first development rather than knight-first
  // Strong bonus because controlling the center is crucial in double-move chess
  const d4 = board[MAILBOX_64[27]]; // d4 square
  const e4 = board[MAILBOX_64[28]]; // e4 square  
  const d5 = board[MAILBOX_64[35]]; // d5 square
  const e5 = board[MAILBOX_64[36]]; // e5 square
  
  if (d4 === W_PAWN) score += 40; // White pawn on d4
  if (e4 === W_PAWN) score += 40; // White pawn on e4
  if (d5 === B_PAWN) score -= 40; // Black pawn on d5
  if (e5 === B_PAWN) score -= 40; // Black pawn on e5
  
  // Penalize exposed knights - knights on c3/f3 (White) or c6/f6 (Black) 
  // that CAN be attacked by enemy d/e pawns (pawns on d5/e5, not d7/e7!)
  // This discourages double-knight development without pawn support
  const c3 = board[MAILBOX_64[42]]; // c3 square
  const f3 = board[MAILBOX_64[45]]; // f3 square
  const c6 = board[MAILBOX_64[18]]; // c6 square
  const f6 = board[MAILBOX_64[21]]; // f6 square
  const d5pawn = board[MAILBOX_64[35]]; // d5 pawn (can attack c6/e6)
  const e5pawn = board[MAILBOX_64[36]]; // e5 pawn (can attack d6/f6)
  const d4pawn = board[MAILBOX_64[27]]; // d4 pawn (can attack c3/e3)
  const e4pawn = board[MAILBOX_64[28]]; // e4 pawn (can attack d3/f3)
  
  // Count exposed knights (actually under attack by pawns)
  let whiteExposed = 0;
  let blackExposed = 0;
  
  if (c3 === W_KNIGHT && d4pawn === B_PAWN) whiteExposed++;
  if (f3 === W_KNIGHT && e4pawn === B_PAWN) whiteExposed++;
  if (c6 === B_KNIGHT && d5pawn === W_PAWN) blackExposed++;
  if (f6 === B_KNIGHT && e5pawn === W_PAWN) blackExposed++;
  
  // Penalize having exposed knights (worse if both are exposed)
  if (whiteExposed === 1) score -= 20;
  if (whiteExposed === 2) score -= 60; // Much worse when BOTH knights exposed
  if (blackExposed === 1) score += 20;
  if (blackExposed === 2) score += 60;
  
  // Penalize minor pieces (knights/bishops) that can be attacked by enemy pawn pushes
  // This prevents tactical blunders like Nf5 when g4 gxf5 wins the knight
  // Check each minor piece and see if an enemy pawn can push to attack it
  for (let sq64 = 0; sq64 < 64; sq64++) {
    const sq = MAILBOX_64[sq64];
    const piece = board[sq];
    if (piece === EMPTY) continue;
    
    const pieceType = Math.abs(piece);
    if (pieceType !== W_KNIGHT && pieceType !== W_BISHOP) continue;
    
    const pieceColor = piece > 0 ? WHITE : BLACK;
    const rank = Math.floor(sq64 / 8);
    const file = sq64 % 8;
    
    // Check if enemy pawns can push to attack this piece
    if (pieceColor === WHITE) {
      // White piece - check if black pawns can attack it
      // Black pawns attack diagonally downward (from black's perspective, upward on board)
      // A black pawn on rank-2, file-1 or file+1 can push to attack
      if (rank >= 2 && rank <= 5) { // Piece in vulnerable area
        // Check left diagonal - pawn would be at (rank-2, file-1) and push to (rank-1, file-1)
        if (file > 0) {
          const pawnSq = MAILBOX_64[(rank - 2) * 8 + (file - 1)];
          if (board[pawnSq] === B_PAWN) {
            // Check path is clear for pawn push
            const pushSq = MAILBOX_64[(rank - 1) * 8 + (file - 1)];
            if (board[pushSq] === EMPTY) {
              score -= 60; // Significant penalty - piece can be attacked by pawn push
            }
          }
        }
        // Check right diagonal
        if (file < 7) {
          const pawnSq = MAILBOX_64[(rank - 2) * 8 + (file + 1)];
          if (board[pawnSq] === B_PAWN) {
            const pushSq = MAILBOX_64[(rank - 1) * 8 + (file + 1)];
            if (board[pushSq] === EMPTY) {
              score -= 60;
            }
          }
        }
      }
    } else {
      // Black piece - check if white pawns can attack it
      // White pawns attack diagonally upward
      if (rank >= 2 && rank <= 5) { // Piece in vulnerable area
        // Check left diagonal - pawn would be at (rank+2, file-1) and push to (rank+1, file-1)
        if (file > 0) {
          const pawnSq = MAILBOX_64[(rank + 2) * 8 + (file - 1)];
          if (board[pawnSq] === W_PAWN) {
            const pushSq = MAILBOX_64[(rank + 1) * 8 + (file - 1)];
            if (board[pushSq] === EMPTY) {
              score += 60; // Positive = bad for black
            }
          }
        }
        // Check right diagonal
        if (file < 7) {
          const pawnSq = MAILBOX_64[(rank + 2) * 8 + (file + 1)];
          if (board[pawnSq] === W_PAWN) {
            const pushSq = MAILBOX_64[(rank + 1) * 8 + (file + 1)];
            if (board[pushSq] === EMPTY) {
              score += 60;
            }
          }
        }
      }
    }
  }
  
  // Always return from WHITE's perspective
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
  
  // Captures: MVV-LVA scoring
  if (captured !== 0) {
    const attacker = Math.abs(state.board[from]);
    const victim = Math.abs(captured);
    score += 100000 + MVV_LVA[victim * 7 + attacker];
    return score;
  }
  
  // Promotions
  if (promotion !== 0) {
    score += 90000 + PIECE_VALUES[promotion];
    return score;
  }
  
  // Killer moves
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
let ttHits = 0;
let ttCutoffs = 0; // DEBUG_OPT: track TT cutoffs
let betaCutoffs = 0; // DEBUG_OPT: track beta cutoffs
let rootColor = WHITE; // The color we're searching for at the root

// DEBUG_OPT: Logging control
const DEBUG_OPT = false; // Set to true to enable optimization debugging

// LMR reduction table
const LMR_TABLE = [];
for (let d = 0; d < 64; d++) {
  LMR_TABLE[d] = [];
  for (let m = 0; m < 64; m++) {
    if (d === 0 || m === 0) {
      LMR_TABLE[d][m] = 0;
    } else {
      LMR_TABLE[d][m] = Math.floor(0.5 + Math.log(d) * Math.log(m) / 2.5);
    }
  }
}

// Late Move Pruning (LMP) limits - how many quiet moves to search at each depth
// At very low depths, prune late quiet moves completely
// More aggressive for double-move chess due to high branching factor
const LMP_LIMITS = [0, 3, 6, 10, 16, 24, 36, 50]; // moves allowed at depth 0-7+

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
 * Search a double-move turn using negamax with TT and LMR
 * Returns score from the perspective of 'color'
 * Positive = good for color, negative = bad for color
 */
function searchDoubleTurn(state, depth, alpha, beta, color, ply = 0) {
  nodesSearched++;
  
  const alphaOrig = alpha;
  
  // Transposition table probe
  const ttProbe = tt.probe(state.zobristHash, depth, alpha, beta);
  let ttMove = 0;
  if (ttProbe) {
    ttMove = ttProbe.bestMove || 0;
    if (ttProbe.score !== null) {
      ttHits++;
      ttCutoffs++; // DEBUG_OPT
      return ttProbe.score;
    }
  }
  
  // Terminal conditions
  const result = getGameResult(state, color);
  if (result === 'checkmate') {
    return -CHECKMATE_SCORE + ply;
  }
  if (result === 'stalemate' || result === 'fifty-move' || result === 'repetition') {
    return DRAW_SCORE;
  }
  
  if (depth <= 0) {
    return evalForColor(state, color);
  }
  
  // Null Move Pruning: Skip our turn and see if we're still good
  // Only do this when not in check and at sufficient depth
  const inCheck = isInCheck(state, color);
  if (!inCheck && depth >= 2 && beta < CHECKMATE_SCORE - 100) {
    // "Pass" our turn - let opponent move
    // Use a reduced depth search
    const nullDepth = Math.max(0, depth - 2 - Math.floor(depth / 4)); // Adaptive reduction
    const nullScore = -searchDoubleTurn(state, nullDepth, -beta, -beta + 1, -color, ply + 1);
    
    if (nullScore >= beta) {
      // Position is so good that even skipping our turn beats beta
      betaCutoffs++; // DEBUG_OPT
      return beta; // Fail-hard beta cutoff
    }
  }
  
  // Static eval for futility pruning
  const staticEval = evalForColor(state, color);
  
  // Reverse Futility Pruning (Static Null Move Pruning)
  // If static eval already beats beta by a margin, return early
  const RFP_MARGIN = [0, 100, 200, 300, 400];
  if (!inCheck && depth <= 4 && staticEval - RFP_MARGIN[depth] >= beta) {
    return staticEval;
  }
  
  // Futility Pruning margins
  const FUTILITY_MARGIN = [0, 200, 400, 600];
  const canFutility = !inCheck && depth <= 3 && staticEval + FUTILITY_MARGIN[depth] <= alpha;
  
  // Late Move Pruning limit for this depth
  const lmpLimit = depth < LMP_LIMITS.length ? LMP_LIMITS[depth] : 100;
  
  const legalMoves = generateLegalMoves(state, color);
  const firstMoves = orderMoves(state, legalMoves, ply, ttMove);
  
  if (firstMoves.length === 0) {
    return evalForColor(state, color);
  }
  
  let bestScore = -Infinity;
  let bestMove = 0;
  let moveCount = 0;
  let quietMoveCount = 0; // Count quiet moves for LMP
  
  for (const move1 of firstMoves) {
    moveCount++;
    
    // Futility pruning for first move
    const captured1 = getMoveCaptured(move1);
    const isQuiet1 = captured1 === 0 && getMovePromotion(move1) === 0;
    
    if (isQuiet1) {
      quietMoveCount++;
      // Late Move Pruning - skip late quiet moves at low depths
      if (!inCheck && depth <= 4 && quietMoveCount > lmpLimit) {
        continue;
      }
    }
    
    if (canFutility && moveCount > 1 && isQuiet1) {
      continue; // Skip this move - it can't raise alpha
    }
    
    const undoInfo1 = makeMove(state, move1);
    
    const gaveCheck = isInCheck(state, -color);
    let turnScore;
    let turnBestMove = move1;
    
    // LMR for first moves too - aggressive pruning after first few moves
    let firstMoveReduction = 0;
    if (moveCount > 3 && depth >= 2 && !gaveCheck && isQuiet1) {
      firstMoveReduction = Math.floor(Math.log(moveCount) * 0.5);
    }
    
    if (gaveCheck) {
      // Turn ends with check - opponent's turn
      turnScore = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color, ply + 1);
    } else {
      // Get second moves
      const secondLegalMoves = generateLegalMoves(state, color);
      const secondMoves = orderMoves(state, secondLegalMoves, ply, 0);
      
      if (secondMoves.length === 0) {
        turnScore = evalForColor(state, color);
      } else {
        let bestSecond = -Infinity;
        let bestSecondMove = 0;
        let secondMoveCount = 0;
        let secondQuietCount = 0; // For LMP in second moves
        let localAlpha = alpha; // Track alpha for second moves
        
        for (const move2 of secondMoves) {
          secondMoveCount++;
          
          // Futility pruning for second move
          const captured2 = getMoveCaptured(move2);
          const isQuiet2 = captured2 === 0 && getMovePromotion(move2) === 0;
          
          if (isQuiet2) {
            secondQuietCount++;
            // Late Move Pruning for second moves - be aggressive
            if (!inCheck && depth <= 4 && secondQuietCount > lmpLimit) {
              continue;
            }
          }
          
          if (canFutility && secondMoveCount > 1 && isQuiet2) {
            continue; // Skip this move - it can't raise alpha
          }
          
          const undoInfo2 = makeMove(state, move2);
          
          // More aggressive LMR - apply after first 2 moves
          let reduction = firstMoveReduction;
          if (secondMoveCount > 2 && depth >= 2 && isQuiet2) {
            reduction += LMR_TABLE[Math.min(depth, 63)][Math.min(secondMoveCount, 63)];
          }
          
          let score;
          const searchDepth = Math.max(0, depth - 1 - reduction);
          
          // PVS: First move with full window, rest with null window
          if (secondMoveCount === 1) {
            // First move: full window search
            score = -searchDoubleTurn(state, depth - 1, -beta, -localAlpha, -color, ply + 1);
          } else if (reduction > 0 && searchDepth < depth - 1) {
            // LMR: Search with reduced depth first
            score = -searchDoubleTurn(state, searchDepth, -localAlpha - 1, -localAlpha, -color, ply + 1);
            // Re-search at full depth if it beats alpha
            if (score > localAlpha && score < beta) {
              score = -searchDoubleTurn(state, depth - 1, -beta, -localAlpha, -color, ply + 1);
            }
          } else {
            // PVS: Null window search
            score = -searchDoubleTurn(state, depth - 1, -localAlpha - 1, -localAlpha, -color, ply + 1);
            // Re-search with full window if it beats alpha
            if (score > localAlpha && score < beta) {
              score = -searchDoubleTurn(state, depth - 1, -beta, -localAlpha, -color, ply + 1);
            }
          }
          
          undoMove(state, move2, undoInfo2);
          
          if (score > bestSecond) {
            bestSecond = score;
            bestSecondMove = move2;
          }
          
          // Update alpha for pruning within second-move loop
          if (score > localAlpha) {
            localAlpha = score;
          }
          
          if (bestSecond >= beta) {
            betaCutoffs++; // DEBUG_OPT
            // Store killer and update history for quiet moves
            if (captured2 === 0) {
              storeKiller(ply, move2);
              updateHistory(state, move2, depth);
            }
            break;
          }
        }
        
        turnScore = bestSecond;
        turnBestMove = encodeDoubleTurn(move1, bestSecondMove);
      }
    }
    
    undoMove(state, move1, undoInfo1);
    
    if (turnScore > bestScore) {
      bestScore = turnScore;
      bestMove = turnBestMove;
    }
    
    alpha = Math.max(alpha, turnScore);
    if (alpha >= beta) {
      betaCutoffs++; // DEBUG_OPT
      if (getMoveCaptured(move1) === 0) {
        storeKiller(ply, move1);
        updateHistory(state, move1, depth);
      }
      break;
    }
  }
  
  // Store in transposition table
  let ttFlag = TT_EXACT;
  if (bestScore <= alphaOrig) {
    ttFlag = TT_ALPHA;
  } else if (bestScore >= beta) {
    ttFlag = TT_BETA;
  }
  tt.store(state.zobristHash, depth, bestScore, ttFlag, bestMove);
  
  return bestScore;
}

// Helper to encode a double-turn as a single value (for TT storage)
function encodeDoubleTurn(move1, move2) {
  // Just store move1 for now - TT will use it for move ordering
  return move1;
}

/**
 * Find the best turn (1-2 moves) for the current position using iterative deepening
 * Returns array of moves representing the turn
 * @param {GameState} state - Current game state
 * @param {number} depth - Search depth in turns (default: 6)
 * @param {number} color - Color to search for (default: state.sideToMove)
 * @param {number} maxMoves - Maximum moves in this turn (1 for balanced first turn, 2 normally)
 */
export function findBestTurn(state, depth = 4, color = undefined, maxMoves = 2) {
  nodesSearched = 0;
  ttHits = 0;
  const startTime = Date.now();
  
  if (color === undefined) {
    color = state.sideToMove;
  }
  rootColor = color;
  
  // Clear killers and age history at start of new search
  clearKillers();
  
  const legalMoves = generateLegalMoves(state, color);
  if (legalMoves.length === 0) {
    return null;
  }
  
  let bestTurn = null;
  let bestScore = -Infinity;
  let bestQuick = -Infinity;
  
  // DEBUG_OPT: Reset counters
  ttCutoffs = 0;
  betaCutoffs = 0;
  
  // Iterative deepening: search depth 1, 2, 3... up to target
  // This improves move ordering dramatically via TT
  for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
    const iterStartTime = Date.now();
    const iterStartNodes = nodesSearched;
    let iterBestTurn = null;
    let iterBestScore = -Infinity;
    let iterBestQuick = -Infinity;
    
    // Root alpha-beta bounds
    let rootAlpha = -Infinity;
    const rootBeta = Infinity;
    
    // Get TT best move for root ordering
    const ttMove = tt.getBestMove(state.zobristHash) || 0;
    const firstMoves = orderMoves(state, legalMoves, 0, ttMove);
    
    // DEBUG_OPT: Log iteration start
    if (DEBUG_OPT && currentDepth >= 1) {
      console.log(`[DEBUG_OPT] Starting depth ${currentDepth}, ${firstMoves.length} first moves, ttMove=${ttMove}`);
    }
    
    if (maxMoves === 1) {
      // Single-move turn mode - use alpha-beta
      let moveIdx = 0;
      for (const move1 of firstMoves) {
        moveIdx++;
        const undoInfo1 = makeMove(state, move1);
        const turnScore = -searchDoubleTurn(state, currentDepth - 1, -rootBeta, -rootAlpha, -color, 1);
        undoMove(state, move1, undoInfo1);
        
        const currentTurn = [move1];
        const quietScore = getQuietScore(state, currentTurn);
        
        if (turnScore > iterBestScore || (turnScore === iterBestScore && quietScore > iterBestQuick)) {
          iterBestScore = turnScore;
          iterBestTurn = currentTurn;
          iterBestQuick = quietScore;
        }
        
        // Update root alpha
        if (turnScore > rootAlpha) {
          rootAlpha = turnScore;
        }
      }
    } else {
      // Normal double-move turn with proper alpha-beta
      let moveIdx = 0;
      for (const move1 of firstMoves) {
        moveIdx++;
        const undoInfo1 = makeMove(state, move1);
        const gaveCheck = isInCheck(state, -color);
        
        let turnScore;
        let currentTurn;
        
        if (gaveCheck) {
          // Turn ends with check - search opponent's response
          turnScore = -searchDoubleTurn(state, currentDepth - 1, -rootBeta, -rootAlpha, -color, 1);
          currentTurn = [move1];
        } else {
          // Search second moves with alpha-beta
          const secondMoves = orderMoves(state, generateLegalMoves(state, color), 0, 0);
          
          if (secondMoves.length === 0) {
            turnScore = evalForColor(state, color);
            currentTurn = [move1];
          } else {
            let bestSecondMove = null;
            let bestSecondScore = -Infinity;
            let secondAlpha = rootAlpha; // Use current root alpha for pruning
            
            for (const move2 of secondMoves) {
              const undoInfo2 = makeMove(state, move2);
              const score = -searchDoubleTurn(state, currentDepth - 1, -rootBeta, -secondAlpha, -color, 1);
              undoMove(state, move2, undoInfo2);
              
              if (score > bestSecondScore) {
                bestSecondScore = score;
                bestSecondMove = move2;
              }
              
              // Update alpha for pruning within second-move selection
              if (score > secondAlpha) {
                secondAlpha = score;
              }
              
              // Beta cutoff (shouldn't happen at root with beta=Infinity, but good practice)
              if (score >= rootBeta) {
                break;
              }
            }
            
            turnScore = bestSecondScore;
            currentTurn = [move1, bestSecondMove];
          }
        }
        
        undoMove(state, move1, undoInfo1);
        
        const quietScore = getQuietScore(state, currentTurn);
        
        if (turnScore > iterBestScore || (turnScore === iterBestScore && quietScore > iterBestQuick)) {
          iterBestScore = turnScore;
          iterBestTurn = currentTurn;
          iterBestQuick = quietScore;
          
          // DEBUG_OPT: Log when we find a new best
          if (DEBUG_OPT && currentDepth >= 2) {
            const turnStr = turnToString(state, currentTurn);
            console.log(`[DEBUG_OPT] depth=${currentDepth} move ${moveIdx}/${firstMoves.length}: new best ${turnStr} score=${turnScore}`);
          }
        }
        
        // Update root alpha for next first-move search
        if (turnScore > rootAlpha) {
          rootAlpha = turnScore;
        }
      }
    }
    
    // Update best result from this iteration
    if (iterBestTurn) {
      bestTurn = iterBestTurn;
      bestScore = iterBestScore;
      bestQuick = iterBestQuick;
    }
    
    const iterElapsed = Date.now() - iterStartTime;
    const iterNodes = nodesSearched - iterStartNodes;
    
    // DEBUG_OPT: Show progress for all depths
    if (DEBUG_OPT) {
      const turnStr = bestTurn ? turnToString(state, bestTurn) : 'null';
      console.log(`[DEBUG_OPT] depth=${currentDepth} best=${turnStr} score=${bestScore} nodes=${iterNodes} ttCutoffs=${ttCutoffs} betaCutoffs=${betaCutoffs} time=${iterElapsed}ms`);
    }
    
    // Early exit if we found a forced mate
    if (Math.abs(bestScore) > CHECKMATE_SCORE - 100) {
      console.log('[Engine] Mate found, stopping search');
      break;
    }
  }
  
  const elapsed = Date.now() - startTime;
  
  // Final result logging (can be used by caller)
  if (bestTurn && DEBUG_OPT) {
    const turnStr = turnToString(state, bestTurn);
    console.log(`[Engine] Final: ${turnStr} score=${bestScore} nodes=${nodesSearched} ttHits=${ttHits} ttCutoffs=${ttCutoffs} betaCutoffs=${betaCutoffs} time=${elapsed}ms`);
    
    // DEBUG_OPT: TT efficiency stats
    const ttEfficiency = nodesSearched > 0 ? ((ttCutoffs / nodesSearched) * 100).toFixed(1) : 0;
    const betaEfficiency = nodesSearched > 0 ? ((betaCutoffs / nodesSearched) * 100).toFixed(1) : 0;
    console.log(`[DEBUG_OPT] TT efficiency: ${ttEfficiency}%, Beta cutoff rate: ${betaEfficiency}%, TT size: ${tt.entries.size}`);
  }
  
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
  tt.clear();
  clearKillers();
  clearHistory();
  if (DEBUG_OPT) console.log('[Engine] Search tables cleared');
}
