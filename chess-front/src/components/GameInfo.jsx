/**
 * Minimal game info panel.
 * isMyTurn is a boolean (not a function).
 */
export default function GameInfo({ isOnline, online, gameStatus, isMyTurn, turn }) {
  return (
    <div className="game-info p-2 border rounded">
      <div><strong>Mode:</strong> {isOnline ? "Online" : "Local"}</div>
      {isOnline && <div><strong>Player color:</strong> {online?.playerColor ?? "?"}</div>}
      <div><strong>Turn:</strong> {turn}</div>
      <div><strong>Status:</strong> {gameStatus || "—"}</div>
      <div style={{ marginTop: 6 }}><strong>{isMyTurn ? "Your move" : "Waiting"}</strong></div>
    </div>
  );
}
