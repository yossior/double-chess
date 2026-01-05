import { Chess } from 'chess.js';

console.log('[marseillais.worker] ===== WORKER STARTING v2.0 =====');

const MATE = 100000;
const VALS = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [[0,0,0,0,0,0,0,0],[50,50,50,50,50,50,50,50],[10,10,20,30,30,20,10,10],[5,5,10,25,25,10,5,5],[0,0,0,20,20,0,0,0],[5,-5,-10,0,0,-10,-5,5],[5,10,10,-20,-20,10,10,5],[0,0,0,0,0,0,0,0]],
  n: [[-50,-40,-30,-30,-30,-30,-40,-50],[-40,-20,0,0,0,0,-20,-40],[-30,0,10,15,15,10,0,-30],[-30,5,15,20,20,15,5,-30],[-30,0,15,20,20,15,0,-30],[-30,5,10,15,15,10,5,-30],[-40,-20,0,5,5,0,-20,-40],[-50,-40,-30,-30,-30,-30,-40,-50]],
  b: [[-20,-10,-10,-10,-10,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,10,10,5,0,-10],[-10,5,5,10,10,5,5,-10],[-10,0,10,10,10,10,0,-10],[-10,10,10,10,10,10,10,-10],[-10,5,0,0,0,0,5,-10],[-20,-10,-10,-10,-10,-10,-10,-20]],
  r: [[0,0,0,0,0,0,0,0],[-5,-5,-5,-5,-5,-5,-5,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[-5,0,0,0,0,0,0,-5],[0,0,0,5,5,0,0,0]],
  q: [[-20,-10,-10,-5,-5,-10,-10,-20],[-10,0,0,0,0,0,0,-10],[-10,0,5,5,5,5,0,-10],[0,0,5,5,5,5,0,-5],[-5,0,5,5,5,5,0,-5],[-10,5,5,5,5,5,0,-10],[-10,0,5,0,0,0,0,-10],[-20,-10,-10,-5,-5,-10,-10,-20]],
  k: [[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-30,-40,-40,-50,-50,-40,-40,-30],[-20,-30,-30,-40,-40,-30,-30,-20],[-10,-20,-20,-20,-20,-20,-20,-10],[20,20,0,0,0,0,20,20],[20,30,10,0,0,10,30,20]]
};

function ev(g) {
  if (g.isCheckmate()) {
    // Checkmate: current player (to move) is mated, so they lose
    return -MATE;
  }
  if (g.isDraw() || g.isStalemate() || g.isThreefoldRepetition() || g.isInsufficientMaterial()) {
    return 0;
  }
  
  const turn = g.turn();
  let s = 0;
  const b = g.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const v = VALS[p.type] + PST[p.type][p.color === 'w' ? r : 7-r][c];
      s += p.color === 'w' ? v : -v;
    }
  }
  
  // Return score from current player's perspective
  return turn === 'w' ? s : -s;
}

function genMoves(g) {
  const res = [];
  const m1s = g.moves({ verbose: true });
  for (const m1 of m1s) {
    g.move(m1);
    if (g.inCheck() || g.isGameOver()) {
      res.push([m1]);
    } else {
      // For second move, flip turn back to same color (Marseillais rule)
      try {
        const flippedFen = flipTurn(g.fen());
        const g2 = new Chess(flippedFen);
        const m2s = g2.moves({ verbose: true });
        if (m2s.length === 0) res.push([m1]);
        else for (const m2 of m2s) res.push([m1, m2]);
      } catch (e) {
        console.error('[WORKER] genMoves error:', e.message);
        res.push([m1]);
      }
    }
    g.undo();
  }
  return res;
}

function sc(p) {
  let s = 0;
  for (const m of p) {
    // Checks are EXTREMELY valuable - prioritize them
    if (m.san && (m.san.includes('+') || m.san.includes('#'))) s += 10000;
    // Captures
    if (m.captured) s += VALS[m.captured] * 100;
    // Promotions
    if (m.promotion) s += 9000;
  }
  return s;
}

let tStart = 0, tLimit = 0;

function quiesce(g, a, b, d = 0) {
  if (d >= 4 || Date.now() - tStart > tLimit) return ev(g);
  const stand = ev(g);
  if (stand >= b) return b;
  if (stand > a) a = stand;
  
  const caps = g.moves({ verbose: true }).filter(m => m.captured);
  caps.sort((x,y) => VALS[y.captured] - VALS[x.captured]);
  
  for (const m of caps.slice(0, 5)) {
    g.move(m);
    const s = -quiesce(g, -b, -a, d + 1);
    g.undo();
    if (s >= b) return b;
    if (s > a) a = s;
  }
  return a;
}

function flipTurn(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; // Flip active color
  parts[3] = '-'; // Clear en passant
  // Keep halfmove and fullmove counters intact (parts[4] and parts[5])
  return parts.join(' ');
}

function applyPair(g, pair) {
  const fen = g.fen();
  const startTurn = g.turn();
  
  try {
    // Apply first move
    const m1 = g.move({ from: pair[0].from, to: pair[0].to, promotion: pair[0].promotion });
    if (!m1) {
      console.error('[WORKER] invalid first move:', pair[0]);
      return fen;
    }
    
    // Check if game over after first move
    if (g.inCheck() || g.isGameOver()) {
      // Single move only - flip turn to opponent (currently it's opponent's turn after m1, keep it)
      // NO flip needed - chess.js already switched turns after m1
      return fen;
    }
    
    if (pair.length > 1) {
      // After m1, it's opponent's turn. For Marseillais, flip back so same player moves again
      g.load(flipTurn(g.fen()));
      
      const m2 = g.move({ from: pair[1].from, to: pair[1].to, promotion: pair[1].promotion });
      if (!m2) {
        console.error('[WORKER] invalid second move:', pair[1]);
        g.load(fen);
        return fen;
      }
      
      // After m2, chess.js flipped turn back to opponent, which is CORRECT
      // NO additional flip needed!
    }
  } catch (e) {
    console.error('[WORKER] applyPair error:', e.message, 'fen:', g.fen());
    g.load(fen);
  }
  
  return fen;
}

function search(g, d, a, b, root = false) {
  if (Date.now() - tStart > tLimit) return ev(g);
  
  // Check for immediate mate/draw
  if (g.isGameOver()) {
    return ev(g);
  }
  
  if (d <= 0) return quiesce(g, a, b);
  
  const moves = genMoves(g);
  if (!moves.length) return ev(g);
  
  moves.sort((x,y) => sc(y) - sc(x));
  
  // At root, search more moves; deeper down, prune aggressively
  const lim = root ? 20 : (d >= 3 ? 8 : (d >= 2 ? 12 : 18));
  const caps = moves.filter(p => p.some(m => m.captured));
  const quiet = moves.filter(p => !p.some(m => m.captured));
  const searchMoves = [...caps.slice(0, 10), ...quiet.slice(0, Math.max(0, lim - Math.min(10, caps.length)))];
  
  let best = -Infinity;
  for (const pair of searchMoves) {
    if (Date.now() - tStart > tLimit) break;
    
    const fen = applyPair(g, pair);
    
    // Check if we just delivered checkmate
    if (g.isCheckmate()) {
      g.load(fen);
      if (root) console.log('[WORKER] MATE FOUND: ' + pair.map(m=>m.san).join('+'));
      return MATE; // We delivered mate, we win!
    }
    
    // After applyPair, turn is already set correctly for opponent
    const s = -search(g, d - 1, -b, -a, false);
    g.load(fen);
    
    if (root && s > best) {
      console.log('[WORKER] depth=' + d + ' move=' + pair.map(m=>m.san).join('+') + ' score=' + s);
    }
    
    best = Math.max(best, s);
    a = Math.max(a, s);
    if (a >= b) break;
  }
  return best;
}

function findBestMove(fen, level = 5) {
  console.log('[WORKER ENGINE] START level=' + level + ' fen=' + fen.substring(0, 40));
  try {
    const g = new Chess(fen);
    const moves = genMoves(g);
    console.log('[WORKER ENGINE] ' + moves.length + ' moves, turn=' + g.turn());
    
    // Debug: Look for queen moves
    const queenMoves = moves.filter(p => p.some(m => m.piece === 'q'));
    console.log('[WORKER ENGINE] found ' + queenMoves.length + ' queen moves, examples:', queenMoves.slice(0, 3).map(p => p.map(m => m.san).join('+')));
    
    if (!moves.length) {
      console.log('[WORKER ENGINE] NO MOVES');
      return [];
    }
    
    tStart = Date.now();
    tLimit = [10,50,100,200,500,1000,2000,4000,6000,8000][level-1] || 500;
    
    // Level 1-4: Fast greedy
    if (level <= 4) {
      const check = level <= 2 ? moves.slice(0, level === 1 ? 5 : 10) : moves;
      let best = null, bestSc = -Infinity;
      for (const pair of check) {
        if (Date.now() - tStart > tLimit * 0.9) break;
        const f = applyPair(g, pair);
        if (g.isCheckmate()) { g.load(f); return pair; }
        const s = -ev(g);
        g.load(f);
        if (s > bestSc) { bestSc = s; best = pair; }
      }
      console.log('[WORKER ENGINE] greedy result: ' + (best ? best.map(m=>m.san).join('+') : 'none') + ' ' + (Date.now()-tStart) + 'ms');
      return best || moves[0];
    }
    
    // Level 5+: Search with iterative deepening
    const maxDepth = level <= 5 ? 3 : (level <= 7 ? 4 : (level <= 8 ? 5 : 7));
    console.log('[WORKER ENGINE] iterative deepening to depth ' + maxDepth);
    
    moves.sort((a,b) => sc(b) - sc(a));
    
    // CRITICAL: Check for immediate mates first
    console.log('[WORKER ENGINE] checking for immediate checkmates...');
    for (const pair of moves.slice(0, 30)) {
      const f = applyPair(g, pair);
      if (g.isCheckmate()) {
        g.load(f);
        console.log('[WORKER ENGINE] IMMEDIATE CHECKMATE: ' + pair.map(m=>m.san).join('+'));
        return pair;
      }
      g.load(f);
    }
    
    let bestMove = null;
    let bestScore = -Infinity;
    
    // Iterative deepening - search progressively deeper
    for (let depth = 1; depth <= maxDepth; depth++) {
      if (Date.now() - tStart > tLimit * 0.8) {
        console.log('[WORKER ENGINE] time limit, stopping at depth ' + depth);
        break;
      }
      
      console.log('[WORKER ENGINE] searching depth ' + depth);
      let depthBest = null;
      let depthBestScore = -Infinity;
      
      // Limit moves searched at root based on level
      const rootLimit = level <= 6 ? 20 : (level <= 8 ? 15 : 12);
      const caps = moves.filter(p => p.some(m => m.captured));
      const quiet = moves.filter(p => !p.some(m => m.captured));
      const toSearch = [...caps.slice(0, 12), ...quiet.slice(0, Math.max(0, rootLimit - Math.min(12, caps.length)))];
      
      for (let i = 0; i < toSearch.length; i++) {
        if (Date.now() - tStart > tLimit * 0.85) break;
        
        const pair = toSearch[i];
        const f = applyPair(g, pair);
        
        // Check for immediate mate
        if (g.isCheckmate()) {
          g.load(f);
          console.log('[WORKER ENGINE] MATE IN ONE: ' + pair.map(m=>m.san).join('+'));
          return pair;
        }
        
        // CRITICAL: After applying our moves, it's opponent's turn
        // We negate because we want to evaluate from opponent's perspective, then flip back
        const s = -search(g, depth - 1, -Infinity, Infinity, false);
        g.load(f);
        
        console.log('[WORKER ENGINE] depth ' + depth + ': ' + pair.map(m=>m.san).join('+') + ' = ' + s);
        
        // If we found a forced mate, return immediately
        if (s >= MATE - 100) {
          console.log('[WORKER ENGINE] FORCED MATE: ' + pair.map(m=>m.san).join('+') + ' score=' + s);
          return pair;
        }
        
        if (s > depthBestScore) {
          depthBestScore = s;
          depthBest = pair;
        }
      }
      
      if (depthBest) {
        bestMove = depthBest;
        bestScore = depthBestScore;
        console.log('[WORKER ENGINE] depth ' + depth + ' complete: ' + bestMove.map(m=>m.san).join('+') + ' score=' + bestScore);
      }
    }
    
    console.log('[WORKER ENGINE] FINAL: ' + (bestMove ? bestMove.map(m=>m.san).join('+') : 'none') + ' score=' + bestScore + ' time=' + (Date.now()-tStart) + 'ms');
    return bestMove || moves[0];
  } catch (err) {
    console.error('[WORKER ENGINE] ERROR:', err);
    throw err;
  }
}

console.log('[marseillais.worker] engine ready');

self.onmessage = (e) => {
  const { type, fen, skillLevel, requestId } = e.data;
  console.log('[marseillais.worker] onmessage', { type, requestId, skillLevel });

  if (type === 'findBestMove') {
    try {
      const level = skillLevel || 5;
      const best = findBestMove(fen, level);
      const simple = best?.map(m => ({ from: m.from, to: m.to, promotion: m.promotion, san: m.san, lan: m.lan })) || [];
      self.postMessage({ type: 'bestMove', move: simple, requestId });
    } catch (err) {
      console.error('[marseillais.worker] error', err);
      self.postMessage({ type: 'error', error: String(err), requestId });
    }
  }
};