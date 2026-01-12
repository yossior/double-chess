/**
 * Marseillais Chess Engine Worker
 * 
 * High-performance engine using Int8Array mailbox representation
 * Optimized for Double-Move Chess with Minimax and alpha-beta pruning
 */

import {
  GameState,
  findBestTurn,
  decodeMove,
  getMoveFrom,
  getMoveTo,
  getMovePromotion,
  squareToAlgebraic,
  moveToSan,
  makeMove,
  turnToString,
  WHITE,
  BLACK,
} from './double-move-engine.js';

console.log('[marseillais-engine-v2.worker] v2.7 balanced mode support');

// ============================================================================
// SKILL LEVEL -> DEPTH MAPPING
// ============================================================================

function getSearchDepth(skillLevel) {
  // Depth 2 = 2 turns = 4 single moves lookahead
  return 2;
}

// ============================================================================
// MAIN SEARCH
// ============================================================================

function findBestMoveFromFen(fen, skillLevel, maxMoves = 2) {
  const state = new GameState();
  state.loadFen(fen);
  
  const depth = getSearchDepth(skillLevel);
  console.log(`[Engine] Searching at depth ${depth} (skill ${skillLevel}), maxMoves ${maxMoves}`);
  
  const turn = findBestTurn(state, depth, undefined, maxMoves);
  
  if (!turn || turn.length === 0) {
    return null;
  }
  
  // Convert internal moves to the format expected by the game
  const result = [];
  
  for (const move of turn) {
    const from = getMoveFrom(move);
    const to = getMoveTo(move);
    const promotion = getMovePromotion(move);
    
    const fromAlg = squareToAlgebraic(from);
    const toAlg = squareToAlgebraic(to);
    
    const moveObj = {
      from: fromAlg,
      to: toAlg,
      san: moveToSan(state, move),
    };
    
    if (promotion) {
      const promoChars = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
      moveObj.promotion = promoChars[promotion];
    }
    
    result.push(moveObj);
    
    // Apply move to state for next iteration's SAN
    makeMove(state, move);
  }
  
  console.log(`[Engine] Best turn: ${result.map(m => m.san).join(' ')}`);
  
  return result;
}

// ============================================================================
// WORKER MESSAGE HANDLER
// ============================================================================

self.onmessage = function(e) {
  const { type, fen, skillLevel, requestId, maxMoves = 2 } = e.data;
  
  if (type === 'init') {
    self.postMessage({ type: 'ready' });
    return;
  }
  
  if (type === 'findBestMove') {
    try {
      console.log(`[Engine] Skill ${skillLevel}, maxMoves ${maxMoves}`);
      
      const bestTurn = findBestMoveFromFen(fen, skillLevel, maxMoves);
      
      if (bestTurn && bestTurn.length > 0) {
        self.postMessage({
          type: 'bestMove',
          move: bestTurn,
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
