import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";

/**
 * Minimal chess controller that exposes a single object (chess).
 * Expand this as needed (move validation UI helpers, PGN export, history, etc).
 */
export function useChessController(clock, { enableClock = true } = {}) {
  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;

  const [chessPosition, setChessPosition] = useState(chessGame.fen());
  const [moveHistory, setMoveHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(null);
  const [turn, setTurn] = useState(chessGame.turn()); // 'w' or 'b'

  const [promotionMove, setPromotionMove] = useState(null);
  const [moveFrom, setMoveFrom] = useState("");
  const [optionSquares, setOptionSquares] = useState({});
  const [playerColor, setPlayerColor] = useState("w");
  const [clockStarted, setClockStarted] = useState(false);
  const [movesInTurn, setMovesInTurn] = useState(0);

  // When any move (local or remote) is recorded, enable clocks (if allowed)
  useEffect(() => {
    if (!enableClock) return;
    if (!clockStarted && moveHistory.length > 0) {
      setClockStarted(true);
    }
  }, [moveHistory.length, clockStarted, enableClock]);

  // Switch clock only after the first move has been made and when clocks are enabled
  useEffect(() => {
    if (!clock?.start) return;
    if (!enableClock) return;
    if (!clockStarted) return;

    const nextTurn = turn === "w" ? "white" : "black";
    clock.start(nextTurn);
  }, [turn, clock, clockStarted, enableClock]);

  // return an object (not destructured) so caller uses chess.someProp
  function getMoveOptions(square) {
    const moves = chessGame.moves({ square, verbose: true });
    if (!moves || moves.length === 0) return false;
    const squares = {};
    moves.forEach((m) => {
      squares[m.to] = { background: "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%" };
    });
    squares[square] = {
      background: 'rgba(255, 255, 0, 0.4)'
    };

    setOptionSquares(squares);
    return true;
  }

  function applyLocalMove({ from, to, promotion }) {
    if (chessGame.isGameOver() || clock.status !== "") return null;
    try {
      const move = chessGame.move({ from, to, promotion });
      if (!move) return null;

      // Double Move Logic
      if (!chessGame.isGameOver()) {
        if (movesInTurn === 0) {
          // First move of the turn
          // If check, turn ends. Otherwise, same player moves again.
          if (move.san.includes('+')) {
            setMovesInTurn(0);
          } else {
            // Flip turn back to the player who just moved
            const fen = chessGame.fen();
            const parts = fen.split(' ');
            // parts[1] is the current active color (which just switched). We want to revert it.
            parts[1] = parts[1] === 'w' ? 'b' : 'w';
            
            // FIX: Clear en-passant target to avoid "Invalid FEN: illegal en-passant square" error.
            // If we flip the turn back, the en-passant target (if any) created by the move 
            // becomes invalid because the active color doesn't match the target rank.
            parts[3] = '-';
            
            const newFen = parts.join(' ');
            chessGame.load(newFen);
            setMovesInTurn(1);
          }
        } else {
          // Second move of the turn
          setMovesInTurn(0);
        }
      } else {
        setMovesInTurn(0);
      }

      const fenAfterMove = chessGame.fen();
      setChessPosition(fenAfterMove);
      
      // Store full move object with FEN for history navigation
      // Note: move.color is who made the move.
      const moveObject = {
        ...move,
        fen: fenAfterMove,
        color: move.color 
      };
      
      setMoveHistory((prev) => [...prev, moveObject]);
      setHistoryIndex(null);
      // IMPORTANT: Use the turn from the game instance, which might have been flipped back
      setTurn(chessGame.turn());
      if (enableClock) setClockStarted(true);
      return move;
    } catch (e) {
      console.warn("invalid move", e);
      return null;
    }
  }

  function resetGame() {
    chessGame.reset();
    setChessPosition(chessGame.fen());
    setMoveHistory([]);
    setHistoryIndex(null);
    setTurn(chessGame.turn());
    setPromotionMove(null);
    setMoveFrom("");
    setOptionSquares({});
    setPlayerColor("w");
    setClockStarted(false);
    setMovesInTurn(0);
    if (clock?.reset) clock.reset();

    console.log("Game reset");

  }

  return {
    // refs & core
    chessGameRef,
    chessGame,

    // state setters/readers
    chessPosition,
    setChessPosition,
    moveHistory,
    setMoveHistory,
    movesInTurn,
    historyIndex,
    setHistoryIndex,
    turn,
    setTurn,

    // UI helpers
    promotionMove,
    setPromotionMove,
    moveFrom,
    setMoveFrom,
    optionSquares,
    setOptionSquares,

    // player color for online play
    playerColor,
    setPlayerColor,

    // helpers
    getMoveOptions,
    applyLocalMove,
    resetGame,
  };
}
