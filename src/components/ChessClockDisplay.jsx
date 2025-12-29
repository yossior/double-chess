// ChessClockDisplay.jsx
import React from "react";

function fmtTime({ minutes, seconds }) {
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function ChessClockDisplay({ clock }) {
  // clock is the object returned by useChessClock
  const w = clock.getWhite();
  const b = clock.getBlack();

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>White</div>
        <div style={{ fontSize: 18, fontWeight: "bold" }}>{fmtTime(w)}</div>
      </div>

      <div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Black</div>
        <div style={{ fontSize: 18, fontWeight: "bold" }}>{fmtTime(b)}</div>
      </div>
    </div>
  );
}
