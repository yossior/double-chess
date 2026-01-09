import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Chess } from "chess.js";

/**
 * Minimal chess controller that exposes a single object (chess).
 * Expand this as needed (move validation UI helpers, PGN export, history, etc).
 */
export function useChessController(clock, { enableClock = true, isUnbalanced = true, gameMode = "local" } = {}) {
  const chessGameRef = useRef(new Chess());
  const chessGame = chessGameRef.current;
  const [initialFen, setInitialFen] = useState(chessGame.fen());
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
  const movesInTurnRef = useRef(0);
  const [resigned, setResigned] = useState(null); // Track resignation

  // return an object (not destructured) so caller uses chess.someProp
  const getMoveOptions = useCallback((square) => {
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
  }, [chessGame]);

  const applyLocalMove = useCallback(({ from, to, promotion }, { recordHistory = true } = {}) => {
    if (chessGame.isGameOver() || clock.status !== "" || resigned) return null;
    try {
      const prevMovesInTurn = movesInTurnRef.current;
      const move = chessGame.move({ from, to, promotion });
      if (!move) return null;

      // Double Move Logic
      // In balanced mode: white's first turn is single move only, then double moves for everyone
      // In unbalanced mode: always double moves
      const totalMoves = moveHistory.length; // moves before this one
      const isFirstTurnBalanced = !isUnbalanced && totalMoves === 0 && move.color === 'w';
      
      if (!chessGame.isGameOver()) {
        if (isFirstTurnBalanced) {
          // Balanced mode, first turn - white only gets 1 move
          movesInTurnRef.current = 0;
          setMovesInTurn(0);
        } else if (movesInTurnRef.current === 0) {
          // First move of the turn (double move applies)
          // If check, turn ends. Otherwise, same player moves again.
          if (move.san.includes('+')) {
            movesInTurnRef.current = 0;
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
            movesInTurnRef.current = 1;
            setMovesInTurn(1);
          }
        } else {
          // Second move of the turn
          movesInTurnRef.current = 0;
          setMovesInTurn(0);
        }
      } else {
        movesInTurnRef.current = 0;
        setMovesInTurn(0);
      }

      const fenAfterMove = chessGame.fen();
      setChessPosition(fenAfterMove);
      
      if (recordHistory) {
        // Store full move object with FEN for history navigation
        // Note: move.color is who made the move.
        const moveObject = {
          ...move,
          fen: fenAfterMove,
          color: move.color 
        };
        setMoveHistory((prev) => [...prev, moveObject]);
      }
      setHistoryIndex(null);
      // IMPORTANT: Use the turn from the game instance, which might have been flipped back
      const newTurn = chessGame.turn();
      setTurn(newTurn);
      
      if (enableClock && gameMode === "local") {
        setClockStarted(true);
        // Start or switch clock on every move for local/bot games
        if (clock && clock.start) {
          console.log('[ChessController] Local clock transition to:', newTurn);
          clock.start(newTurn);
        }
      }

      // Attach moves-in-turn metadata to the move object so callers can act on exact transition
      move._movesInTurn = { prev: prevMovesInTurn, current: movesInTurnRef.current };

      return move;
    } catch (e) {
      console.warn("invalid move", e);
      return null;
    }
  }, [chessGame, moveHistory.length, isUnbalanced, enableClock, clock.status, resigned]);

  const resetGame = useCallback(({ keepClock = false } = {}) => {
    chessGame.reset();
    const startFen = chessGame.fen();
    setInitialFen(startFen);
    setChessPosition(startFen);
    setMoveHistory([]);
    setHistoryIndex(null);
    setTurn(chessGame.turn());
    setPromotionMove(null);
    setMoveFrom("");
    setOptionSquares({});
    setPlayerColor("w");
    setClockStarted(false);
    setMovesInTurn(0);
    setResigned(null);
    if (!keepClock && clock?.reset) clock.reset();

    console.log("Game reset");
  }, [chessGame, clock]);

  const resign = useCallback((color) => {
    setResigned(color);
    if (clock?.pause) clock.pause();
    console.log(`${color === "w" ? "White" : "Black"} resigned`);
  }, [clock]);

  // Wrap return object in useMemo to prevent infinite dependency loops
  return useMemo(() => ({
    // refs & core
    chessGameRef,
    chessGame,

    // state setters/readers
    chessPosition,
    setChessPosition,
    moveHistory,
    setMoveHistory,
    movesInTurn,
    setMovesInTurn,
    historyIndex,
    setHistoryIndex,
    turn,
    setTurn,
    resigned,

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
    resign,

    // initial position reference for history navigation
    initialFen,
  }), [chessGameRef, chessGame, chessPosition, moveHistory, movesInTurn, historyIndex, turn, resigned, promotionMove, moveFrom, optionSquares, playerColor, getMoveOptions, applyLocalMove, resetGame, resign, initialFen]);
}
