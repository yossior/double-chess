import { useEffect, useRef, useState } from 'react';

/**
 * Configuration map for Engine levels, using ELO and search constraints.
 * The 'skillLevel' prop passed to the hook should be an index (1-10) into this object.
 * * Note: 'skillLevelUCI' is the value sent to 'setoption name Skill Level'.
 */
const ENGINE_LEVELS = {
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


export function useEngine(chessGame, setChessPosition, chessController, setMoveHistory, setHistoryIndex, setTurn, skillLevel, clock) {
  const engineRef = useRef(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  // NEW STATE: To hold all parsed Engine options (Name -> {type, default, raw})
  const [engineOptions, setEngineOptions] = useState({});
  // NEW REF: To temporarily store raw options while processing the 'uci' command
  const rawOptionsRef = useRef([]);
  
  // Keep a ref to the latest chessController to avoid stale closures in the worker callback
  const chessControllerRef = useRef(chessController);
  useEffect(() => {
    chessControllerRef.current = chessController;
  }, [chessController]);


  // --- Initial Setup and Message Handling ---
  useEffect(() => {
    // Using Fairy-Stockfish via a custom worker wrapper
    const engine = new Worker('/stockfish/fairy/fairy-worker.js');
    engineRef.current = engine;

    console.log('[useEngine] Worker created', engine);

    // Custom postMessage wrapper for logging sent commands
    const originalPostMessage = engine.postMessage.bind(engine);
    engine.postMessage = (message) => {
      console.log(`[useEngine] -> worker:`, message);
      originalPostMessage(message);
    };

    engine.onerror = (err) => {
      console.error('[useEngine] Worker error:', err);
    };

    engine.onmessage = (event) => {
      const message = event.data;
      console.log('[useEngine] <- worker:', message);
      
      // LOGIC TO CAPTURE OPTIONS
      if (typeof message === 'string' && message.startsWith('option name')) {
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
        setEngineOptions(options);
        rawOptionsRef.current = []; // Clear the temporary buffer

        // 2. Continue the initialization sequence
        engine.postMessage('isready');
      } else if (message === 'readyok') {
        console.log('[useEngine] readyok received');
        setIsEngineReady(true);
      } else if (message.startsWith('bestmove')) {
        const match = message.match(/bestmove ([a-h][1-8])([a-h][1-8])([qrbn])?/);
        if (match) {
          const from = match[1];
          const to = match[2];
          const promotion = match[3];

          try {
            const moveConfig = { from, to, promotion };
            if (promotion) moveConfig.promotion = promotion;
              console.log('[useEngine] Applying bestmove from worker:', moveConfig);
              // Use the ref to get the latest applyLocalMove (with correct movesInTurn state)
              chessControllerRef.current.applyLocalMove(moveConfig);
          } catch (err) {
            console.warn("Engine move error:", err);
          }
          setTurn(() => chessGame.turn());
        }
      }
      
      // Log important messages that are not spamming 'option name' lines
      if (!message.startsWith('option name')) {
          console.log('[useEngine] message:', message);
      }
    };

    // Send 'uci' command to initiate the engine and gather all options
    engine.postMessage('uci');

    return () => {
      engine.terminate();
    };
  }, []); // Only run once on mount

  // Make Engine settings and references globally accessible for debugging
  useEffect(() => {
    if (engineRef.current) {
      // Expose the worker object for raw UCI command sending
      window.engine = engineRef.current; 
      // Expose the levels configuration
      window.ENGINE_LEVELS = ENGINE_LEVELS;
      // Expose the dynamically loaded options (updates when setEngineOptions runs)
      window.ENGINE_OPTIONS = engineOptions; 
    }
  }, [engineOptions]);

  // --- Dynamic Skill Level Update (ELO) ---
  useEffect(() => {
    if (engineRef.current && isEngineReady && skillLevel >= 1 && skillLevel <= 10) {
      const levelConfig = ENGINE_LEVELS[skillLevel];
      
      if (!levelConfig) {
        console.error(`Invalid ELO skill level index: ${skillLevel}`);
        return;
      }

      // Check if UCI_Elo / UCI_LimitStrength are supported
      const hasUciElo = engineOptions['UCI_Elo'] !== undefined;
      const hasLimitStrength = engineOptions['UCI_LimitStrength'] !== undefined;
      
      if (hasUciElo && hasLimitStrength) {
        // Use ELO-based configuration
        engineRef.current.postMessage('setoption name UCI_LimitStrength value true');
        engineRef.current.postMessage(`setoption name UCI_Elo value ${levelConfig.uciElo}`);
        engineRef.current.postMessage(`setoption name Skill Level value ${levelConfig.skillLevelUCI}`);
      } else {
        // Fallback to simple Skill Level (0-20)
        // Map 1-10 range to 0-20
        const fallbackSkill = Math.floor(((skillLevel - 1) / 9) * 20);
        console.log(`[useEngine] UCI_Elo not supported. Using Skill Level: ${fallbackSkill}`);
        engineRef.current.postMessage(`setoption name Skill Level value ${fallbackSkill}`);
      }

      engineRef.current.postMessage('isready');
    }
  }, [skillLevel, isEngineReady, engineOptions]);

  // --- Make a Engine move ---
  function makeEngineMove() {
    if (!engineRef.current || !isEngineReady) return;
    if (chessGame.isGameOver() || clock.isTimeout()) return;
    
    // Check if the current skill level is valid
    const levelConfig = ENGINE_LEVELS[skillLevel];
    if (!levelConfig) {
      console.error(`Cannot find configuration for skill level ${skillLevel}.`);
      return;
    }

    // --- "Killer Move" Lookahead for Double Move Mode ---
    // If it's the first move of the turn (movesInTurn === 0), check if we can mate in 1 or 2 moves.
    // This fixes the issue where the engine doesn't know it has a second move.
    if (chessController.movesInTurn === 0) {
        const GameConstructor = chessGame.constructor;
        // Clone the game to search without affecting state
        const tempGame = new GameConstructor(chessGame.fen());
        const moves1 = tempGame.moves({ verbose: true });
        
        for (const m1 of moves1) {
            // 1. Try Move 1
            const result1 = tempGame.move(m1);
            if (!result1) continue; // Should not happen
            
            // Check for immediate mate (Mate in 1)
            if (tempGame.isCheckmate()) {
                console.log("[useEngine] Found Mate in 1 (Double Move Rule):", m1.san);
                chessController.applyLocalMove({ from: m1.from, to: m1.to, promotion: m1.promotion });
                return;
            }

            // If Move 1 gives check, turn ends (Marseillais rule). 
            // So we can't play a second move. We stop here for this branch.
            if (tempGame.inCheck()) {
                tempGame.undo();
                continue;
            }

            // 2. Try Move 2 (if Move 1 was not check)
            const moves2 = tempGame.moves({ verbose: true });
            for (const m2 of moves2) {
                const result2 = tempGame.move(m2);
                if (tempGame.isCheckmate()) {
                    console.log("[useEngine] Found Mate in 2 (Double Move Rule):", m1.san, "then", m2.san);
                    // Play the first move of the sequence. The engine will be called again for the second.
                    chessController.applyLocalMove({ from: m1.from, to: m1.to, promotion: m1.promotion });
                    return;
                }
                tempGame.undo();
            }
            tempGame.undo();
        }
    }
    // ----------------------------------------------------

    engineRef.current.postMessage(`position fen ${chessGame.fen()}`);

    // Levels 1-3 (Handicap Zone): Use constrained search depth and time
    if (skillLevel >= 1 && skillLevel <= 3) {
      // Use both depth and a short movetime to ensure a quick, shallow search
      engineRef.current.postMessage(`go depth ${levelConfig.depth} movetime ${levelConfig.moveTime}`);
    } else {
      // Levels 4-10 (UCI Elo Zone): Use movetime for a more consistent ELO-based search
      engineRef.current.postMessage(`go movetime ${levelConfig.moveTime}`);
    }
  }

  return {
    engineRef,
    isEngineReady,
    chessGame,
    makeEngineMove
  };
}
