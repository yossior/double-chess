import { useState, useMemo, useEffect } from "react";
import { Chessboard, chessColumnToColumnIndex, fenStringToPositionObject } from "react-chessboard";
import PromotionModal from "./PromotionModal";
import usePremoves from "../hooks/usePremoves";

export default function Board({ chess, mode = "local", opponent, clock, viewIndex, onNavigate }) {
  const [showAnimations, setShowAnimations] = useState(true);
  const isOnline = mode === "online";
  const myColor = chess.playerColor ?? "w"; 
  const boardOrientation = isOnline ? (myColor === "w" ? "white" : "black") : "white";
  const isMyTurn = isOnline ? chess.turn === (opponent?.playerColor ?? chess.playerColor) : chess.turn === "w";

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
    makeEngineMove: opponent?.makeEngineMove
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

  // Automatic Engine Trigger for Double Move
  useEffect(() => {
    if (mode === "local" && !isMyTurn && !chess.chessGame.isGameOver()) {
       // Double check it's really not my turn (in case of race conditions)
       // isMyTurn is derived from chess.turn === chess.playerColor
       // If chess.turn is correct, this is safe.
       
       const timer = setTimeout(() => {
         opponent?.makeEngineMove?.();
       }, 1000);
       return () => clearTimeout(timer);
    }
  }, [mode, isMyTurn, chess.chessGame, opponent, chess.movesInTurn]);

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