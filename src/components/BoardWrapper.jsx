import { useEffect, useState, useCallback } from "react"; // Import hooks

import Controls from "./Controls";
import Board from "./Board";
import GameInfo from "./GameInfo";
import { useChessController } from "../hooks/useChessController";
import { useStockfish } from "../hooks/useStockfish";
import { useOnlineGame } from "../hooks/useOnlineGame";
import ClockView from "./ClockView";
import useClock from "../hooks/useClock";
import MoveHistory from "./MoveHistory";

export default function BoardWrapper() {
    const [mode, setMode] = useState("local");
    const [startFinding, setStartFinding] = useState(false);
    const [skillLevel, setSkillLevel] = useState(1);

    // The state controlling which move is shown (null = Live)
    const [viewIndex, setViewIndex] = useState(null);

    const clock = useClock();
    const chess = useChessController(clock);
    const stockfish = useStockfish(chess.chessGame, chess.setChessPosition, chess, chess.setMoveHistory, chess.setHistoryIndex, chess.setTurn, skillLevel, clock);
    const online = useOnlineGame(
        chess.chessGameRef,
        chess.setChessPosition,
        chess.setMoveHistory,
        chess.setHistoryIndex,
        chess.setTurn,
        chess.playerColor,
        chess.setPlayerColor
    );

    // Auto-reset to "Live" when a real move happens
    useEffect(() => {
        setViewIndex(null);
    }, [chess.chessPosition]);

    // --- NEW: Keyboard Navigation Logic ---
    // In BoardWrapper.jsx

    useEffect(() => {
        function handleKeyDown(e) {
            // Get current history to determine boundaries
            const history = chess.chessGame.history();
            const maxIndex = history.length - 1; // e.g., if 1 move exists, maxIndex is 0

            // If no moves have been made, ignore keys
            if (maxIndex < 0) return;

            if (e.key === "ArrowLeft") {
                setViewIndex((current) => {
                    // FIX: If currently Live (null), skip the "last move" (which is what we are seeing)
                    // and go straight to the one before it.
                    if (current === null) return Math.max(-1, maxIndex - 1);

                    // Normal navigation
                    return Math.max(-1, current - 1);
                });
            } else if (e.key === "ArrowRight") {
                setViewIndex((current) => {
                    if (current === null) return null;     // Already at Live
                    if (current >= maxIndex) return null;  // From Last Move -> Live
                    return current + 1;
                });
            } else if (e.key === "ArrowUp") {
                setViewIndex(-1); // Go to Start
            } else if (e.key === "ArrowDown") {
                setViewIndex(null); // Go to Live
            }
        }

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [chess.chessGame, chess.chessPosition]); // Added chessPosition so maxIndex updates when moves happen
    // --------------------------------------

    const gameStatus = chess.chessGame.isCheckmate() ? "Checkmate!" : chess.chessGame.isDraw() ? "Draw!" : chess.chessGame.isCheck() ? "Check!" : clock.status !== "" ? clock.status : "";
    const isMyTurn = chess ? (chess.turn === chess.playerColor) : false;

    const { start: startClock } = clock;

    useEffect(() => {
        // Start the clock on mount using a stable name to avoid TDZ/conflicts
        startClock();
    }, [startClock]);

    function handleFindOnline() {
        setMode("online");
        setStartFinding(true);
    }

    const handleOnlineStarted = useCallback(() => {
        setStartFinding(false);
    }, []);

    function handleExitOnline() {
        setMode("local");
        setStartFinding(false);
    }

    useEffect(() => {
        if (!startFinding) return;
        if (!online) return;

        if (online.isConnected) {
            online.findOnlineGame();
            handleOnlineStarted();
            return;
        }
        // when online.isConnected flips to true, this effect re-runs and will call findOnlineGame
    }, [startFinding, online?.isConnected, online, handleOnlineStarted]);



    const boardProps = {
        viewIndex,
        onNavigate: setViewIndex
    };

    return (
        <div className="p-4 flex flex-row gap-4 items-start justify-center">
            {/* LEFT PANEL */}
            <div className="flex flex-col w-64 gap-4">
                <Controls
                    mode={mode}
                    isOnline={mode === "online"}
                    onFindOnline={handleFindOnline}
                    onExitOnline={handleExitOnline}
                    skillLevel={skillLevel}
                    setSkillLevel={setSkillLevel}
                    resetGame={chess.resetGame}
                />
                <GameInfo
                    isOnline={mode === "online"}
                    gameStatus={gameStatus}
                    isMyTurn={isMyTurn}
                    turn={chess.turn}
                />
            </div>

            {/* CENTER PANEL: BOARD */}
            <div className="flex-none max-w-[560px] w-full">
                <Board
                    chess={chess}
                    mode={mode}
                    opponent={mode === "online" ? online : stockfish}
                    clock={clock}
                    {...boardProps}
                />
            </div>

            {/* RIGHT PANEL: CLOCK + HISTORY */}
            <div className="flex flex-col w-64 gap-2">
                <ClockView timeMs={clock.blackMs} label="Black" />
                <ClockView timeMs={clock.whiteMs} label="White" />

                <MoveHistory
                    moves={chess.chessGame.history({ verbose: true })}
                    viewIndex={viewIndex}
                    onNavigate={setViewIndex}
                />
            </div>
        </div>
    );
}