/**
 * Marseillais Chess Engine - Heuristic Search
 * 
 * 1. For each of our turns, simulate opponent's BEST 2-move response
 * 2. Evaluate position AFTER opponent responds
 * 3. Pick turn that leaves us in best position after opponent's best reply
 * 
 */

import { Chess } from '../../../chess.js/src/chess.ts';

console.log('[marseillais-engine.worker] v8.0 Heuristic Best-Response');

// ============================================================================
// CONSTANTS
// ============================================================================

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables (from white's perspective)
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

// ============================================================================
// EVALUATION
// ============================================================================

function getPstIndex(square, color) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  return color === 'w' ? (7 - rank) * 8 + file : rank * 8 + file;
}

/**
 * Static evaluation from white's perspective
 */
function evaluate(chess) {
  const board = chess.board();
  let score = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;
      
      const square = String.fromCharCode(97 + file) + (8 - rank);
      const pieceValue = PIECE_VALUES[piece.type] || 0;
      const pstValue = PST[piece.type]?.[getPstIndex(square, piece.color)] || 0;
      
      if (piece.color === 'w') {
        score += pieceValue + pstValue;
      } else {
        score -= pieceValue + pstValue;
      }
    }
  }
  
  return score;
}

/**
 * Play a turn on the chess instance
 */
function playTurn(chess, turn) {
  if (turn.length === 1) {
    chess.playTurn(turn[0]);
  } else {
    chess.playTurn(turn[0], turn[1]);
  }
}

// ============================================================================
// SEARCH
// ============================================================================

/**
 * Find opponent's best 2-move turn and return the resulting evaluation
 * Returns score from WHITE's perspective (like evaluate())
 * 
 * OPTIMIZATION: Sort turns by capture value and only check top N
 */
function opponentBestResponse(chess, debug = false) {
  // Get all legal TURNS for opponent
  const oppTurns = chess.turns();
  
  if (oppTurns.length === 0) {
    return chess.isCheckmate() ? (chess.turn() === 'w' ? -100000 : 100000) : 0;
  }
  
  const oppColor = chess.turn();
  
  // Sort by capture value (most threatening first)
  oppTurns.sort((a, b) => {
    let aCapture = 0, bCapture = 0;
    for (const m of a) if (m.captured) aCapture += PIECE_VALUES[m.captured] || 0;
    for (const m of b) if (m.captured) bCapture += PIECE_VALUES[m.captured] || 0;
    return bCapture - aCapture;
  });
  
  // Only check top 50 most threatening turns
  const checkCount = Math.min(50, oppTurns.length);
  
  let bestScore = oppColor === 'w' ? -Infinity : Infinity;
  let bestTurn = null;
  
  for (let i = 0; i < checkCount; i++) {
    const turn = oppTurns[i];
    playTurn(chess, turn);
    const score = evaluate(chess);
    
    if (oppColor === 'w' ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestTurn = turn;
    }
    
    chess.undoTurn();
  }
  
  if (debug && bestTurn) {
    console.log(`[Engine] Opp best: ${bestTurn.map(m => m.san).join(' ')} = ${bestScore}`);
  }
  
  return bestScore;
}

/**
 * Evaluate a turn: position after opponent's best response?
 * Returns score from OUR perspective
 */
function evaluateTurn(chess, turn, ourColor, debug = false) {
  playTurn(chess, turn);
  
  // Checkmate = instant win
  if (chess.isCheckmate()) {
    chess.undoTurn();
    return 100000;
  }
  
  // Get position after opponent's best response
  const posAfterOpp = opponentBestResponse(chess, debug);
  
  chess.undoTurn();
  
  // Return from our perspective
  return ourColor === 'w' ? posAfterOpp : -posAfterOpp;
}

/**
 * Quick pre-filter score (for sorting candidates)
 * Positional score + hanging penalty
 */
function quickEval(chess, turn, ourColor) {
  playTurn(chess, turn);
  if (chess.isCheckmate()) {
    chess.undoTurn();
    return 100000;
  }
  
  // Use ONLY positional evaluation, not material. This prevents captures from dominating the candidate list
  const board = chess.board();
  let score = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (!piece) continue;
      
      const square = String.fromCharCode(97 + file) + (8 - rank);
      const pstValue = PST[piece.type]?.[getPstIndex(square, piece.color)] || 0;
      
      if (piece.color === 'w') {
        score += pstValue;
      } else {
        score -= pstValue;
      }
    }
  }
  
  // Penalty if opponent can capture something with first move
  const oppMoves = chess.moves({ verbose: true });
  let maxCapture = 0;
  for (const m of oppMoves) {
    if (m.captured) {
      const capVal = PIECE_VALUES[m.captured] || 0;
      if (capVal > maxCapture) maxCapture = capVal;
    }
  }
  
  // Apply penalty
  if (ourColor === 'w') {
    score -= maxCapture;
  } else {
    score += maxCapture;
  }
  
  chess.undoTurn();
  return ourColor === 'w' ? score : -score;
}

/**
 * Find the best turn
 */
function findBestTurn(fen) {
  const chess = new Chess(fen);
  const ourColor = chess.turn();
  
  console.log(`[Engine] Finding best turn for ${ourColor}`);
  const startTime = Date.now();
  
  const ourTurns = chess.turns();
  console.log(`[Engine] ${ourTurns.length} legal turns`);
  
  if (ourTurns.length === 0) return null;
  if (ourTurns.length === 1) return ourTurns[0];
  
  // Pre-sort by quick eval to check best candidates first
  const sorted = ourTurns.map(turn => ({ turn, quick: quickEval(chess, turn, ourColor) }));
  sorted.sort((a, b) => b.quick - a.quick);
  
  // Evaluate top 40 candidates with full opponent response
  // Increased from 25 to catch more tactical variations
  const candidateCount = Math.min(40, sorted.length);
  let bestTurn = sorted[0].turn;
  let bestScore = -Infinity;
  
  for (let i = 0; i < candidateCount; i++) {
    const { turn, quick } = sorted[i];
    const turnStr = turn.map(m => m.san).join(' ');
    
    playTurn(chess, turn);
    
    if (chess.isCheckmate()) {
      chess.undoTurn();
      console.log(`[Engine] ${turnStr}: CHECKMATE!`);
      return turn;
    }
    
    // Get position after opponent's best response
    const posAfterOpp = opponentBestResponse(chess, i < 5);
    
    chess.undoTurn();
    
    // Return from our perspective
    const score = ourColor === 'w' ? posAfterOpp : -posAfterOpp;
    
    if (i < 5) {
      console.log(`[Engine] ${turnStr}: quick=${quick} full=${score}`);
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTurn = turn;
      // Debug when we find a new best
      if (i >= 5) {
        console.log(`[Engine] NEW BEST at #${i}: ${turnStr} quick=${quick} full=${score}`);
        // Re-run with debug to see opponent's response
        playTurn(chess, turn);
        opponentBestResponse(chess, true);
        chess.undoTurn();
      }
    }
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`[Engine] Best: ${bestTurn.map(m => m.san).join(' ')} (score: ${bestScore}) in ${elapsed}ms`);
  
  return bestTurn;
}

// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

self.onmessage = function(e) {
  const { type, fen, skillLevel, requestId } = e.data;
  
  if (type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }
  
  if (type === 'findBestMove') {
    try {
      console.log(`[Engine] Skill ${skillLevel}`);
      
      const bestTurn = findBestTurn(fen);
      
      if (bestTurn && bestTurn.length > 0) {
        const move = bestTurn.map(m => ({
          from: m.from,
          to: m.to,
          promotion: m.promotion,
          san: m.san,
        }));
        
        self.postMessage({
          type: 'bestMove',
          move,
          requestId,
        });
      } else {
        self.postMessage({
          type: 'error',
          error: 'No legal moves available',
          requestId,
        });
      }
    } catch (err) {
      console.error('[Engine Error]', err);
      self.postMessage({
        type: 'error',
        error: err.message,
        requestId,
      });
    }
  }
};
