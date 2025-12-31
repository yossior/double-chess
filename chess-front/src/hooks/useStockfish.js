import { useEffect, useRef, useState } from 'react';

/**
 * Configuration map for Stockfish levels, using ELO and search constraints.
 * The 'skillLevel' prop passed to the hook should be an index (1-10) into this object.
 * * Note: 'skillLevelUCI' is the value sent to 'setoption name Skill Level'.
 */
const STOCKFISH_LEVELS = {
  // LEVELS 1-3: Handicap Zone (UCI_Elo low, heavily constrained by Skill Level & Depth/Time)
  // These levels are designed to blunder and play like a true beginner (approx ELO 400-800).
  1: { uciElo: 800, skillLevelUCI: 2, depth: 1, moveTime: 50, approxElo: 400 },
  2: { uciElo: 800, skillLevelUCI: 4, depth: 2, moveTime: 100, approxElo: 600 },
  3: { uciElo: 1000, skillLevelUCI: 6, depth: 3, moveTime: 200, approxElo: 800 },
  
  // LEVELS 4-10: UCI Elo Zone (Full search, constrained by UCI_Elo setting and moveTime)
  // These levels rely on UCI_Elo and search time, with Skill Level set to max (20) to disable intentional blunders.
  4: { uciElo: 1450, skillLevelUCI: 20, depth: 10, moveTime: 1000, approxElo: 1200 },
  5: { uciElo: 1650, skillLevelUCI: 20, depth: 10, moveTime: 1000, approxElo: 1400 },
  6: { uciElo: 1850, skillLevelUCI: 20, depth: 10, moveTime: 1000, approxElo: 1600 },
  7: { uciElo: 2050, skillLevelUCI: 20, depth: 12, moveTime: 1500, approxElo: 1800 },
  8: { uciElo: 2250, skillLevelUCI: 20, depth: 12, moveTime: 1500, approxElo: 2000 },
  9: { uciElo: 2650, skillLevelUCI: 20, depth: 15, moveTime: 2000, approxElo: 2400 },
  10: { uciElo: 3190, skillLevelUCI: 20, depth: 20, moveTime: 3000, approxElo: 3190 }, // Max Strength
};


export function useStockfish(chessGame, setChessPosition, chessController, setMoveHistory, setHistoryIndex, setTurn, skillLevel, clock) {
  const stockfishRef = useRef(null);
  const [isStockfishReady, setIsStockfishReady] = useState(false);
  // NEW STATE: To hold all parsed Stockfish options (Name -> {type, default, raw})
  const [stockfishOptions, setStockfishOptions] = useState({});
  // NEW REF: To temporarily store raw options while processing the 'uci' command
  const rawOptionsRef = useRef([]);


  // --- Initial Setup and Message Handling ---
  useEffect(() => {
    // Note: The path `/stockfish/stockfish-17.1-lite-single-03e3232.js` must be correct
    const stockfish = new Worker('/stockfish/stockfish-17.1-lite-single-03e3232.js');
    stockfishRef.current = stockfish;

    console.log('[useStockfish] Worker created', stockfish);

    // Custom postMessage wrapper for logging sent commands
    const originalPostMessage = stockfish.postMessage.bind(stockfish);
    stockfish.postMessage = (message) => {
      console.log(`[useStockfish] -> worker:`, message);
      originalPostMessage(message);
    };

    stockfish.onmessage = (event) => {
      const message = event.data;
      console.log('[useStockfish] <- worker:', message);
      
      // LOGIC TO CAPTURE OPTIONS
      if (message.startsWith('option name')) {
          // Temporarily store the raw line
          rawOptionsRef.current.push(message);
      }
      
      if (message === 'uciok') {
        // 1. Process and store all captured options in state (single update)
        const options = {};
        rawOptionsRef.current.forEach(rawLine => {
            // Regex to parse key information
            const nameMatch = rawLine.match(/name (.*?) type/);
            const typeMatch = rawLine.match(/type (.*?) default/);
            // The '$' anchor handles options where the default value is the last part
            const defaultMatch = rawLine.match(/default (.*?) (min|max|var|$)/); 

            if (nameMatch) {
                const name = nameMatch[1].trim();
                options[name] = {
                    type: typeMatch ? typeMatch[1].trim() : 'N/A',
                    default: defaultMatch ? defaultMatch[1].trim() : 'N/A',
                    // The raw line is included for complete debug access
                    raw: rawLine 
                };
            }
        });
        setStockfishOptions(options);
        rawOptionsRef.current = []; // Clear the temporary buffer

        // 2. Continue the initialization sequence
        stockfish.postMessage('isready');
      } else if (message === 'readyok') {
        console.log('[useStockfish] readyok received');
        setIsStockfishReady(true);
      } else if (message.startsWith('bestmove')) {
        const match = message.match(/bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
          const from = match[1];
          const to = match[2];
          const promotion = match[3];

          try {
            const moveConfig = { from, to, promotion };
            if (promotion) moveConfig.promotion = promotion;
              console.log('[useStockfish] Applying bestmove from worker:', moveConfig);
              chessController.applyLocalMove(moveConfig);
          } catch (err) {
            console.warn("Stockfish move error:", err);
          }
          setTurn(() => chessGame.turn());
        }
      }
      
      // Log important messages that are not spamming 'option name' lines
      if (!message.startsWith('option name')) {
          console.log('[useStockfish] message:', message);
      }
    };

    // Send 'uci' command to initiate the engine and gather all options
    stockfish.postMessage('uci');

    return () => {
      stockfish.terminate();
    };
  }, []); // Only run once on mount

  // Make Stockfish settings and references globally accessible for debugging
  useEffect(() => {
    if (stockfishRef.current) {
      // Expose the worker object for raw UCI command sending
      window.sf = stockfishRef.current; 
      // Expose the levels configuration
      window.STOCKFISH_LEVELS = STOCKFISH_LEVELS;
      // Expose the dynamically loaded options (updates when setStockfishOptions runs)
      window.STOCKFISH_OPTIONS = stockfishOptions; 
    }
  }, [stockfishOptions]);

  // --- Dynamic Skill Level Update (ELO) ---
  useEffect(() => {
    if (stockfishRef.current && isStockfishReady && skillLevel >= 1 && skillLevel <= 10) {
      const levelConfig = STOCKFISH_LEVELS[skillLevel];
      
      if (!levelConfig) {
        console.error(`Invalid ELO skill level index: ${skillLevel}`);
        return;
      }
      
      // 1. Set the target ELO and enable limit strength
      stockfishRef.current.postMessage('setoption name UCI_LimitStrength value true');
      stockfishRef.current.postMessage(`setoption name UCI_Elo value ${levelConfig.uciElo}`);
      
      // 2. Set the UCI Skill Level option (0-20). Lower values introduce blunders.
      stockfishRef.current.postMessage(`setoption name Skill Level value ${levelConfig.skillLevelUCI}`);

      stockfishRef.current.postMessage('isready');
    }
  }, [skillLevel, isStockfishReady]);

  // --- Make a Stockfish move ---
  function makeStockfishMove() {
    if (!stockfishRef.current || !isStockfishReady) return;
    if (chessGame.isGameOver() || clock.isTimeout()) return;

    // Handle non-standard level 0 for random play (if still desired)
    if (skillLevel === 0) {
      const moves = chessGame.moves({ verbose: true });
      if (moves.length === 0) return;

      const randomMove = moves[Math.floor(Math.random() * moves.length)];
      chessController.applyLocalMove({ from: randomMove.from, to: randomMove.to });
      // const move = chessGame.move({ from: randomMove.from, to: randomMove.to });
      // if (move) {
      //   setChessPosition(chessGame.fen());
      //   setMoveHistory(prev => [...prev, move.san]);
      //   setHistoryIndex(null);
      //   setTurn(() => chessGame.turn());
      // }
      return;
    }
    
    // Check if the current skill level is valid
    const levelConfig = STOCKFISH_LEVELS[skillLevel];
    if (!levelConfig) {
      console.error(`Cannot find configuration for skill level ${skillLevel}.`);
      return;
    }

    stockfishRef.current.postMessage(`position fen ${chessGame.fen()}`);

    // Levels 1-3 (Handicap Zone): Use constrained search depth and time
    if (skillLevel >= 1 && skillLevel <= 3) {
      // Use both depth and a short movetime to ensure a quick, shallow search
      stockfishRef.current.postMessage(`go depth ${levelConfig.depth} movetime ${levelConfig.moveTime}`);
    } else {
      // Levels 4-10 (UCI Elo Zone): Use movetime for a more consistent ELO-based search
      stockfishRef.current.postMessage(`go movetime ${levelConfig.moveTime}`);
    }
  }

  return {
    stockfishRef,
    isStockfishReady,
    chessGame,
    makeStockfishMove
  };
}