import { Chess } from 'chess.js';

console.log('[marseillais.worker] v2.0 worker started');

const MATE = 30000;
const INF = 32000;

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000
};

// MVV-LVA for capture ordering
const MVV_LVA = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0
};

// Piece-Square Tables
const PST = {
  p: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [50, 50, 50, 50, 50, 50, 50, 50],
    [10, 10, 20, 30, 30, 20, 10, 10],
    [5, 5, 10, 25, 25, 10, 5, 5],
    [0, 0, 0, 20, 20, 0, 0, 0],
    [5, -5, -10, 0, 0, -10, -5, 5],
    [5, 10, 10, -20, -20, 10, 10, 5],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ],
  n: [
    [-50, -40, -30, -30, -30, -30, -40, -50],
    [-40, -20, 0, 0, 0, 0, -20, -40],
    [-30, 0, 10, 15, 15, 10, 0, -30],
    [-30, 5, 15, 20, 20, 15, 5, -30],
    [-30, 0, 15, 20, 20, 15, 0, -30],
    [-30, 5, 10, 15, 15, 10, 5, -30],
    [-40, -20, 0, 5, 5, 0, -20, -40],
    [-50, -40, -30, -30, -30, -30, -40, -50]
  ],
  b: [
    [-20, -10, -10, -10, -10, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 10, 10, 5, 0, -10],
    [-10, 5, 5, 10, 10, 5, 5, -10],
    [-10, 0, 10, 10, 10, 10, 0, -10],
    [-10, 10, 10, 10, 10, 10, 10, -10],
    [-10, 5, 0, 0, 0, 0, 5, -10],
    [-20, -10, -10, -10, -10, -10, -10, -20]
  ],
  r: [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [5, 10, 10, 10, 10, 10, 10, 5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [-5, 0, 0, 0, 0, 0, 0, -5],
    [0, 0, 0, 5, 5, 0, 0, 0]
  ],
  q: [
    [-20, -10, -10, -5, -5, -10, -10, -20],
    [-10, 0, 0, 0, 0, 0, 0, -10],
    [-10, 0, 5, 5, 5, 5, 0, -10],
    [-5, 0, 5, 5, 5, 5, 0, -5],
    [0, 0, 5, 5, 5, 5, 0, -5],
    [-10, 5, 5, 5, 5, 5, 0, -10],
    [-10, 0, 5, 0, 0, 0, 0, -10],
    [-20, -10, -10, -5, -5, -10, -10, -20]
  ],
  k: [
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-30, -40, -40, -50, -50, -40, -40, -30],
    [-20, -30, -30, -40, -40, -30, -30, -20],
    [-10, -20, -20, -20, -20, -20, -20, -10],
    [20, 20, 0, 0, 0, 0, 20, 20],
    [20, 30, 10, 0, 0, 10, 30, 20]
  ]
};

// Endgame king table (encourages centralization)
const PST_KING_ENDGAME = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10, 0, 0, -10, -20, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 30, 40, 40, 30, -10, -30],
  [-30, -10, 20, 30, 30, 20, -10, -30],
  [-30, -30, 0, 0, 0, 0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50]
];

// =============================================================================
//  GLOBALS
// =============================================================================
const killerMoves = new Map(); // [ply] -> Set of move keys
const historyHeuristic = new Map(); // move key -> score
const TT = new Map(); // Transposition table

let tStart = 0;
let tLimit = 0;
let nodes = 0;
let qNodes = 0;
const QNODE_LIMIT = 2000; // safety cap for quiescence nodes

const auxChess = new Chess();


function canonicalFenKey(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function flipTurnInFen(fen) {
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  return parts.join(' ');
}

function pairKey(pair) {
  if (!pair || pair.length === 0) return '';
  let s = pair[0].from + pair[0].to + (pair[0].promotion || '');
  if (pair[1]) s += ';' + pair[1].from + pair[1].to + (pair[1].promotion || '');
  return s;
}

function rankOf(square) {
  return parseInt(square[1]) - 1;
}

function fileOf(square) {
  return square.charCodeAt(0) - 97;
}


function evaluatePosition(g) {
  try {
    if (g.isCheckmate()) return -MATE;
    if (g.isDraw() || g.isStalemate() || g.isThreefoldRepetition()) return 0;

    const board = g.board();
    const turn = g.turn();
    
    let materialScore = 0;
    let positionalScore = 0;
    let mobilityScore = 0;
    
    // Count material for endgame detection
    let totalMaterial = 0;
    const whitePieces = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    const blackPieces = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
    
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;
        
        if (p.color === 'w') whitePieces[p.type]++;
        else blackPieces[p.type]++;
        
        totalMaterial += PIECE_VALUES[p.type] || 0;
      }
    }
    
    const isEndgame = totalMaterial < 2500;
    
    // Evaluate each piece
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p) continue;

        const mult = p.color === 'w' ? 1 : -1;
        const pstR = p.color === 'w' ? r : 7 - r;
        
        // Material value
        materialScore += mult * (PIECE_VALUES[p.type] || 0);
        
        // Positional value
        if (p.type === 'k' && isEndgame) {
          positionalScore += mult * (PST_KING_ENDGAME[pstR]?.[c] || 0);
        } else {
          positionalScore += mult * (PST[p.type]?.[pstR]?.[c] || 0);
        }
      }
    }
    
    // Mobility bonus (pseudo-legal moves)
    const myMoves = g.moves().length;
    
    // Create a copy to check opponent mobility
    let oppMoves = 0;
    try {
      const gCopy = new Chess(g.fen());
      gCopy.load(flipTurnInFen(g.fen()));
      oppMoves = gCopy.moves().length;
    } catch (e) {
      // If flipping fails, just use 0 for opponent mobility
    }
    
    mobilityScore = (myMoves - oppMoves) * 10;
    
    // King safety in opening/midgame
    let kingSafety = 0;
    if (!isEndgame) {
      kingSafety = evaluateKingSafety(board, turn);
    }
    
    // Pawn structure bonuses
    const pawnScore = evaluatePawnStructure(board, whitePieces, blackPieces);
    
    // Center control
    const centerControl = evaluateCenterControl(board);
    
    // Marseillais initiative bonus (having the move is powerful)
    const tempoBonus = 30;
    
    const total = materialScore + positionalScore + mobilityScore + 
                  kingSafety + pawnScore + centerControl + tempoBonus;
    
    return turn === 'w' ? total : -total;
  } catch (err) {
    console.error('[WORKER] Error in evaluatePosition:', err);
    return 0;
  }
}

function evaluateKingSafety(board, turn) {
  let safety = 0;
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type !== 'k') continue;
      
      const mult = p.color === turn ? 1 : -1;
      const pstR = p.color === 'w' ? r : 7 - r;
      
      // Penalize exposed king
      if (pstR > 5) { // King on back two ranks is safer
        safety += mult * 10;
      }
      
      // Check pawn shield
      if (p.color === 'w' && pstR < 2) {
        const shieldSquares = [[r+1,c-1], [r+1,c], [r+1,c+1]];
        for (const [sr, sc] of shieldSquares) {
          if (sr >= 0 && sr < 8 && sc >= 0 && sc < 8) {
            const shield = board[sr][sc];
            if (shield && shield.type === 'p' && shield.color === 'w') {
              safety += mult * 5;
            }
          }
        }
      } else if (p.color === 'b' && pstR > 5) {
        const shieldSquares = [[r-1,c-1], [r-1,c], [r-1,c+1]];
        for (const [sr, sc] of shieldSquares) {
          if (sr >= 0 && sr < 8 && sc >= 0 && sc < 8) {
            const shield = board[sr][sc];
            if (shield && shield.type === 'p' && shield.color === 'b') {
              safety += mult * 5;
            }
          }
        }
      }
    }
  }
  
  return safety;
}

function evaluatePawnStructure(board, whitePieces, blackPieces) {
  let score = 0;
  
  // Doubled pawns penalty
  for (let c = 0; c < 8; c++) {
    let whitePawnsInFile = 0;
    let blackPawnsInFile = 0;
    
    for (let r = 0; r < 8; r++) {
      const p = board[r][c];
      if (p && p.type === 'p') {
        if (p.color === 'w') whitePawnsInFile++;
        else blackPawnsInFile++;
      }
    }
    
    if (whitePawnsInFile > 1) score -= (whitePawnsInFile - 1) * 10;
    if (blackPawnsInFile > 1) score += (blackPawnsInFile - 1) * 10;
  }
  
  // Passed pawn bonus
  score += whitePieces.p * 2 - blackPieces.p * 2;
  
  return score;
}

function evaluateCenterControl(board) {
  let score = 0;
  const centerSquares = [[3,3], [3,4], [4,3], [4,4]];
  const extendedCenter = [[2,2], [2,3], [2,4], [2,5], [3,2], [3,5], [4,2], [4,5], [5,2], [5,3], [5,4], [5,5]];
  
  for (const [r, c] of centerSquares) {
    const p = board[r][c];
    if (p) {
      const mult = p.color === 'w' ? 1 : -1;
      score += mult * 15;
    }
  }
  
  for (const [r, c] of extendedCenter) {
    const p = board[r][c];
    if (p) {
      const mult = p.color === 'w' ? 1 : -1;
      score += mult * 5;
    }
  }
  
  return score;
}

function getMarseillaisMoves(g, onlyTactical = false) {
  const moves = [];
  let m1s = g.moves({ verbose: true });

  // When tactical-only, reduce m1 candidates to capture/check candidates to avoid explosion
  if (onlyTactical) {
    // Prefer captures and checks
    const m1Candidates = m1s.filter(m => m.captured || m.san.includes('+') || m.san.includes('#'));
    if (m1Candidates.length === 0) {
      // fallback to top few moves
      m1s = m1s.slice(0, Math.min(10, m1s.length));
    } else {
      // limit to best 12 tactical first moves
      m1s = m1Candidates.slice(0, Math.min(12, m1Candidates.length));
    }
  }

  for (const m1 of m1s) {
    const result = g.move(m1);
    if (!result) continue;

    // First move gives check → turn ends
    const inCheck = g.inCheck();
    if (g.isGameOver() || inCheck) {
      if (!onlyTactical || m1.captured || inCheck) {
        moves.push([m1]);
      }
      g.undo();
      continue;
    }

    const fenAfterM1 = g.fen();
    const fenFlipped = flipTurnInFen(fenAfterM1);

    try {
      // Use a fresh chess instance for second move generation to avoid shared-state bugs
      const g2 = new Chess(fenFlipped);
      let m2s = g2.moves({ verbose: true });

      if (onlyTactical) {
        // Filter m2s to captures/checks/promotions only and limit their number
        m2s = m2s.filter(m => m.captured || m.promotion || m.san.includes('+') || m.san.includes('#'));
        // Prioritize captures (MVV-LVA) by captured piece value
        m2s.sort((a, b) => (MVV_LVA[b.captured] || 0) - (MVV_LVA[a.captured] || 0));
        m2s = m2s.slice(0, Math.min(8, m2s.length));
      }

      if (m2s.length === 0) {
        if (!onlyTactical || m1.captured) {
          moves.push([m1]);
        }
      } else {
        for (const m2 of m2s) moves.push([m1, m2]);
      }
    } catch (err) {
      // Bad FEN, skip
    }

    g.undo();
  }
  return moves;
}

function applyPairToFen(fen, pair) {
  if (!pair || !pair[0]) return null;
  try {
    const g = new Chess(fen);

    const m1 = g.move(pair[0]);
    if (!m1) return null;

    if (g.inCheck() || g.isGameOver()) {
      return g.fen();
    }

    if (pair.length > 1) {
      const midFen = g.fen();
      const flipped = flipTurnInFen(midFen);

      const g2 = new Chess(flipped);
      const m2 = g2.move(pair[1]);
      if (!m2) return null;

      return g2.fen();
    }

    return g.fen();
  } catch (e) {
    return null;
  }
}

//  Move ordering for efficiency

function scoreMovePair(pair, depth, pvMove) {
  let score = 0;
  const key = pairKey(pair);
  
  // PV move gets highest priority
  if (pvMove && key === pvMove) {
    return 1000000;
  }
  
  // Killer moves
  const killers = killerMoves.get(depth);
  if (killers && killers.has(key)) {
    score += 50000;
  }
  
  // History heuristic
  score += (historyHeuristic.get(key) || 0);
  
// MVV-LVA for captures, promotions and checks/mates
  for (const m of pair) {
    if (!m) continue;

    if (m.captured) {
      const victim = MVV_LVA[m.captured] || 0;
      const attacker = MVV_LVA[m.piece] || 0;
      score += 10000 + (victim * 10 - attacker);
    }

    if (m.promotion) {
      score += 8000;
    }

    if (m.san.includes('#')) {
      score += 20000; // mate in root should be highest priority
    } else if (m.san.includes('+')) {
      score += 5000;
    }
  }
  
  return score;
}

// Search

function quiesce(g, alpha, beta, depth = 0) {
  try {
    qNodes++;
    if (qNodes > QNODE_LIMIT) {
      if ((qNodes & 31) === 0) console.warn('[WORKER] QNode limit reached:', qNodes);
      return alpha;
    }
    if (Date.now() - tStart > tLimit) return alpha;

    // Quiescence depth limit
    if (depth > 3) return evaluatePosition(g);

    const standPat = evaluatePosition(g);
    if (standPat >= beta) return beta;
    
    // Delta pruning
    const BIG_DELTA = 900; // Queen value
    if (standPat < alpha - BIG_DELTA) return alpha;
    
    if (alpha < standPat) alpha = standPat;

    const moves = getMarseillaisMoves(g, true);
    moves.sort((a, b) => scoreMovePair(b, 0, null) - scoreMovePair(a, 0, null));

    // Debug/logging for long tactical lists
    if (moves.length > 20 && (qNodes & 127) === 0) console.log('[WORKER] Quiesce has', moves.length, 'tactical moves at depth', depth);

    const moveLimit = Math.min(moves.length, 12);
    for (let i = 0; i < moveLimit; i++) {
      if (Date.now() - tStart > tLimit) return alpha;
      const pair = moves[i];
      const fen = g.fen();
      const nextFen = applyPairToFen(fen, pair);
      if (!nextFen) continue;

      const nextG = new Chess(nextFen);
      const score = -quiesce(nextG, -beta, -alpha, depth + 1);

      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    return alpha;
  } catch (err) {
    console.error('[WORKER] Error in quiesce:', err);
    return alpha;
  }
}

function alphabeta(g, depth, alpha, beta, ply) {
  try {
    if ((nodes & 255) === 0 && Date.now() - tStart > tLimit) return 0;
    nodes++;

    if (depth <= 0) return quiesce(g, alpha, beta);
    if (g.isGameOver()) return evaluatePosition(g);

    const moves = getMarseillaisMoves(g, false);
    if (!moves.length) return evaluatePosition(g);

    // Limit branching at deeper plies to speed up
    const moveLimit = depth >= 3 ? Math.min(12, moves.length) : moves.length;
    moves.sort((a, b) => scoreMovePair(b, ply, null) - scoreMovePair(a, ply, null));

    let bestScore = -INF;
    for (let i = 0; i < moveLimit; i++) {
      const pair = moves[i];
      const nextFen = applyPairToFen(g.fen(), pair);
      if (!nextFen) continue;

      const nextG = new Chess(nextFen);
      const score = -alphabeta(nextG, depth - 1, -beta, -alpha, ply + 1);
      if (score > bestScore) bestScore = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }

    return bestScore;
  } catch (err) {
    console.error('[WORKER] alphabeta error at depth', depth, ':', err);
    return 0;
  }
}

function findBestMove(fen, skillLevel) {
  const g = new Chess(fen);
  console.log(`[WORKER] SEARCH START. Skill: ${skillLevel}`);
  
  nodes = 0;
  qNodes = 0;
  tStart = Date.now();
  killerMoves.clear();
  
  const timeMap = [800, 2000, 4000];
  tLimit = timeMap[skillLevel - 1] || 2000;

  // Get all legal move pairs once
  const allRootMoves = getMarseillaisMoves(g, false);
  console.log(`[WORKER] Generated ${allRootMoves.length} root moves`);
  if (allRootMoves.length === 0) {
    console.warn('[WORKER] No root moves generated');
    return [];
  }

  // Quick scan for immediate mate-within-turn (pair finishing with checkmate)
  for (const pair of allRootMoves) {
    const f = applyPairToFen(fen, pair);
    if (!f) continue;
    const tmp = new Chess(f);
    if (tmp.isCheckmate()) {
      console.log('[WORKER] Found immediate mate in this turn:', pair.map(m => m.san).join(','));
      return pair;
    }
  }

  // Filter to top moves by static eval only (no validation overhead)
  allRootMoves.sort((a, b) => scoreMovePair(b, 0, null) - scoreMovePair(a, 0, null));
  const topK = skillLevel === 1 ? 8 : skillLevel === 2 ? 16 : 32;
  const rootMoves = allRootMoves.slice(0, Math.min(topK, allRootMoves.length));
  console.log(`[WORKER] Keeping top ${rootMoves.length} moves for search`);

  let bestMove = null;
  let bestScore = -INF;
  
  const maxDepth = skillLevel === 1 ? 2 : skillLevel === 2 ? 3 : 4;

  for (let d = 1; d <= maxDepth; d++) {
    if (Date.now() - tStart > tLimit * 0.85) {
      console.log(`[WORKER] Time limit reached at depth ${d}`);
      break;
    }
    
    console.log(`[WORKER] Starting depth ${d}, time: ${Date.now() - tStart}ms`);
    let localBest = null;
    let localScore = -INF;
    let movesEvaluated = 0;

    for (const pair of rootMoves) {
      if (Date.now() - tStart > tLimit) {
        console.log(`[WORKER] Time expired during depth ${d}`);
        break;
      }
      
      const nextFen = applyPairToFen(fen, pair);
      if (!nextFen) {
        console.warn(`[WORKER] Invalid move pair: ${pair.map(m => m?.san || '?').join(',')}`);
        continue;
      }

      try {
        console.log(`[WORKER] Evaluating move ${movesEvaluated + 1}: ${pair.map(m => m.san).join(',')}`);
        const nextG = new Chess(nextFen);
        const score = -alphabeta(nextG, d - 1, -INF, INF, 1);
        movesEvaluated++;
        console.log(`[WORKER] Move scored: ${pair.map(m => m.san).join(',')} = ${score}`);

        if (score > localScore) {
          localScore = score;
          localBest = pair;
          console.log(`[WORKER] Depth ${d}: New best = ${pair.map(m => m.san).join(',')} score=${score}`);
        }
      } catch (err) {
        console.error(`[WORKER] Error evaluating move ${pair.map(m => m?.san || '?').join(',')}: ${err.message}`);
      }
    }

    console.log(`[WORKER] Depth ${d} evaluated ${movesEvaluated} moves in ${Date.now() - tStart}ms`);

    if (localBest) {
      bestMove = localBest;
      bestScore = localScore;
      // Re-order for next depth
      const idx = rootMoves.indexOf(localBest);
      if (idx > 0) {
        rootMoves.splice(idx, 1);
        rootMoves.unshift(localBest);
      }
    }
    
    if (Math.abs(bestScore) >= MATE - 100) {
      console.log(`[WORKER] Mate found, stopping`);
      break;
    }
  }

  if (!bestMove && rootMoves.length > 0) {
    console.warn('[WORKER] No best move found, using first root move');
    bestMove = rootMoves[0];
  }
  
  console.log(`[WORKER] Returning best move: ${bestMove ? bestMove.map(m => m.san).join(',') : 'null'}`);
  return bestMove || [];
}

self.onmessage = e => {
  const { type, fen, skillLevel, requestId } = e.data;
  console.log('[WORKER] Received message:', { type, skillLevel, requestId });
  
  if (type === 'findBestMove') {
    try {
      const best = findBestMove(fen, skillLevel || 2);
      
      if (!best || best.length === 0) {
        console.warn('[WORKER] No best move found');
        self.postMessage({ type: 'bestMove', move: [], requestId });
        return;
      }
      
      console.log('[WORKER] Best move found:', best);
      
      const simple = best.map(m => ({ 
        from: m.from, 
        to: m.to, 
        promotion: m.promotion,
        san: m.san,
        lan: m.lan
      }));
      
      console.log('[WORKER] Posting response:', { type: 'bestMove', move: simple, requestId });
      self.postMessage({ type: 'bestMove', move: simple, requestId });
    } catch (err) {
      console.error('[WORKER] Error:', err);
      self.postMessage({ type: 'error', error: String(err), requestId });
    }
  }
};