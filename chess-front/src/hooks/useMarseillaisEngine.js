import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
// Import worker using Vite's worker import syntax - this bundles all dependencies
// v2 uses high-performance Int8Array mailbox engine with alpha-beta search
import MarseillaisEngineWorker from '../workers/marseillais-engine-v2.worker.js?worker';

const LEVELS = {
  1: { depth: 2, description: 'Easy' },
  2: { depth: 4, description: 'Medium' },
  3: { depth: 6, description: 'Hard' },
};

export function useMarseillaisEngine(
  chessGame,
  setChessPosition,
  chessController,
  setMoveHistory,
  setHistoryIndex,
  setTurn,
  skillLevel,
  clock,
  playerColor = 'w',
  isUnbalanced = true,
  incrementSeconds = 0
) {
  const workerRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlayingDoubleMove, setIsPlayingDoubleMove] = useState(false);
  const pendingRef = useRef(new Map());
  const reqIdRef = useRef(1);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const requestInFlightRef = useRef(false);

  useEffect(() => {
    let worker;
    let terminated = false;

    async function init() {
      try {
        // Use Vite's worker import which properly bundles all dependencies
        worker = new MarseillaisEngineWorker();
        workerRef.current = worker;

        console.log('[useMarseillaisEngine] Initialized worker');

        worker.onmessage = e => {
          const { type, move, requestId, error } = e.data;
          console.log('[useMarseillaisEngine] worker.onmessage', {
            type,
            requestId,
            moveCount: Array.isArray(move) ? move.length : 'n/a',
            move,
          });

          const cb = pendingRef.current.get(requestId);
          if (!cb) return;
          pendingRef.current.delete(requestId);

          if (type === 'bestMove') {
            cb(null, move);
          } else if (type === 'error') {
            cb(new Error(error), null);
          }
        };

        setIsReady(true);
      } catch (err) {
        console.error('[useMarseillaisEngine] Failed to start worker', err);
      }
    }

    init();

    return () => {
      terminated = true;
      if (worker) worker.terminate();
    };
  }, []);

  const makeEngineMove = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const engineColor = playerColor === 'w' ? 'b' : 'w';
    if (chessGame.turn() !== engineColor) {
      console.warn(
        '[useMarseillaisEngine] makeEngineMove called but not engine turn',
        { expected: engineColor, got: chessGame.turn() }
      );
      return;
    }

    if (requestInFlightRef.current) {
      console.log(
        '[useMarseillaisEngine] makeEngineMove suppressed because request already in flight'
      );
      return;
    }

    const depth = (LEVELS[skillLevel] && LEVELS[skillLevel].depth) || 3;
    const fen = chessGame.fen();
    const requestId = reqIdRef.current++;

    console.log(
      '[useMarseillaisEngine] calling engine with skillLevel:',
      skillLevel
    );

    setIsPlayingDoubleMove(true);
    setIsRequestInFlight(true);
    requestInFlightRef.current = true;

    // give more time for higher difficulty levels
    const timeoutMs = skillLevel === 3 ? 30000 : skillLevel === 2 ? 18000 : 12000;

    const timeoutId = setTimeout(() => {
      console.warn(
        '[useMarseillaisEngine] search timeout, clearing isPlayingDoubleMove and request-in-flight',
        { requestId }
      );
      setIsPlayingDoubleMove(false);
      setIsRequestInFlight(false);
      requestInFlightRef.current = false;
      pendingRef.current.delete(requestId);
    }, timeoutMs);

    return new Promise((resolve, reject) => {
      pendingRef.current.set(requestId, async (err, movePair) => {
        clearTimeout(timeoutId);

        if (err) {
          setIsPlayingDoubleMove(false);
          setIsRequestInFlight(false);
          requestInFlightRef.current = false;
          return reject(err);
        }

        if (!movePair || movePair.length === 0) {
          setIsPlayingDoubleMove(false);
          setTimeout(() => {
            setIsRequestInFlight(false);
            requestInFlightRef.current = false;
          }, 1000);
          return resolve(null);
        }

        for (let i = 0; i < movePair.length; i++) {
          const m = movePair[i];
          console.log('[useMarseillaisEngine] processing move', i, ':', m);

          const legalMoves =
            chessController.chessGame.moves({ verbose: true }) || [];
          console.log(
            '[useMarseillaisEngine] legal moves available:',
            legalMoves.length,
            'first few:',
            legalMoves.slice(0, 3).map(l => `${l.san}`)
          );

          const match = legalMoves.find(
            l =>
              l.from === m.from &&
              l.to === m.to &&
              (m.promotion ? l.promotion === m.promotion : true)
          );

          if (!match) {
            const alt = legalMoves.find(
              l => l.san === m.san || l.lan === m.lan
            );
            if (alt) {
              console.warn(
                '[useMarseillaisEngine] using alternate legal move for execution',
                { expected: m, found: alt }
              );
              chessController.applyLocalMove({
                from: alt.from,
                to: alt.to,
                promotion: alt.promotion,
              });
            } else {
              console.error(
                '[useMarseillaisEngine] invalid engine move, skipping',
                {
                  move: m,
                  legalCount: legalMoves.length,
                  legalMoves: legalMoves
                    .slice(0, 5)
                    .map(l => `${l.san}`),
                }
              );
              continue;
            }
          } else {
            chessController.applyLocalMove({
              from: m.from,
              to: m.to,
              promotion: m.promotion,
            });
          }

          await new Promise(r =>
            setTimeout(r, i === 0 ? 200 : 300)
          );
        }

        setIsPlayingDoubleMove(false);
        
        // Apply increment to the engine's clock after completing turn
        // Check if this was the last move of engine's turn (current movesInTurn should be 0)
        const lastMove = chessController.chessGame.history({ verbose: true }).slice(-1)[0];
        const currentMovesInTurn = chessController.movesInTurn;
        
        if (incrementSeconds > 0 && currentMovesInTurn === 0) {
          const engineColor = playerColor === 'w' ? 'black' : 'white';
          console.log('[useMarseillaisEngine] Applying increment to engine', engineColor, { currentMovesInTurn });
          clock?.applyIncrement?.(engineColor, incrementSeconds);
        }
        
        setTimeout(() => {
          setIsRequestInFlight(false);
          requestInFlightRef.current = false;
        }, 1000);

        resolve(movePair);
      });

      // Determine if this is a single-move turn (balanced mode, first turn, white)
      const moveHistoryLength = chessGame.history().length;
      const currentTurn = chessGame.turn();
      const isBalancedFirstTurn = !isUnbalanced && moveHistoryLength === 0 && currentTurn === 'w';
      const maxMoves = isBalancedFirstTurn ? 1 : 2;
      
      console.log('[useMarseillaisEngine] posting findBestMove', {
        requestId,
        skillLevel,
        maxMoves,
        isBalancedFirstTurn,
      });
      worker.postMessage({ type: 'findBestMove', fen, skillLevel, requestId, maxMoves });
    });
  }, [
    chessGame, 
    chessController, 
    skillLevel, 
    setChessPosition, 
    setTurn, 
    playerColor, 
    clock, 
    incrementSeconds,
    isUnbalanced
  ]);

  return useMemo(() => ({
    workerRef,
    isReady,
    makeEngineMove,
    isPlayingDoubleMove,
    isRequestInFlight,
  }), [isReady, makeEngineMove, isPlayingDoubleMove, isRequestInFlight]);
}

export default useMarseillaisEngine;