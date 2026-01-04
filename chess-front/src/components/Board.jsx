import { useState, useMemo, useEffect } from "react";
import { Chessboard, chessColumnToColumnIndex, fenStringToPositionObject } from "react-chessboard";
import PromotionModal from "./PromotionModal";
import usePremoves from "../hooks/usePremoves";

export default function Board({ chess, mode = "local", opponent, clock, viewIndex, onNavigate }) {
  const [showAnimations, setShowAnimations] = useState(true);
  const isOnline = mode === "online";
  const myColor = chess.playerColor ?? "w"; 
  const boardOrientation = isOnline ? (myColor === "w" ? "white" : "black") : "white";
  
  // For double-move chess, we need to consider both turn and movesInTurn
  // In local mode: human is white, AI is black
  // Human's turn: chess.turn === "w" (regardless of movesInTurn)
  // AI's turn: chess.turn === "b" (regardless of movesInTurn)
  const isMyTurn = isOnline 
    ? chess.turn === myColor 
    : chess.turn === "w"; // In local mode, human is always white

  // Access raw history array
  const gameHistory = chess.moveHistory;
  
  // Determine if we are looking at the live/latest board state
  const isAtLatestPosition = viewIndex === null || viewIndex === gameHistory.length - 1;

  const { premoves, addPremove, clearPremoves } = usePremoves({
    chessGame: chess.chessGame,
    chessController: chess,
    clock,
    isAtLatestPosition,
    isMyTurn,
    opponent,
    onNavigate,
    viewIndex,
    makeStockfishMove: opponent?.makeStockfishMove
  });

  // 1. COMPUTE THE BASE FEN (String)
  // We prefer strings for the Chessboard prop to ensure animations work smoothly.
  const currentFen = useMemo(() => {
    // If we are live, just use the current chessPosition from state
    if (viewIndex === null) {
      return chess.chessPosition;
    }
    
    // If browsing history, use the FEN stored in the move object
    return gameHistory[viewIndex]?.fen || chess.chessPosition;
  }, [viewIndex, chess.chessPosition, gameHistory]);

  // 2. COMPUTE FINAL POSITION (String or Object)
  // If we have premoves, we MUST convert to object to "hack" the visual state.
  // Otherwise, we pass the FEN string directly.
  const finalPosition = useMemo(() => {
    // Only apply premoves if we are at the latest position
    if (isAtLatestPosition && premoves.length > 0) {
      const positionObj = fenStringToPositionObject(currentFen, 8, 8);
      
      // Apply premoves visually
      for (const premove of premoves) {
        // Remove piece from source
        delete positionObj[premove.sourceSquare];
        // Add piece to target
        positionObj[premove.targetSquare] = { 
          pieceType: premove.piece.pieceType 
        };
      }
      return positionObj;
    }

    // Default: Return the clean FEN string (Best for animations)
    return currentFen;
  }, [currentFen, premoves, isAtLatestPosition]);


  // Premove logic now handled by `usePremoves` hook (applies premoves when appropriate).

  // Automatic Stockfish Trigger for AI Move
  useEffect(() => {
    // Only trigger if:
    // 1. We're in AI mode (local with Stockfish opponent)
    // 2. It's NOT the human's turn (black's turn)
    // 3. The game is not over
    // 4. We're at the live position (not browsing history)
    // 5. Stockfish is not currently playing a double-move
    const isPlayingDoubleMove = opponent?.isPlayingDoubleMove;
    if (mode === "local" && opponent && !isMyTurn && !chess.chessGame.isGameOver() && viewIndex === null && !isPlayingDoubleMove) {
       // Use shorter delay for second move of turn (movesInTurn === 1)
       const delay = chess.movesInTurn === 1 ? 300 : 800;
       const timer = setTimeout(() => {
         opponent?.makeStockfishMove?.();
       }, delay);
       return () => clearTimeout(timer);
    }
  }, [mode, isMyTurn, chess.chessGame, chess.movesInTurn, opponent, viewIndex, opponent?.isPlayingDoubleMove]);

  function handleMove({ from, to, promotion }) {
    if (chess.chessGame.isGameOver() || clock.isTimeout()) return;
    if (viewIndex !== null) onNavigate(null); // Snap to live

    const move = chess.applyLocalMove({ from, to, promotion });
    if (!move) return;

    if (isOnline) {
      opponent?.sendMoveOnline?.({ from: move.from, to: move.to, promotion: move.promotion });
    }
  }

  function canDragPiece({ piece }) {
    // Only allow drag if we are at the latest position and it's our color
    if (!isAtLatestPosition) return false;
    return piece.pieceType[0] === myColor;
  }

  // --- Visuals ---
  const squareStyles = {};
  if (isAtLatestPosition) {
    for (const premove of premoves) {
      squareStyles[premove.sourceSquare] = { backgroundColor: 'rgba(255,0,0,0.2)' };
      squareStyles[premove.targetSquare] = { backgroundColor: 'rgba(255,0,0,0.2)' };
    }
  }

  function onSquareRightClick() {
    clearPremoves();
    setShowAnimations(false);
    setTimeout(() => setShowAnimations(true), 50);
  }

  function onSquareClick({ square, piece }) {
    if (!isAtLatestPosition) return; // Disable clicks in history
    if (!isMyTurn) return;

    if (chess.moveFrom === square) {
      chess.setMoveFrom("");
      chess.setOptionSquares({});
      return;
    }

    if (!chess.moveFrom && piece) {
      const hasMoves = chess.getMoveOptions(square);
      if (hasMoves) chess.setMoveFrom(square);
      return;
    }

    if (chess.moveFrom) {
      const moves = chess.chessGame.moves({ square: chess.moveFrom, verbose: true });
      const found = moves.find((m) => m.to === square);
      if (!found) {
        const hasMoves = chess.getMoveOptions(square);
        chess.setMoveFrom(hasMoves ? square : "");
        return;
      }

      if (found.flags.includes("p")) {
        chess.setPromotionMove({ sourceSquare: chess.moveFrom, targetSquare: square });
      } else {
        handleMove({ from: chess.moveFrom, to: square });
      }

      chess.setMoveFrom("");
      chess.setOptionSquares({});
    }
  }

  function onPieceDrop({ piece, sourceSquare, targetSquare }) {
    if (!isAtLatestPosition) return false;

    const pieceColor = piece.pieceType[0]; 
    if (chess.chessGame.turn() !== pieceColor) {
      const newPremove = { sourceSquare, targetSquare, piece };
      addPremove(newPremove);
      return true;
    }

    const moves = chess.chessGame.moves({ square: sourceSquare, verbose: true });
    const isPromotion = moves.find((m) => m.to === targetSquare && m.flags.includes("p"));

    if (isPromotion) {
      chess.setPromotionMove({ sourceSquare, targetSquare, piece });
      return false; 
    }

    // Snap to live
    if (viewIndex !== null) onNavigate(null);

    const move = chess.applyLocalMove({ from: sourceSquare, to: targetSquare });

    if (!move) return false;

    if (isOnline) {
      opponent?.sendMoveOnline?.(move);
    }
    return true;
  }

  function onPromotionPieceSelect(piece) {
    const cfg = {
      from: chess.promotionMove.sourceSquare,
      to: chess.promotionMove.targetSquare,
      promotion: piece,
    };
    handleMove(cfg);
    chess.setPromotionMove(null);
  }

  const squareWidth = document.querySelector(`[data-column="a"][data-row="1"]`)?.getBoundingClientRect()?.width ?? 0;
  const promotionSquareLeft = chess.promotionMove?.targetSquare
    ? squareWidth * chessColumnToColumnIndex(chess.promotionMove.targetSquare.match(/^[a-z]+/)?.[0] ?? "", 8, "white")
    : 0;

  return (
    <div className="flex gap-6 items-start">
      <div className="relative">
        {isAtLatestPosition && (
          <PromotionModal
            promotionMove={chess.promotionMove}
            squareWidth={squareWidth}
            promotionSquareLeft={promotionSquareLeft}
            onSelect={onPromotionPieceSelect}
            onClose={() => chess.setPromotionMove(null)}
          />
        )}
        <Chessboard
          options={{
            canDragPiece,
            // Pass string (FEN) normally, or Object if using premoves
            position: finalPosition, 
            onSquareClick,
            onPieceDrop,
            onSquareRightClick,
            showAnimations,
            // Only show move hints if at latest
            squareStyles: isAtLatestPosition ? { ...chess.optionSquares, ...squareStyles } : {},
            boardOrientation,
          }}
        />
      </div>
    </div>
  );
}