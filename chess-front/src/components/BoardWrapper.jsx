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
import { useUser } from "../context/UserContext";

export default function BoardWrapper() {
    const [mode, setMode] = useState("local");
    const [startFinding, setStartFinding] = useState(false);
    const [skillLevel, setSkillLevel] = useState(5); // Default to Intermediate (balanced)
    const { user } = useUser();

    // The state controlling which move is shown (null = Live)
    const [viewIndex, setViewIndex] = useState(null);

    const clock = useClock();
    const chess = useChessController(clock, { enableClock: mode === "online" });
    const stockfish = useStockfish(chess.chessGame, chess.setChessPosition, chess, chess.setMoveHistory, chess.setHistoryIndex, chess.setTurn, skillLevel, clock);
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

    // Pause/clear clocks when leaving online mode
    useEffect(() => {
        if (mode !== "online" && clock?.pause) {
            clock.pause();
        }
    }, [mode, clock]);

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
            online.findOnlineGame(user?.id);
            handleOnlineStarted();
            return;
        }
        // when online.isConnected flips to true, this effect re-runs and will call findOnlineGame
    }, [startFinding, online?.isConnected, online, handleOnlineStarted, user]);



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
                    movesInTurn={chess.movesInTurn}
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

            {/* RIGHT PANEL: CLOCKS + HISTORY */}
            <div className="flex flex-col w-64 gap-4">
                {mode === "online" ? (
                    <>
                        {/* Opponent clock at top */}
                        <ClockView 
                            timeMs={chess.playerColor === "w" ? clock.blackMs : clock.whiteMs} 
                            label={chess.playerColor === "w" ? "Black" : "White"} 
                        />
                        
                        <MoveHistory
                            moves={chess.moveHistory}
                            viewIndex={viewIndex}
                            onNavigate={setViewIndex}
                        />
                        
                        {/* Player clock at bottom */}
                        <ClockView 
                            timeMs={chess.playerColor === "w" ? clock.whiteMs : clock.blackMs} 
                            label={chess.playerColor === "w" ? "White" : "Black"} 
                        />
                    </>
                ) : (
                    <>
                        <div className="text-sm text-gray-500 text-center py-2">Untimed game</div>
                        <MoveHistory
                            moves={chess.moveHistory}
                            viewIndex={viewIndex}
                            onNavigate={setViewIndex}
                        />
                    </>
                )}
            </div>
        </div>
    );
}