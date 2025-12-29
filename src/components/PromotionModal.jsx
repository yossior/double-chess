import React from "react";
import { defaultPieces } from "react-chessboard";

export default function PromotionModal({
  promotionMove,
  squareWidth,
  promotionSquareLeft,
  onSelect,
  onClose,
}) {
  if (!promotionMove) return null;

  const topOrBottomStyle = promotionMove.targetSquare.includes("8")
    ? { top: 0 }
    : { bottom: 0 };

  return (
    <>
      <div
        data-test="promotion-overlay"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.1)",
          zIndex: 1000,
        }}
      />
      <div
        data-test="promotion-panel"
        style={{
          position: "absolute",
          ...topOrBottomStyle,
          left: promotionSquareLeft,
          backgroundColor: "white",
          width: squareWidth,
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 10px rgba(0,0,0,0.5)",
        }}
      >
        {["q", "r", "n", "b"].map((piece) => (
          <button
            key={piece}
            data-test={`promotion-${piece}`}
            onClick={() => onSelect(piece)}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: "100%",
              aspectRatio: "1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              cursor: "pointer",
            }}
          >
            {defaultPieces[`w${piece.toUpperCase()}`]()}
          </button>
        ))}
      </div>
    </>
  );
}
