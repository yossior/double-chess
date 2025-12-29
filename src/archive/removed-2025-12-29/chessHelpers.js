export function chessColumnToColumnIndex(column, boardSize = 8, orientation = "white") {
  const columns = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const index = columns.indexOf(column);
  if (index === -1) return 0;
  return orientation === "white" ? index : boardSize - 1 - index;
}

export function getGameStatus(chessGame) {
  if (chessGame.isCheckmate()) return "Checkmate!";
  if (chessGame.isDraw()) return "Draw!";
  if (chessGame.isStalemate()) return "Stalemate!";
  if (chessGame.isThreefoldRepetition()) return "Draw by repetition!";
  if (chessGame.isInsufficientMaterial()) return "Draw - insufficient material!";
  if (chessGame.isCheck()) return "Check!";
  return "";
}

// ============================================
// HELPER: Format move history for display
// ============================================
export function formatMoveHistory(moveHistory) {
  const formatted = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moveHistory[i];
    const blackMove = moveHistory[i + 1] || "";
    formatted.push({
      number: moveNumber,
      white: whiteMove,
      black: blackMove,
    });
  }
  return formatted;
}

// ============================================
// HELPER: Get turn display text
// ============================================
export function getTurnDisplay(turn, isMyTurn, isOnline, playerColor) {
  const turnColor = turn === "w" ? "White" : "Black";
  
  if (!isOnline) {
    return isMyTurn 
      ? `Your turn (${turnColor})` 
      : `Opponent's turn (${turnColor})`;
  }

  const myColor = playerColor === "w" ? "White" : "Black";
  return isMyTurn 
    ? `Your turn (${myColor})` 
    : `Opponent's turn (${turnColor})`;
}

// ============================================
// HELPER: Calculate board orientation
// ============================================
export function getBoardOrientation(isOnline, playerColor) {
  if (!isOnline) return "white";
  return playerColor === "w" ? "white" : "black";
}