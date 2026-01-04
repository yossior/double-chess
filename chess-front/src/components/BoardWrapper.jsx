import { useEffect, useState, useCallback } from "react"; // Import hooks

import Controls from "./Controls";
import Board from "./Board";
import GameInfo from "./GameInfo";
import PlayFriend from "./PlayFriend";
import PlayBot from "./PlayBot";
import Rules from "./Rules";
import About from "./About";
import { Toast, useToast } from "./Toast";
import { useChessController } from "../hooks/useChessController";
import { useStockfish } from "../hooks/useStockfish";
import { useOnlineGame } from "../hooks/useOnlineGame";
import ClockView from "./ClockView";
import useClock from "../hooks/useClock";
import MoveHistory from "./MoveHistory";
import { useUser } from "../context/UserContext";

export default function BoardWrapper() {
    const [mode, setMode] = useState(null); // null, "local", "friend" - null means no game started
    const [showPlayFriend, setShowPlayFriend] = useState(false);
    const [showPlayBot, setShowPlayBot] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [startFinding, setStartFinding] = useState(false);
    const [skillLevel, setSkillLevel] = useState(5); // Default to Intermediate (balanced)
    const [playerColor, setPlayerColor] = useState("w"); // Default to White
    const [isUnbalanced, setIsUnbalanced] = useState(true); // Default to Unbalanced
    const [pendingGameId, setPendingGameId] = useState(null); // Track game ID from URL
    const [pendingCreateSettings, setPendingCreateSettings] = useState(null); // Track creator settings if socket not ready
    const [flipBoard, setFlipBoard] = useState(false);
    const [gameOverInfo, setGameOverInfo] = useState(null);
    const [gameStarted, setGameStarted] = useState(false); // Track if game has been started
    const { user } = useUser();
    const { toast, showToast } = useToast();

    // The state controlling which move is shown (null = Live)
    const [viewIndex, setViewIndex] = useState(null);

    const clock = useClock();
    const chess = useChessController(clock, { enableClock: mode === "friend", isUnbalanced });
    const stockfish = useStockfish(chess.chessGame, chess.setChessPosition, chess, chess.setMoveHistory, chess.setHistoryIndex, chess.setTurn, skillLevel, clock, playerColor, isUnbalanced);
    const online = useOnlineGame(
        chess.chessGameRef,
        chess.setChessPosition,
        chess.setMoveHistory,
        chess.setHistoryIndex,
        chess.setTurn,
        chess.playerColor,
        chess.setPlayerColor,
        clock,
        isUnbalanced,
        chess.setMovesInTurn,
        (payload) => {
            setGameOverInfo(payload);
            clock.pause?.();
        }
    );

    // Check URL for game ID on mount
    useEffect(() => {
        // Check for /game/ID format
        const pathMatch = window.location.pathname.match(/^\/game\/([a-z0-9]+)$/);
        const gameId = pathMatch ? pathMatch[1] : null;
        
        if (gameId) {
            // Joining via shared link
            setMode('friend');
            setShowPlayFriend(false);
            setPendingGameId(gameId);
            setGameStarted(true);
        }
    }, []);

    // Join game when online connection is ready and we have a pending game ID
    useEffect(() => {
        if (pendingGameId && online?.isConnected) {
            online.joinSpecificGame(pendingGameId, user?.id);
            setPendingGameId(null); // Clear pending ID after joining
        }

        if (pendingCreateSettings && online?.isConnected) {
            online.joinSpecificGame(
                pendingCreateSettings.gameId,
                user?.id,
                pendingCreateSettings.timeMinutes,
                pendingCreateSettings.incrementSeconds,
                pendingCreateSettings.color
            );
            setPendingCreateSettings(null);
        }
    }, [pendingGameId, pendingCreateSettings, online?.isConnected, online, user?.id]);

    // Pause/clear clocks when leaving friend mode
    useEffect(() => {
        if (mode !== "friend" && clock?.pause) {
            clock.pause();
        }
    }, [mode, clock]);

    // Sync playerColor in local mode
    useEffect(() => {
        if (mode === "local") {
            chess.setPlayerColor(playerColor);
        }
    }, [playerColor, mode, chess]);

    // Auto-reset to "Live" when a real move happens
    useEffect(() => {
        setViewIndex(null);
    }, [chess.chessPosition]);

    // --- NEW: Keyboard Navigation Logic ---
    // In BoardWrapper.jsx

    useEffect(() => {
        function handleKeyDown(e) {
            // Use recorded move history (works for spectators too)
            const maxIndex = chess.moveHistory.length - 1;

            // If no moves have been made, allow Up to go to start, otherwise ignore
            if (maxIndex < 0 && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

            if (e.key === "ArrowLeft") {
                setViewIndex((current) => {
                    // If currently Live (null), jump to previous move
                    if (current === null) return Math.max(-1, maxIndex - 1);
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
    }, [chess.moveHistory]);

    // Clock flag -> treat as game over (timeout)
    useEffect(() => {
        if (!clock.status) return;
        if (!clock.status.includes('flagged')) return;

        const flaggedColor = clock.status.includes('White') ? 'white' : 'black';
        const winner = flaggedColor === 'white' ? 'black' : 'white';
        setGameOverInfo({ reason: 'timeout', winner });

        // If we are the player who flagged in online mode, notify server by resigning
        if (mode === 'friend' && online?.resign) {
            if ((flaggedColor === 'white' && chess.playerColor === 'w') || (flaggedColor === 'black' && chess.playerColor === 'b')) {
                online.resign();
            }
        }
        clock.pause?.();
    }, [clock.status, mode, online, chess.playerColor]);
    // --------------------------------------

    const gameStatus = chess.chessGame.isCheckmate() ? "Checkmate!" : chess.chessGame.isDraw() ? "Draw!" : chess.chessGame.isCheck() ? "Check!" : clock.status !== "" ? clock.status : "";
    const isMyTurn = chess ? (chess.turn === chess.playerColor) : false;

    function handleSelectMode(newMode) {
        if (newMode === 'friend') {
            setShowPlayFriend(true);
            setShowPlayBot(false);
        } else if (newMode === 'local') {
            setShowPlayBot(true);
            setShowPlayFriend(false);
        }
    }

    function handleStartBotGame(settings) {
        setShowPlayBot(false);
        setMode("local");
        setGameOverInfo(null);
        setFlipBoard(false);
        setGameStarted(true);
        
        // Reset URL
        window.history.pushState({}, '', '/');
        
        // Apply bot game settings
        setPlayerColor(settings.color);
        setSkillLevel(settings.skillLevel);
        setIsUnbalanced(settings.isUnbalanced);
        
        // Reset the game with new settings
        chess.resetGame();
    }

    function handleStartFriendGame(settings) {
        setMode("friend");
        setShowPlayFriend(false);
        setGameOverInfo(null);
        setFlipBoard(false);
        setGameStarted(true);
        
        // Update URL without time/increment parameters
        window.history.pushState({}, '', `/game/${settings.gameId}`);
        
        // Initialize game with friend settings
        chess.setPlayerColor(settings.color);
        clock.reset({ initialSeconds: settings.timeMinutes * 60 });
        
        // Join/create online game with the gameId, passing the desired color
        if (online?.isConnected) {
            online.joinSpecificGame(settings.gameId, user?.id, settings.timeMinutes, settings.incrementSeconds, settings.color);
        } else {
            setPendingCreateSettings(settings);
        }
    }

    const handleOnlineStarted = useCallback(() => {
        setStartFinding(false);
    }, []);

    function handleResign() {
        if (mode === "friend" && online) {
            online.resign();
        }
        // Don't reset - keep the final position visible
    }

    // Game over modal handler for local checkmates (not emitted via socket)
    useEffect(() => {
        if (gameOverInfo) return;
        if (mode !== 'local') return;
        if (chess.chessGame.isGameOver()) {
            let reason = 'game over';
            let winner = null;
            if (chess.chessGame.isCheckmate()) {
                reason = 'checkmate';
                winner = chess.turn === 'w' ? 'black' : 'white';
            } else if (chess.chessGame.isDraw()) {
                reason = 'draw';
                winner = null;
            }
            setGameOverInfo({ reason, winner });
        }
    }, [mode, chess.chessGame, chess.turn, gameOverInfo]);

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

    // Add beforeunload warning when there's an active game
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            // Only show warning if game is active (not completed)
            if ((mode === 'friend' || mode === 'ai') && !gameOverInfo) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [mode, gameOverInfo]);



    const defaultOrientation = (online?.isSpectator)
        ? 'white'
        : (mode === 'friend'
            ? (chess.playerColor === 'w' ? 'white' : 'black')
            : (chess.playerColor === 'w' ? 'white' : 'black'));

    const orientationOverride = flipBoard
        ? (defaultOrientation === 'white' ? 'black' : 'white')
        : null;

    const boardProps = {
        viewIndex,
        onNavigate: setViewIndex,
        orientationOverride,
    };

    const statusBanner = gameOverInfo
        ? (gameOverInfo.winner 
            ? `${gameOverInfo.winner.charAt(0).toUpperCase() + gameOverInfo.winner.slice(1)} wins by ${gameOverInfo.reason}` 
            : (gameOverInfo.reason === 'draw' ? 'Draw' : `Draw by ${gameOverInfo.reason}`))
        : (clock.status || gameStatus || 'Game in progress');

    // Helper to get clock times during history navigation
    const getHistoricalClockTime = (player) => {
        // If viewing history and move has timing info, show clock at that move
        if (viewIndex !== null && viewIndex >= 0) {
            const move = chess.moveHistory[viewIndex];
            if (move && typeof move === 'object') {
                const whiteAtMove = move.whiteMs;
                const blackAtMove = move.blackMs;
                if (whiteAtMove !== undefined && blackAtMove !== undefined) {
                    return player === 'player'
                        ? (online?.isSpectator ? whiteAtMove : (chess.playerColor === "w" ? whiteAtMove : blackAtMove))
                        : (online?.isSpectator ? blackAtMove : (chess.playerColor === "w" ? blackAtMove : whiteAtMove));
                }
            }
        }
        // Show live time
        return player === 'player' 
            ? (online?.isSpectator ? clock.whiteMs : (chess.playerColor === "w" ? clock.whiteMs : clock.blackMs))
            : (online?.isSpectator ? clock.blackMs : (chess.playerColor === "w" ? clock.blackMs : clock.whiteMs));
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <Toast toast={toast} />
            
            {/* PlayFriend Modal Overlay */}
            {showPlayFriend && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPlayFriend(false)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <PlayFriend 
                            onStartGame={handleStartFriendGame} 
                            onBack={() => setShowPlayFriend(false)}
                            onCopyLink={() => showToast('Link copied to clipboard!')}
                            initialIsUnbalanced={isUnbalanced}
                        />
                    </div>
                </div>
            )}

            {/* PlayBot Modal Overlay */}
            {showPlayBot && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPlayBot(false)}>
                    <div onClick={(e) => e.stopPropagation()}>
                        <PlayBot 
                            onStartGame={handleStartBotGame} 
                            onBack={() => setShowPlayBot(false)}
                            initialSkillLevel={skillLevel}
                            initialPlayerColor={playerColor}
                            initialIsUnbalanced={isUnbalanced}
                        />
                    </div>
                </div>
            )}

            {/* Rules Modal Overlay */}
            {showRules && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowRules(false)}>
                    <div className="my-8" onClick={(e) => e.stopPropagation()}>
                        <button 
                            onClick={() => setShowRules(false)}
                            className="mb-4 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/30"
                        >
                            ← Back to Game
                        </button>
                        <Rules />
                    </div>
                </div>
            )}

            {/* About Modal Overlay */}
            {showAbout && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowAbout(false)}>
                    <div className="my-8" onClick={(e) => e.stopPropagation()}>
                        <button 
                            onClick={() => setShowAbout(false)}
                            className="mb-4 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/30"
                        >
                            ← Back to Game
                        </button>
                        <About />
                    </div>
                </div>
            )}

            {/* Top Navigation Bar */}
            <div className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 px-4 py-3 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <h1 
                        className="text-lg font-semibold text-white cursor-pointer hover:text-slate-300 transition-colors"
                        onClick={() => {
                            setMode(null);
                            setGameStarted(false);
                            setShowPlayFriend(false);
                            window.history.pushState({}, '', '/');
                            chess.resetGame();
                        }}
                    >
                        Double-Move Chess
                    </h1>
                    <div className="flex gap-3 items-center">
                        <button
                            onClick={() => setFlipBoard((f) => !f)}
                            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-all"
                        >
                            Flip
                        </button>
                        {/* Copy Link Button for Friend Mode */}
                        {mode === "friend" && online?.waiting && (
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    showToast('Link copied to clipboard!');
                                }}
                                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white text-sm font-medium rounded-lg transition-all"
                            >
                                Copy Link
                            </button>
                        )}
                        <button 
                            onClick={() => setShowRules(true)}
                            className="text-slate-400 hover:text-white text-sm transition-colors"
                        >
                            Rules
                        </button>
                        <button 
                            onClick={() => setShowAbout(true)}
                            className="text-slate-400 hover:text-white text-sm transition-colors"
                        >
                            About
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-2 md:p-4 flex flex-col lg:flex-row gap-2 md:gap-4 items-start justify-center w-full">
            {/* LEFT PANEL */}
            <div className="flex flex-col w-full lg:w-64 gap-2 md:gap-4 order-3 lg:order-1">
                <Controls
                    onSelectMode={handleSelectMode}
                />
                <GameInfo
                    mode={mode}
                    gameStatus={gameStatus}
                    isMyTurn={isMyTurn}
                    turn={chess.turn}
                    movesInTurn={chess.movesInTurn}
                    isUnbalanced={isUnbalanced}
                    playerColor={chess.playerColor}
                    onResign={handleResign}
                    waiting={online?.waiting}
                    isSpectator={online?.isSpectator}
                    winnerInfo={gameOverInfo}
                    onCopyLink={() => {
                        navigator.clipboard.writeText(window.location.href);
                        showToast('Link copied to clipboard!');
                    }}
                />
            </div>

            {/* CENTER PANEL: BOARD */}
            <div className="flex-none max-w-[560px] w-full order-1 lg:order-2">
                <Board
                    chess={chess}
                    mode={mode}
                    opponent={mode === "friend" ? online : stockfish}
                    clock={clock}
                    gameStarted={gameStarted}
                    {...boardProps}
                />
            </div>

            {/* RIGHT PANEL: CLOCKS + HISTORY */}
            <div className="flex flex-col w-full lg:w-64 gap-2 md:gap-4 order-2 lg:order-3">
                {mode === "friend" ? (
                    <>
                        {/* Opponent/Top clock */}
                        <ClockView 
                            timeMs={getHistoricalClockTime('opponent')} 
                            label={online?.isSpectator ? "Black" : (chess.playerColor === "w" ? "Black" : "White")} 
                        />
                        
                        <MoveHistory
                            moves={chess.moveHistory}
                            viewIndex={viewIndex}
                            onNavigate={setViewIndex}
                        />
                        
                        {/* Player/Bottom clock */}
                        <ClockView 
                            timeMs={getHistoricalClockTime('player')} 
                            label={online?.isSpectator ? "White" : (chess.playerColor === "w" ? "White" : "Black")} 
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

        {gameOverInfo && !gameOverInfo.dismissed && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setGameOverInfo({...gameOverInfo, dismissed: true})}>
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl p-8 w-[360px] text-center space-y-6 border border-slate-700" onClick={(e) => e.stopPropagation()}>
                    <div className="text-5xl">
                        {gameOverInfo.winner ? '🏆' : '🤝'}
                    </div>
                    <h3 className="text-2xl font-bold text-white">Game Over</h3>
                    <p className="text-lg text-slate-300">
                        {gameOverInfo.winner
                            ? `${gameOverInfo.winner.charAt(0).toUpperCase() + gameOverInfo.winner.slice(1)} wins by ${gameOverInfo.reason}`
                            : (gameOverInfo.reason === 'draw' ? 'Draw' : `Draw by ${gameOverInfo.reason}`)}
                    </p>
                    <button
                        className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-indigo-500/30"
                        onClick={() => setGameOverInfo({...gameOverInfo, dismissed: true})}
                    >
                        Continue
                    </button>
                </div>
            </div>
        )}
        </div>
    );
}