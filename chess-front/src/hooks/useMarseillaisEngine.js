import { useEffect, useRef, useState, useCallback } from 'react';

const LEVELS = {
  1: { depth: 2 },
  2: { depth: 2 },
  3: { depth: 3 },
  4: { depth: 3 },
  5: { depth: 4 },
  6: { depth: 4 },
  7: { depth: 5 },
  8: { depth: 5 },
  9: { depth: 6 },
  10: { depth: 7 },
};

export function useMarseillaisEngine(chessGame, setChessPosition, chessController, setMoveHistory, setHistoryIndex, setTurn, skillLevel, clock, playerColor = 'w', isUnbalanced = true) {
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
        worker = new Worker(new URL('../workers/marseillais.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        worker.onmessage = (e) => {
          const { type, move, requestId, error } = e.data;
          console.log('[useMarseillaisEngine] worker.onmessage', { type, requestId, moveCount: Array.isArray(move) ? move.length : 'n/a', move });
          if (type === 'bestMove') {
            const cb = pendingRef.current.get(requestId);
            pendingRef.current.delete(requestId);
            if (cb) cb(null, move);
          } else if (type === 'error') {
            const cb = pendingRef.current.get(requestId);
            pendingRef.current.delete(requestId);
            if (cb) cb(new Error(error), null);
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

  // Make the engine compute and play a move pair
  const makeEngineMove = useCallback(() => {
    const worker = workerRef.current;
    if (!worker) return;

    // Ensure it's actually the engine's turn before requesting a move
    const engineColor = playerColor === 'w' ? 'b' : 'w';
    if (chessGame.turn() !== engineColor) {
      console.warn('[useMarseillaisEngine] makeEngineMove called but not engine turn', { expected: engineColor, got: chessGame.turn() });
      return;
    }

    // Avoid duplicate concurrent requests
    if (requestInFlightRef.current) {
      console.log('[useMarseillaisEngine] makeEngineMove suppressed because request already in flight');
      return;
    }

    const depth = (LEVELS[skillLevel] && LEVELS[skillLevel].depth) || 3;
    const fen = chessGame.fen();
    const requestId = reqIdRef.current++;

    console.log('[useMarseillaisEngine] calling engine with skillLevel:', skillLevel);

    // Set playing flag and request-in-flight immediately to avoid racing the Board scheduler
    setIsPlayingDoubleMove(true);
    setIsRequestInFlight(true);
    requestInFlightRef.current = true;

    // Setup a safety timeout to clear flag if worker doesn't respond (20s for depth 2)
    const timeoutMs = 20000;
    const timeoutId = setTimeout(() => {
      console.warn('[useMarseillaisEngine] search timeout, clearing isPlayingDoubleMove and request-in-flight', { requestId });
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
          // clear in-flight after small debounce to let UI settle
          setTimeout(() => {
            setIsRequestInFlight(false);
            requestInFlightRef.current = false;
          }, 1000);
          return resolve(null);
        }

        // Apply moves sequentially with a short delay to allow UI update
        for (let i = 0; i < movePair.length; i++) {
          const m = movePair[i];
          console.log('[useMarseillaisEngine] processing move', i, ':', m);
          
          // Validate move against current legal moves to avoid invalid-move exceptions
          const legalMoves = chessController.chessGame.moves({ verbose: true }) || [];
          console.log('[useMarseillaisEngine] legal moves available:', legalMoves.length, 'first few:', legalMoves.slice(0, 3).map(l => `${l.san}`));
          const match = legalMoves.find(l => l.from === m.from && l.to === m.to && (m.promotion ? l.promotion === m.promotion : true));
          if (!match) {
            // Try matching by SAN or LAN if provided
            const alt = legalMoves.find(l => l.san === m.san || l.lan === m.lan);
            if (alt) {
              console.warn('[useMarseillaisEngine] using alternate legal move for execution', { expected: m, found: alt });
              chessController.applyLocalMove({ from: alt.from, to: alt.to, promotion: alt.promotion });
            } else {
              console.error('[useMarseillaisEngine] invalid engine move, skipping', { move: m, legalCount: legalMoves.length, legalMoves: legalMoves.slice(0, 5).map(l => `${l.san}`) });
              continue;
            }
          } else {
            // Apply via controller
            chessController.applyLocalMove({ from: m.from, to: m.to, promotion: m.promotion });
          }
          // Update UI state references
          setChessPosition(chessGame.fen());
          setTurn(chessGame.turn());
          await new Promise((r) => setTimeout(r, i === 0 ? 200 : 300));
        }

        setIsPlayingDoubleMove(false);
        // Clear in-flight flags after moves complete (debounced to avoid re-trigger)
        setTimeout(() => {
          setIsRequestInFlight(false);
          requestInFlightRef.current = false;
        }, 1000);
        resolve(movePair);
      });

      console.log('[useMarseillaisEngine] posting findBestMove', { requestId, skillLevel });
      worker.postMessage({ type: 'findBestMove', fen, skillLevel, requestId });
    });
  }, [chessGame, chessController, skillLevel, setChessPosition, setTurn]);

  return {
    workerRef,
    isReady,
    chessGame,
    makeEngineMove,
    isPlayingDoubleMove,
    isRequestInFlight,
  };
}

export default useMarseillaisEngine;
