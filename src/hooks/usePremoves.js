import { useEffect, useRef, useState } from 'react';

export default function usePremoves({ chessGame, chessController, clock, isAtLatestPosition, isMyTurn, opponent, onNavigate, viewIndex, makeStockfishMove }) {
  const [premoves, setPremoves] = useState([]);
  const premovesRef = useRef([]);

  useEffect(() => {
    if (chessGame.isGameOver() || clock.isTimeout()) {
      setPremoves([]);
      premovesRef.current = [];
      return;
    }

    if (isAtLatestPosition && isMyTurn && premovesRef.current.length > 0) {
      const nextMove = premovesRef.current[0];
      const moveResult = chessController.applyLocalMove({
        from: nextMove.sourceSquare,
        to: nextMove.targetSquare,
        promotion: 'q'
      });

      if (moveResult) {
        if (viewIndex !== null) onNavigate(null); // Snap to live

        if (opponent?.sendMoveOnline) {
          opponent.sendMoveOnline({
            from: moveResult.from,
            to: moveResult.to,
            promotion: moveResult.promotion
          });
        } else {
          // Call Stockfish immediately to keep responsiveness in dev and tests.
          makeStockfishMove?.();
        }

        const remaining = premovesRef.current.slice(1);
        premovesRef.current = remaining;
        setPremoves(remaining);
      } else {
        // invalid premove -> clear
        premovesRef.current = [];
        setPremoves([]);
      }
    }
  }, [chessGame, clock, isAtLatestPosition, isMyTurn, onNavigate, viewIndex, chessController, opponent, makeStockfishMove]);

  function addPremove(p) {
    premovesRef.current = [...premovesRef.current, p];
    setPremoves([...premovesRef.current]);
  }

  function clearPremoves() {
    premovesRef.current = [];
    setPremoves([]);
  }

  return { premoves, premovesRef, addPremove, clearPremoves };
}
