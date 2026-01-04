import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Stockfish difficulty levels - controls search depth for move evaluation.
 * 
 * For double-move chess, we evaluate ALL possible first moves (~20-35 positions).
 * This makes evalDepth the critical factor for both strength AND response time.
 * 
 * - evalDepth: Used for evaluating first move candidates (main bottleneck)
 * - depth: Used for fallback second move search (rarely needed)
 * 
 * At evalDepth 6: ~0.2s per position = 4-7 seconds per turn (reasonable)
 * At evalDepth 10: ~1s per position = 20-35 seconds per turn (slow but strong)
 */
const ENGINE_LEVELS = {
  1: { depth: 4, evalDepth: 2, approxElo: 400 },   // Beginner - instant, makes obvious mistakes
  2: { depth: 6, evalDepth: 3, approxElo: 600 },   // Novice - very fast, weak tactics
  3: { depth: 8, evalDepth: 4, approxElo: 800 },   // Casual - fast, misses combinations
  4: { depth: 10, evalDepth: 5, approxElo: 1000 }, // Club player - quick, basic tactics
  5: { depth: 12, evalDepth: 6, approxElo: 1200 }, // Intermediate - balanced speed/strength
  6: { depth: 14, evalDepth: 7, approxElo: 1400 }, // Advanced - moderate wait, solid play
  7: { depth: 16, evalDepth: 8, approxElo: 1600 }, // Strong - longer think, good tactics
  8: { depth: 18, evalDepth: 9, approxElo: 1800 }, // Expert - noticeable wait, strong
  9: { depth: 20, evalDepth: 10, approxElo: 2000 }, // Master - slow but formidable
  10: { depth: 22, evalDepth: 12, approxElo: 2200 }, // GM level - very strong, patient play
};

/**
 * useStockfish Hook - Manages Stockfish engine for double-move chess variant.
 * 
 * Double-Move Algorithm:
 * 1. When it's Stockfish's turn (black), get all possible first moves
 * 2. For each first move:
 *    - If it gives check → evaluate with material count (turn ends immediately)
 *    - If no check → ask Stockfish for best continuation and evaluation
 * 3. Pick the first move with highest evaluation
 * 4. Execute first move, wait 200ms, execute second move
 */
export function useStockfish(chessGame, setChessPosition, chessController, setMoveHistory, setHistoryIndex, setTurn, skillLevel, clock) {
  const stockfishRef = useRef(null);
  const [isStockfishReady, setIsStockfishReady] = useState(false);
  const [isPlayingDoubleMove, setIsPlayingDoubleMove] = useState(false);
  
  // Refs to avoid stale closures
  const chessControllerRef = useRef(chessController);
  const isSearchingRef = useRef(false);
  const isPlayingDoubleMoveRef = useRef(false);
  
  // Queue system for sequential position evaluation
  const evalQueueRef = useRef([]);
  const currentEvalRef = useRef(null);
  const evalCallbackRef = useRef(null);
  
  useEffect(() => {
    chessControllerRef.current = chessController;
  }, [chessController]);

  // --- Process Evaluation Queue ---
  const processEvalQueue = useCallback(() => {
    if (evalQueueRef.current.length === 0) {
      return;
    }
    
    const { fen, depth, callback } = evalQueueRef.current.shift();
    currentEvalRef.current = { fen, score: 0, bestMove: null };
    evalCallbackRef.current = callback;
    
    const stockfish = stockfishRef.current;
    if (stockfish && stockfish.postMessage) {
      stockfish.postMessage(`position fen ${fen}`);
      stockfish.postMessage(`go depth ${depth}`);
    }
  }, []);

  // --- Message Handler for Stockfish Responses ---
  const handleStockfishMessage = useCallback((message) => {
    // Parse evaluation from info lines
    if (message.includes('score cp')) {
      const match = message.match(/score cp ([-\d]+)/);
      if (match && currentEvalRef.current) {
        currentEvalRef.current.score = parseInt(match[1], 10);
      }
    }
    
    // Handle mate scores
    if (message.includes('score mate')) {
      const match = message.match(/score mate ([-\d]+)/);
      if (match && currentEvalRef.current) {
        const mateIn = parseInt(match[1], 10);
        // Mate scores are very high/low
        currentEvalRef.current.score = mateIn > 0 ? 10000 - mateIn : -10000 - mateIn;
      }
    }
    
    // Extract best move when search completes
    if (message.startsWith('bestmove')) {
      const match = message.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
      if (match && currentEvalRef.current) {
        currentEvalRef.current.bestMove = match[1];
      }
      
      // Call the callback with results
      if (evalCallbackRef.current && currentEvalRef.current) {
        const result = { ...currentEvalRef.current };
        const callback = evalCallbackRef.current;
        
        evalCallbackRef.current = null;
        currentEvalRef.current = null;
        
        callback(result);
      }
      
      // Process next item in queue
      processEvalQueue();
    }
    
    if (message.includes('uciok')) {
      console.log('[useStockfish] Stockfish ready (uciok)');
    }
    
    if (message.includes('readyok')) {
      console.log('[useStockfish] Stockfish ready (readyok)');
      setIsStockfishReady(true);
    }
  }, [processEvalQueue]);

  // --- Queue a Position for Evaluation ---
  const queueEvaluation = useCallback((fen, depth, callback) => {
    evalQueueRef.current.push({ fen, depth, callback });
    
    // Start processing if not already
    if (!currentEvalRef.current) {
      processEvalQueue();
    }
  }, [processEvalQueue]);

  // --- Initialize Stockfish ---
  useEffect(() => {
    let stockfish = null;
    let terminated = false;
    
    async function initStockfish() {
      try {
        // Load Stockfish from public folder via script tag
        await new Promise((resolve, reject) => {
          // Check if already loaded
          if (window.Stockfish) {
            resolve();
            return;
          }
          
          const script = document.createElement('script');
          script.src = '/stockfish/stockfish.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
        
        if (!window.Stockfish || typeof window.Stockfish !== 'function') {
          console.error('[useStockfish] Stockfish not loaded correctly');
          return;
        }
        
        console.log('[useStockfish] Initializing Stockfish...');
        stockfish = await window.Stockfish();
        
        if (terminated) {
          stockfish.terminate?.();
          return;
        }
        
        stockfishRef.current = stockfish;
        console.log('[useStockfish] Stockfish instance created');
        
        // Set up message listener
        if (stockfish.addMessageListener) {
          stockfish.addMessageListener(handleStockfishMessage);
        } else {
          console.error('[useStockfish] No addMessageListener on Stockfish');
        }
        
        // Initialize UCI protocol
        stockfish.postMessage('uci');
        stockfish.postMessage('isready');
        
      } catch (err) {
        console.error('[useStockfish] Failed to initialize Stockfish:', err);
      }
    }
    
    initStockfish();

    return () => {
      terminated = true;
      if (stockfish?.terminate) {
        stockfish.terminate();
      }
    };
  }, [handleStockfishMessage]);

  // --- Material-Based Position Evaluation (for check positions) ---
  const evaluateMaterial = useCallback((game) => {
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
    let score = 0;
    const board = game.fen().split(' ')[0];
    
    for (const char of board) {
      const lower = char.toLowerCase();
      if (values[lower]) {
        // Positive for white pieces, negative for black
        score += char === lower ? -values[lower] : values[lower];
      }
    }
    
    // Add bonuses for game state
    if (game.isCheckmate()) {
      // If white to move and checkmate, black wins
      score = game.turn() === 'w' ? -20000 : 20000;
    } else if (game.inCheck()) {
      // Bonus for giving check
      score += game.turn() === 'w' ? -50 : 50;
    }
    
    return score;
  }, []);

  // --- Flip turn in FEN for double-move variant ---
  const flipTurnInFen = useCallback((fen) => {
    // After black's first move, chess.js flips turn to white.
    // But in double-move chess, black gets another move.
    // We flip it back to black and clear en-passant.
    const parts = fen.split(' ');
    parts[1] = parts[1] === 'w' ? 'b' : 'w'; // Flip turn
    parts[3] = '-'; // Clear en-passant (important for legal move generation)
    return parts.join(' ');
  }, []);

  // --- Evaluate All First Moves and Pick Best ---
  const evaluateAllFirstMoves = useCallback((levelConfig) => {
    const allMoves = chessGame.moves({ verbose: true });
    
    if (allMoves.length === 0) {
      console.log('[useStockfish] No moves available');
      return;
    }
    
    isSearchingRef.current = true;
    const GameConstructor = chessGame.constructor;
    const candidates = [];
    let pending = allMoves.length;
    
    console.log(`[useStockfish] Evaluating ${allMoves.length} first move candidates at evalDepth ${levelConfig.evalDepth}...`);
    
    allMoves.forEach((move1) => {
      const tempGame = new GameConstructor(chessGame.fen());
      const result = tempGame.move(move1);
      
      if (!result) {
        pending--;
        checkComplete();
        return;
      }
      
      // If first move gives check, turn ends immediately - use material evaluation
      if (tempGame.inCheck()) {
        const materialScore = evaluateMaterial(tempGame);
        candidates.push({
          move1,
          move2: null,
          // Black wants LOW scores (negative = good for black)
          // If we give check, the position after is good for us
          score: -materialScore + 1000,
          givesCheck: true,
        });
        pending--;
        checkComplete();
        return;
      }
      
      // First move doesn't give check - flip turn back to black for second move
      // This simulates that it's still black's turn in double-move chess
      const fenAfterMove1 = tempGame.fen();
      const fenForBlackSecondMove = flipTurnInFen(fenAfterMove1);
      
      // Ask Stockfish for black's best second move from this position
      queueEvaluation(fenForBlackSecondMove, levelConfig.evalDepth, (evalResult) => {
        // Stockfish returns score from the perspective of the side to move (black)
        // Positive = good for black, which is what we want
        candidates.push({
          move1,
          move2: evalResult.bestMove,
          score: evalResult.score,
          givesCheck: false,
        });
        pending--;
        checkComplete();
      });
    });
    
    function checkComplete() {
      if (pending > 0) return;
      
      isSearchingRef.current = false;
      
      if (candidates.length === 0) {
        console.log('[useStockfish] No valid moves found');
        return;
      }
      
      // Sort by score (highest first = best for black)
      candidates.sort((a, b) => b.score - a.score);
      const best = candidates[0];
      
      console.log('[useStockfish] Best combo:', best.move1.san, 
        best.move2 ? `→ ${best.move2}` : '(gives check)',
        'eval:', best.score);
      
      // Log top 5 for debugging
      console.log('[useStockfish] Top 5 candidates:');
      candidates.slice(0, 5).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.move1.san}${c.move2 ? ' → '+c.move2 : ' (check)'}: ${c.score}`);
      });
      
      // Execute the double move
      executeDoubleMove(best);
    }
  }, [chessGame, evaluateMaterial, queueEvaluation, flipTurnInFen]);

  // --- Execute Double Move with 200ms Delay ---
  const executeDoubleMove = useCallback((best) => {
    isPlayingDoubleMoveRef.current = true;
    setIsPlayingDoubleMove(true);
    
    const controller = chessControllerRef.current;
    
    // Apply first move
    console.log('[useStockfish] Executing first move:', best.move1.san);
    controller.applyLocalMove({
      from: best.move1.from,
      to: best.move1.to,
      promotion: best.move1.promotion,
    });
    
    // If first move gave check, turn ends
    if (best.givesCheck) {
      console.log('[useStockfish] First move gave check - turn ends');
      isPlayingDoubleMoveRef.current = false;
      setIsPlayingDoubleMove(false);
      return;
    }
    
    // Wait 200ms then play second move
    setTimeout(() => {
      // Verify it's still black's turn
      if (chessGame.turn() !== 'b') {
        console.log('[useStockfish] No longer black\'s turn, skipping second move');
        isPlayingDoubleMoveRef.current = false;
        setIsPlayingDoubleMove(false);
        return;
      }
      
      if (best.move2) {
        const from = best.move2.substring(0, 2);
        const to = best.move2.substring(2, 4);
        const promotion = best.move2.length > 4 ? best.move2[4] : undefined;
        
        console.log('[useStockfish] Executing second move:', best.move2);
        chessControllerRef.current.applyLocalMove({ from, to, promotion });
      } else {
        // Fallback: search for second move if we don't have it cached
        console.log('[useStockfish] No cached second move, searching...');
        playSecondMove(ENGINE_LEVELS[skillLevel] || ENGINE_LEVELS[5]);
      }
      
      isPlayingDoubleMoveRef.current = false;
      setIsPlayingDoubleMove(false);
    }, 200);
  }, [chessGame, skillLevel]);

  // --- Play Second Move (direct search, used as fallback) ---
  const playSecondMove = useCallback((levelConfig) => {
    isSearchingRef.current = true;
    
    const fen = chessGame.fen();
    console.log('[useStockfish] Searching for second move at depth', levelConfig.depth);
    
    queueEvaluation(fen, levelConfig.depth, (result) => {
      isSearchingRef.current = false;
      
      if (result.bestMove && chessGame.turn() === 'b') {
        const from = result.bestMove.substring(0, 2);
        const to = result.bestMove.substring(2, 4);
        const promotion = result.bestMove.length > 4 ? result.bestMove[4] : undefined;
        
        console.log('[useStockfish] Executing second move:', result.bestMove);
        chessControllerRef.current.applyLocalMove({ from, to, promotion });
      }
    });
  }, [chessGame, queueEvaluation]);

  // --- Main Stockfish Move Function ---
  const makeStockfishMove = useCallback(() => {
    if (!stockfishRef.current || !isStockfishReady) {
      console.log('[useStockfish] Stockfish not ready');
      return;
    }
    
    if (chessGame.isGameOver() || clock?.isTimeout?.()) {
      console.log('[useStockfish] Game over or timeout');
      return;
    }
    
    if (chessGame.turn() !== 'b') {
      console.log('[useStockfish] Not black\'s turn');
      return;
    }
    
    if (isSearchingRef.current || isPlayingDoubleMoveRef.current) {
      console.log('[useStockfish] Already searching or playing double-move');
      return;
    }
    
    const controller = chessControllerRef.current;
    const movesInTurn = controller.movesInTurn;
    const levelConfig = ENGINE_LEVELS[skillLevel] || ENGINE_LEVELS[5];
    
    console.log('[useStockfish] makeStockfishMove called. movesInTurn:', movesInTurn, 'level:', skillLevel);
    
    if (movesInTurn === 0) {
      // FIRST MOVE: Evaluate all possible first moves and pick best combo
      evaluateAllFirstMoves(levelConfig);
    } else if (movesInTurn === 1) {
      // SECOND MOVE: Just search for best move directly
      playSecondMove(levelConfig);
    }
  }, [chessGame, clock, skillLevel, isStockfishReady, evaluateAllFirstMoves, playSecondMove]);

  return {
    stockfishRef,
    isStockfishReady,
    chessGame,
    makeStockfishMove,
    isPlayingDoubleMove,
  };
}
