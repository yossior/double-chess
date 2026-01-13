/**
 * Double-Move Chess Engine
 * 
 * Optimized for Marseillais Chess rules:
 * - Each turn = 2 consecutive moves by same player
 * - If first move is check, turn ends immediately
 * - Checks must be responded to on first move
 * 
 * Uses 10x12 Mailbox representation with Int8Array for speed
 * Uses negamax with alpha-beta pruning
 */

console.log('[double-move-engine] loaded');

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
  
  // Save state for undo
  const undoInfo = {
    castling: state.castling,
    epSquare: state.epSquare,
    piece: piece,
  };
  
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
  // Each side gets +20 for kingside, +10 for queenside rights
  if (state.castling & 0b1000) score += 20; // White kingside
  if (state.castling & 0b0100) score += 10; // White queenside
  if (state.castling & 0b0010) score -= 20; // Black kingside (subtract because Black is negative)
  if (state.castling & 0b0001) score -= 10; // Black queenside
  
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
function scoreMove(state, move) {
  const captured = getMoveCaptured(move);
  const promotion = getMovePromotion(move);
  const from = getMoveFrom(move);
  
  let score = 0;
  
  // Captures: MVV-LVA scoring
  if (captured !== 0) {
    const attacker = Math.abs(state.board[from]);
    const victim = Math.abs(captured);
    score += 10000 + MVV_LVA[victim * 7 + attacker];
  }
  
  // Promotions
  if (promotion !== 0) {
    score += 9000 + PIECE_VALUES[promotion];
  }
  
  return score;
}

/**
 * Sort moves by score (highest first)
 */
export function orderMoves(state, moves) {
  const scored = moves.map(move => ({ move, score: scoreMove(state, move) }));
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
let rootColor = WHITE; // The color we're searching for at the root

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
 * Search a double-move turn using negamax
 * Returns score from the perspective of 'color'
 * Positive = good for color, negative = bad for color
 */
function searchDoubleTurn(state, depth, alpha, beta, color) {
  nodesSearched++;
  
  // Terminal conditions
  const result = getGameResult(state, color);
  if (result === 'checkmate') {
    // We're checkmated - very bad for us
    return -CHECKMATE_SCORE + (100 - depth);
  }
  if (result === 'stalemate') {
    return DRAW_SCORE;
  }
  
  if (depth <= 0) {
    const score = evalForColor(state, color);
    return score;
  }
  
  const firstMoves = orderMoves(state, generateLegalMoves(state, color));
  
  if (firstMoves.length === 0) {
    // No moves - shouldn't happen if not checkmate/stalemate, but be safe
    return evalForColor(state, color);
  }
  
  let bestScore = -Infinity;
  
  for (const move1 of firstMoves) {
    const undoInfo1 = makeMove(state, move1);
    
    // Check if first move gave check - turn ends
    const gaveCheck = isInCheck(state, -color);
    
    let turnScore;
    
    if (gaveCheck) {
      // Turn ends with check - opponent's turn
      // Recurse for opponent, negate the result
      turnScore = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color);
    } else {
      // Get second moves
      const secondMoves = orderMoves(state, generateLegalMoves(state, color));
      
      if (secondMoves.length === 0) {
        // No second move possible
        turnScore = evalForColor(state, color);
      } else {
        // Search all second moves, find the best
        let bestSecond = -Infinity;
        
        for (const move2 of secondMoves) {
          const undoInfo2 = makeMove(state, move2);
          
          // After our 2-move turn, it's opponent's turn
          const score = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color);
          
          undoMove(state, move2, undoInfo2);
          
          if (score > bestSecond) {
            bestSecond = score;
          }
          
          // Alpha-beta within the second move loop
          if (bestSecond >= beta) break;
        }
        
        turnScore = bestSecond;
      }
    }
    
    undoMove(state, move1, undoInfo1);
    
    if (turnScore > bestScore) {
      bestScore = turnScore;
    }
    
    alpha = Math.max(alpha, turnScore);
    if (alpha >= beta) break;
  }
  
  return bestScore;
}

/**
 * Find the best turn (1-2 moves) for the current position
 * Returns array of moves representing the turn
 * @param {GameState} state - Current game state
 * @param {number} depth - Search depth in turns
 * @param {number} color - Color to search for (default: state.sideToMove)
 * @param {number} maxMoves - Maximum moves in this turn (1 for balanced first turn, 2 normally)
 */
export function findBestTurn(state, depth = 4, color = undefined, maxMoves = 2) {
  nodesSearched = 0;
  const startTime = Date.now();
  
  if (color === undefined) {
    color = state.sideToMove;
  }
  rootColor = color;
  const firstMoves = orderMoves(state, generateLegalMoves(state, color));
  
  if (firstMoves.length === 0) {
    return null;
  }
  
  let bestTurn = null;
  let bestScore = -Infinity;
  let bestQuick = -Infinity; // Tiebreaker: prefer quiet moves when scores are equal
  // Do NOT use alpha-beta at root level - we need exact scores for all candidates
  // to properly select the best move with tiebreaking
  const alpha = -Infinity;
  const beta = Infinity;
  
  // Debug: collect all turn scores
  const debugScores = [];
  
  // Single-move turn mode (balanced first turn for white)
  if (maxMoves === 1) {
    console.log('[Engine] Single-move turn (balanced mode first turn)');
    
    for (const move1 of firstMoves) {
      const undoInfo1 = makeMove(state, move1);
      
      // After our 1 move, opponent's turn (they get 2 moves)
      const turnScore = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color);
      
      undoMove(state, move1, undoInfo1);
      
      const currentTurn = [move1];
      const quietScore = getQuietScore(state, currentTurn);
      
      debugScores.push({ turn: currentTurn, score: turnScore, quiet: quietScore });
      
      if (turnScore > bestScore || (turnScore === bestScore && quietScore > bestQuick)) {
        bestScore = turnScore;
        bestTurn = currentTurn;
        bestQuick = quietScore;
      }
    }
  } else {
    // Normal double-move turn
    // Try each first move
    for (const move1 of firstMoves) {
      const undoInfo1 = makeMove(state, move1);
      
      const gaveCheck = isInCheck(state, -color);
      
      let turnScore;
      let currentTurn;
      
      if (gaveCheck) {
        // Turn ends with check - opponent's turn (negate their score)
        turnScore = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color);
        currentTurn = [move1];
      } else {
        // Try all second moves
        const secondMoves = orderMoves(state, generateLegalMoves(state, color));
        
        if (secondMoves.length === 0) {
          turnScore = evalForColor(state, color);
          currentTurn = [move1];
        } else {
          let bestSecondMove = null;
          let bestSecondScore = -Infinity;
        
        for (const move2 of secondMoves) {
          const undoInfo2 = makeMove(state, move2);
          
          // After our 2 moves, opponent's turn (negate their score)
          const score = -searchDoubleTurn(state, depth - 1, -beta, -alpha, -color);
          
          undoMove(state, move2, undoInfo2);
          
          if (score > bestSecondScore) {
            bestSecondScore = score;
            bestSecondMove = move2;
          }
          
          // Alpha-beta pruning
          if (bestSecondScore >= beta) break;
        }
        
        turnScore = bestSecondScore;
        currentTurn = [move1, bestSecondMove];
      }
    }
    
    undoMove(state, move1, undoInfo1);
    
    // Calculate a "quiet score" for tiebreaking - prefer development over captures
    const quietScore = getQuietScore(state, currentTurn);
    
    // Debug: record this turn's score
    debugScores.push({ turn: currentTurn, score: turnScore, quiet: quietScore });
    
    // Use quiet score as tiebreaker when full scores are equal
    if (turnScore > bestScore || (turnScore === bestScore && quietScore > bestQuick)) {
      bestScore = turnScore;
      bestTurn = currentTurn;
      bestQuick = quietScore;
    }
    // Note: No alpha-beta cutoff at root - we need all scores for tiebreaking
  }
  } // End of else block (maxMoves !== 1)
  
  const elapsed = Date.now() - startTime;
  
  // Debug: show top 5 candidate turns (sort by score, then quiet score)
  debugScores.sort((a, b) => b.score - a.score || b.quiet - a.quiet);
  console.log('[Engine] Top candidates:');
  for (let i = 0; i < Math.min(5, debugScores.length); i++) {
    const { turn, score, quiet } = debugScores[i];
    const turnStr = turnToString(state, turn);
    console.log(`  #${i+1}: ${turnStr} score=${score} quiet=${quiet}`);
  }
  
  // Debug: show the turn we picked
  if (bestTurn) {
    const turnStr = turnToString(state, bestTurn);
    console.log(`[Engine] Best: ${turnStr} score=${bestScore} quiet=${bestQuick} nodes=${nodesSearched} time=${elapsed}ms`);
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
