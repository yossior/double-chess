import { useEffect } from "react";
import Board from "./Board";
import { useOnlineGame } from "../hooks/useOnlineGame";

/**
 * Online board owns the socket lifecycle (useOnlineGame)
 * startFinding: parent signals that Controls requested a find before mount
 */
export default function OnlineBoard({
  chess,          // <--- Destructure chess
  startFinding,
  onStartedFinding,
  clock,
  ...props        // <--- Catch history props
}) {
  const online = useOnlineGame(
    chess.chessGameRef,
    chess.setChessPosition,
    chess.setMoveHistory,
    chess.setHistoryIndex,
    chess.setTurn,
    chess.playerColor,
    chess.setPlayerColor,
    clock
  );

  // When parent told us to start finding, call findOnlineGame once socket connects
  useEffect(() => {
    if (!startFinding) return;
    if (!online) return;

    if (online.isConnected) {
      online.findOnlineGame();
      onStartedFinding?.();
      return;
    }
    // when online.isConnected flips to true, this effect re-runs and will call findOnlineGame
  }, [startFinding, online?.isConnected, online, onStartedFinding]);

  return (
    <div className="flex flex-col gap-4">
      <Board
        chess={chess}       // <--- Pass it down!
        mode="online"
        // opponent={...} // pass your online opponent object/functions here
        clock={clock}
        {...props}          // <--- Pass history props
      />
      {/* Any online specific UI (like "Searching..." status) */}
    </div>
  );
}
