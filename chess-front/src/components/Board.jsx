import { useState, useMemo, useEffect, useRef } from "react";
import { Chessboard, chessColumnToColumnIndex, fenStringToPositionObject } from "react-chessboard";
import PromotionModal from "./PromotionModal";
import usePremoves from "../hooks/usePremoves";
import { log } from "../utils/debug";

export default function Board({ chess, mode = "local", opponent, clock, viewIndex, onNavigate, orientationOverride, gameStarted = false, incrementSeconds = 2, isTimed = true, gameOver = null }) {
  const [showAnimations, setShowAnimations] = useState(true);
  const isFriend = mode === "friend";
  const isSpectator = isFriend && opponent?.isSpectator;
  const isPracticeMode = mode === "local" && !gameStarted;
  
  // In friend mode, check if opponent is waiting. In practice mode, board is always ready.
  const isGameReady = isFriend ? !opponent?.waiting : (isPracticeMode ? true : gameStarted);
  
  const myColor = chess.playerColor ?? "w"; 
  // Spectators always see from white's perspective
  const baseOrientation = isSpectator ? "white" : (isFriend ? (myColor === "w" ? "white" : "black") : (myColor === "w" ? "white" : "black"));
  const boardOrientation = orientationOverride || baseOrientation;
  
  // For double-move chess:
  // - In friend mode: only play your color
  // - In local mode: only play your color, bot plays the other
  // - In true practice mode (no mode set): play both sides
  const isMyTurn = isSpectator ? false : (isFriend 
    ? chess.turn === myColor 
    : (mode === "local" ? chess.turn === myColor : true));

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

  // Prevent page scrolling when dragging a piece on touch devices
  const touchPreventRef = useRef(false);
  const boardRef = useRef(null);

  function preventTouchMove(e) {
    // Only prevent when this handler is active (added as non-passive)
    e.preventDefault();
  }
  function removeTouchPrevent() {
    if (touchPreventRef.current) {
      document.removeEventListener('touchmove', preventTouchMove);
      touchPreventRef.current = false;
      // restore touch-action on board container
      if (boardRef.current) boardRef.current.style.touchAction = '';
    }
  }
  function addTouchPrevent() {
    if (!touchPreventRef.current) {
      document.addEventListener('touchmove', preventTouchMove, { passive: false });
      touchPreventRef.current = true;
      // set touch-action to none on the container to prevent native scroll on first touch
      if (boardRef.current) boardRef.current.style.touchAction = 'none';
      // Clean up on touch end or cancel (one-shot)
      document.addEventListener('touchend', removeTouchPrevent, { once: true });
      document.addEventListener('touchcancel', removeTouchPrevent, { once: true });
    }
  }

  // 1. COMPUTE THE BASE FEN (String)
  // We prefer strings for the Chessboard prop to ensure animations work smoothly.
  const currentFen = useMemo(() => {
    // If we are live, just use the current chessPosition from state
    if (viewIndex === null) {
      return chess.chessPosition;
    }

    // Jump to starting position
    if (viewIndex === -1) {
      return chess.initialFen;
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

  // Automatic Engine Trigger for AI Move
  useEffect(() => {
    // Engine only triggers in local mode when it is available
    if (mode !== "local" || !opponent?.makeEngineMove) return;
    
    // Always use the turn from the chess instance to ensure we have the most current value
    const currentTurn = chess.chessGame.turn();
    const isEngineTurn = currentTurn !== chess.playerColor;
    const isGameOver = chess.chessGame.isGameOver();
    const isDrawByRepetition = chess.drawStatus?.isRepetition;
    const isDrawByFiftyMove = chess.drawStatus?.isFiftyMove;
    const isBusy = !!(opponent?.isPlayingDoubleMove || opponent?.isRequestInFlight);
    
    // Engine only moves if:
    // 1. It's its turn
    // 2. Game is not over (including draws by repetition or 50-move rule)
    // 3. User is not reviewing historical moves (viewIndex === null)
    // 4. Engine is not already performing another calculation
    if (isEngineTurn && !isGameOver && !isDrawByRepetition && !isDrawByFiftyMove && viewIndex === null && !isBusy) {
      log('[Board] Engine Move Triggered', { 
        turn: currentTurn, 
        playerColor: chess.playerColor,
        gameStarted,
        movesInTurn: chess.movesInTurn,
        isBusy
      });
      
      const delay = chess.movesInTurn === 1 ? 300 : 800;
      const timer = setTimeout(() => {
        // Double-check conditions haven't changed during the delay
        const latestTurn = chess.chessGame.turn();
        if (latestTurn === currentTurn && !chess.chessGame.isGameOver()) {
          log('[Board] Bot moving now...', { latestTurn });
          opponent.makeEngineMove();
        } else {
          log('[Board] Bot move cancelled (state changed)', { latestTurn, currentTurn });
        }
      }, delay);
      
      return () => clearTimeout(timer);
    } else if (isEngineTurn && !isGameOver && viewIndex === null && isBusy) {
      log('[Board] Engine Move skip: Bot is busy');
    }
  }, [
    chess.chessPosition, 
    chess.turn, 
    chess.movesInTurn, 
    chess.playerColor,
    chess.drawStatus,
    gameStarted, 
    mode, 
    viewIndex, 
    opponent?.makeEngineMove,
    opponent?.isPlayingDoubleMove, 
    opponent?.isRequestInFlight
  ]);

  function handleMove({ from, to, promotion }) {
    // Prevent moves if game is over (including draws by repetition or 50-move rule)
    if (gameOver || chess.chessGame.isGameOver() || clock.isTimeout()) return;
    if (chess.drawStatus?.isRepetition || chess.drawStatus?.isFiftyMove) return;
    if (viewIndex !== null) onNavigate(null); // Snap to live

    const oldTurn = chess.chessGame.turn();

    const move = chess.applyLocalMove({ from, to, promotion }, { recordHistory: !isFriend });
    if (!move) return;

    // For timed games in local mode, use precise transition info attached to the move
    // to decide when the turn really ended (avoid relying on state that may not have updated yet)
    const { prev: prevMovesInTurn = null, current: newMovesInTurn = null } = move._movesInTurn || {};

    // Debug logs to trace increment behavior
    log('[Board] handleMove FULL DEBUG', { 
      from, to, promotion, 
      oldTurn, 
      prevMovesInTurn, 
      newMovesInTurn,
      incrementSeconds,
      isFriend,
      hasClockObject: !!clock,
      hasApplyIncrement: !!clock?.applyIncrement,
      metadata: move._movesInTurn,
      fullMove: move
    });

    // Apply increment when the player's turn ended (newMovesInTurn === 0)
    // This covers: second move of double-move, single move in balanced mode, or check ending turn early
    const shouldApplyIncrement = !isFriend && clock && incrementSeconds > 0 && newMovesInTurn === 0;
    log('[Board] Increment check', {
      shouldApplyIncrement,
      isFriend,
      hasClock: !!clock,
      incrementSeconds,
      newMovesInTurn,
      condition1: !isFriend,
      condition2: !!clock,
      condition3: incrementSeconds > 0,
      condition4: newMovesInTurn === 0
    });

    if (shouldApplyIncrement) {
      const playerWhoJustMoved = oldTurn === 'w' ? 'white' : 'black';
      log('[Board] ✅ Applying increment to player', playerWhoJustMoved, { prevMovesInTurn, newMovesInTurn, incrementSeconds });
      clock.applyIncrement(playerWhoJustMoved, incrementSeconds);
      log('[Board] Increment applied, clocks now:', { whiteMs: clock.whiteMs, blackMs: clock.blackMs });
    } else {
      log('[Board] ❌ NOT applying increment');
    }

    if (isFriend) {
      opponent?.sendMoveOnline?.({ from: move.from, to: move.to, promotion: move.promotion });
    }
  }

  function canDragPiece({ piece }) {
    // Cannot drag if game is over
    if (gameOver) return false;
    
    // Cannot drag if game not ready (waiting for opponent in friend mode)
    if (!isGameReady) return false;
    
    // Spectators cannot drag pieces
    if (isSpectator) return false;
    
    // Only allow drag if we are at the latest position and it's our color
    if (!isAtLatestPosition) return false;

    // In true practice mode (no specific mode), allow dragging any piece
    if (!mode) return true;

    // In local/friend mode, only drag your pieces
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
    chess.setOptionSquares({});
    chess.setMoveFrom("");
    setShowAnimations(false);
    setTimeout(() => setShowAnimations(true), 50);
  }

  function onSquareClick({ square, piece }) {
    // Cannot click if game is over
    if (gameOver) return;
    
    // Cannot click if game not ready (waiting for opponent in friend mode)
    if (!isGameReady) return;
    
    // Spectators cannot click squares
    if (isSpectator) return;
    
    if (!isAtLatestPosition) return; // Disable clicks in history
    if (!isMyTurn) return;

    if (chess.moveFrom === square) {
      chess.setMoveFrom("");
      chess.setOptionSquares({});
      return;
    }

    if (!chess.moveFrom) {
      if (piece) {
        const hasMoves = chess.getMoveOptions(square);
        if (hasMoves) {
          chess.setMoveFrom(square);
        } else {
          chess.setOptionSquares({});
        }
      } else {
        // Clicked an empty square with no selection: clear highlights
        chess.setOptionSquares({});
      }
      return;
    }

    if (chess.moveFrom) {
      const moves = chess.chessGame.moves({ square: chess.moveFrom, verbose: true });
      const found = moves.find((m) => m.to === square);
      if (!found) {
        const hasMoves = chess.getMoveOptions(square);
        if (!hasMoves) {
          // Clear highlights when clicking an invalid square
          chess.setOptionSquares({});
        }
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
    // Ensure we remove touch scroll prevention when the drag ends
    removeTouchPrevent();

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
      // Clear highlights when promotion modal is about to show
      chess.setOptionSquares({});
      chess.setMoveFrom("");
      return false; 
    }

    // Use handleMove to ensure increment logic runs
    handleMove({ from: sourceSquare, to: targetSquare });
    
    // Clear any move highlights after a successful piece drop
    chess.setOptionSquares({});
    if (chess.moveFrom) chess.setMoveFrom("");
    
    return true;
  }
  function onPieceDragBegin(piece, sourceSquare) {
    // As soon as the user starts a drag (mousedown on a piece), clear suggested moves
    chess.setOptionSquares({});
    // On touch devices, prevent page scroll while the user drags a piece
    addTouchPrevent();
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
    <div className="flex gap-6 items-start pt-2 pb-4 md:py-0">
      <div 
        ref={boardRef}
        className="relative"
        onMouseDown={() => {
          // INTERACTION REFINEMENT: Clear all visual move suggestions instantly on mouse down
          // (at the start of the click, before mouse up or drag completion)
          if (Object.keys(chess.optionSquares).length > 0) {
            chess.setOptionSquares({});
          }
        }}
        onTouchStart={() => {
          // Clear premoves when user touches the board on mobile
          if (premoves.length > 0) {
            clearPremoves();
          }
          // Note: We don't prevent scrolling here - scrolling is only prevented when
          // the user actually starts dragging a piece (handled in onPieceDragBegin)
        }}
        onTouchEnd={() => removeTouchPrevent()}
        onTouchCancel={() => removeTouchPrevent()}
      >
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
            onPieceDragBegin,
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