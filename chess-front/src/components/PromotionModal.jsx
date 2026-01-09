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
          backgroundColor: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
        }}
      />
      <div
        data-test="promotion-panel"
        style={{
          position: "absolute",
          ...topOrBottomStyle,
          left: promotionSquareLeft,
          backgroundColor: "#1e293b",
          borderColor: "#475569",
          borderWidth: "2px",
          borderStyle: "solid",
          width: squareWidth,
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 0 20px rgba(0,0,0,0.8), 0 0 40px rgba(59,130,246,0.4)",
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
