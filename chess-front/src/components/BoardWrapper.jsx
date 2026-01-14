import { useEffect, useState, useCallback, useRef } from "react"; // Import hooks

import Controls from "./Controls";
import Board from "./Board";
import GameInfo from "./GameInfo";
import PlayFriend from "./PlayFriend";
import PlayBot from "./PlayBot";
import About from "./About";
import RulesModal from "./RulesModal";
import { Toast, useToast } from "./Toast";
import { useChessController } from "../hooks/useChessController";
import { useMarseillaisEngine } from "../hooks/useMarseillaisEngine";
import { useOnlineGame } from "../hooks/useOnlineGame";
import ClockView from "./ClockView";
import useClock from "../hooks/useClock";
import MoveHistory from "./MoveHistory";
import { logBotGameStarted, logGameCompleted } from "../utils/stats";

export default function BoardWrapper() {
    // Track which game ID we've already attempted to join
    const joinAttemptedRef = useRef(null);
    const [mode, setMode] = useState("local"); // Start with local mode enabled
    const [showPlayFriend, setShowPlayFriend] = useState(false);
    const [showPlayBot, setShowPlayBot] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [showRules, setShowRules] = useState(false);
    const [startFinding, setStartFinding] = useState(false);
    const [skillLevel, setSkillLevel] = useState(2); // Default to Normal (level 2)
    const [playerColor, setPlayerColor] = useState("w"); // Default to White
    const [isUnbalanced, setIsUnbalanced] = useState(true); // Default to Unbalanced
    const [pendingGameId, setPendingGameId] = useState(null); // Track game ID from URL or creation
    const [pendingGameSettings, setPendingGameSettings] = useState(null); // Track game settings (time, color, etc)
    const [flipBoard, setFlipBoard] = useState(false);
    const [gameOverInfo, setGameOverInfo] = useState(null);
    const [gameStarted, setGameStarted] = useState(false); // Game only enabled after explicit start or mode change
    const [isBotGameTimed, setIsBotGameTimed] = useState(false);
    const [botTimeMinutes, setBotTimeMinutes] = useState(3);
    const [botIncrementSeconds, setBotIncrementSeconds] = useState(2);
    const [currentBotGameId, setCurrentBotGameId] = useState(null); // Track current bot game ID for stats
    const { toast, showToast } = useToast();

    // The state controlling which move is shown (null = Live)
    const [viewIndex, setViewIndex] = useState(null);

    const clock = useClock();
    const chess = useChessController(clock, { enableClock: mode === "friend" || isBotGameTimed, isUnbalanced, gameMode: mode });
    const marseillais = useMarseillaisEngine(chess.chessGame, chess.setChessPosition, chess, chess.setMoveHistory, chess.setHistoryIndex, chess.setTurn, skillLevel, clock, playerColor, isUnbalanced, isBotGameTimed ? botIncrementSeconds : 0);
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
        },
        setIsUnbalanced
    );

    // Check URL for game ID on mount and restore active games
    useEffect(() => {
        console.log('[BoardWrapper] Mount effect running');
        
        // First priority: check if there's a game ID in the URL (shared link takes precedence)
        const pathMatch = window.location.pathname.match(/^\/game\/([a-z0-9]+)$/);
        const gameIdFromUrl = pathMatch ? pathMatch[1] : null;
        
        if (gameIdFromUrl) {
            // Joining via shared link (URL takes priority over localStorage)
            console.log('[BoardWrapper] Found game ID in URL:', gameIdFromUrl, 'ts:', Date.now());
            setMode('friend');
            setShowPlayFriend(false);
            setPendingGameId(gameIdFromUrl);
            setGameStarted(true);
            // timestamp for diagnostics: when mount discovered the gameId
            console.log('[BoardWrapper] mount discovery timestamp:', Date.now());
            return; // Don't check localStorage
        }

        // Second priority: check if there's an active friend game in progress (for refresh recovery)
        const activeGame = localStorage.getItem('chess_active_game');
        
        if (activeGame) {
            // Resume active game - this takes priority over URL
            try {
                const gameInfo = JSON.parse(activeGame);
                console.log('[BoardWrapper] Restoring active friend game:', gameInfo);
                setMode('friend');
                setShowPlayFriend(false);
                // For resumed games, use pendingGameId so server can use stored color for reconnection matching
                setPendingGameId(gameInfo.gameId);
                setGameStarted(true);
            } catch (e) {
                console.error('Failed to parse active game info', e);
                localStorage.removeItem('chess_active_game');
            }
            return; // Don't check for bot game
        }

        // Bot games are NOT persisted - page reload resets the game
        console.log('[BoardWrapper] No active game to restore');
    }, []);

    // Join game when online connection is ready and we have a pending game ID
    // Also restore bot games from localStorage
    useEffect(() => {
        console.log('[BoardWrapper] Join effect - pendingGameId:', pendingGameId, 'pendingGameSettings:', pendingGameSettings?.gameId, 'connected:', online?.isConnected);
        
        // NOTE: We do NOT wait for user to load before joining friend games.
        // The user ID is optional - games work for guests too.
        // This prevents 10+ second delays when the /api/users/me request is slow.
        
        // MAIN PATH: Join an online friend game (either creating new or resuming)
        if (pendingGameId && online?.isConnected) {
            // Only attempt the join once per game ID
            if (joinAttemptedRef.current === pendingGameId) {
                console.log('[BoardWrapper] Already attempted to join game', pendingGameId, ', skipping');
                return;
            }
            
            joinAttemptedRef.current = pendingGameId;
            
            let color = null;
            let timeMinutes = null;
            let incrementSeconds = null;
            let isCreator = false; // Track if we're the game creator
            
            // Check if we have settings from the current session (game creation)
            if (pendingGameSettings) {
                color = pendingGameSettings.color;
                timeMinutes = pendingGameSettings.timeMinutes;
                incrementSeconds = pendingGameSettings.incrementSeconds;
                isCreator = true; // We created this game
                console.log('[BoardWrapper] Using pending settings (creator): color=' + color + ', time=' + timeMinutes);
            } else {
                // We're NOT the creator - joining via URL
                // Check if this is a resumed active game (refresh recovery)
                const activeGameInfo = localStorage.getItem('chess_active_game');
                try {
                    const gameInfo = JSON.parse(activeGameInfo || '{}');
                    if (gameInfo.gameId === pendingGameId) {
                        // This is OUR game we're reconnecting to - use our stored color
                        color = gameInfo.color;
                        timeMinutes = gameInfo.timeMinutes;
                        incrementSeconds = gameInfo.incrementSeconds;
                        isCreator = true; // We were the creator, reconnecting
                    }
                } catch (e) {
                    // Ignore parse errors
                }
                
                // Fallback: check stored settings from URL join (same-browser testing)
                // In this case, the stored settings belong to the FIRST player, so we should:
                // 1. Get the opposite color
                // 2. NOT send time settings (let server use existing game's settings)
                if (!color) {
                    const storedSettings = localStorage.getItem(`chess_game_${pendingGameId}`);
                    try {
                        const settings = JSON.parse(storedSettings || '{}');
                        // Use opposite color since we're the second player
                        if (settings.color) {
                            color = settings.color === 'w' ? 'b' : 'w';
                        }
                        // DON'T set timeMinutes/incrementSeconds - we're joining, not creating
                    } catch (e) {
                        // Ignore parse errors
                    }
                }
            }
            
            // Only send time settings if we're the game creator
            // This prevents the server from creating a new game when we're trying to join
            const joinTimeMinutes = isCreator ? timeMinutes : null;
            const joinIncrementSeconds = isCreator ? incrementSeconds : null;
            
            console.log('[BoardWrapper] Joining game:', pendingGameId, 'color:', color, 'time:', joinTimeMinutes, 'isCreator:', isCreator, 'ts:', Date.now());
            // diagnostic: timestamp when issuing join request
            console.log('[BoardWrapper] join request timestamp:', Date.now());
            online.joinSpecificGame(pendingGameId, null, joinTimeMinutes, joinIncrementSeconds, color);
            // NOTE: Don't clear pendingGameId here - it will be cleared when gameStarted/spectatorJoined is received
            return;
        }

        // BOT GAME PATH: Restore bot game from localStorage
        if (pendingGameSettings?.isBotGame && chess?.chessGame) {
            console.log('[BoardWrapper] Restoring bot game state...');
            try {
                // Load the FEN position
                console.log('[BoardWrapper] Loading FEN:', pendingGameSettings.fen);
                chess.chessGame.load(pendingGameSettings.fen);
                chess.setChessPosition(pendingGameSettings.fen);
                
                // Restore move history
                console.log('[BoardWrapper] Restoring', pendingGameSettings.moveHistory?.length || 0, 'moves');
                chess.setMoveHistory(pendingGameSettings.moveHistory || []);
                chess.setHistoryIndex(null);
                
                // Restore turn based on FEN (turn is already in the FEN)
                chess.setTurn(chess.chessGame.turn());
                
                // Restore movesInTurn
                if (chess.setMovesInTurn) {
                    chess.setMovesInTurn(pendingGameSettings.movesInTurn || 0);
                }
                
                // Restore clock state if timed game
                if (isBotGameTimed && clock?.syncFromServer && pendingGameSettings.whiteMs !== undefined) {
                    console.log('[BoardWrapper] Syncing clock for timed game');
                    clock.syncFromServer(
                        pendingGameSettings.whiteMs,
                        pendingGameSettings.blackMs,
                        chess.chessGame.turn(),
                        { startClock: true }
                    );
                }
                
                console.log('[BoardWrapper] Bot game state restored successfully');
            } catch (e) {
                console.error('[BoardWrapper] Failed to restore bot game state:', e);
            }
            setPendingGameSettings(null);
        }
    }, [pendingGameId, pendingGameSettings, online.isConnected, online.joinSpecificGame, chess.chessGame, chess.setChessPosition, chess.setMoveHistory, chess.setHistoryIndex, chess.setTurn, chess.setMovesInTurn, isBotGameTimed, clock.syncFromServer]);

    // Clear pendingGameId and reset join tracking when the game response is received
    useEffect(() => {
        if (pendingGameId && online?.gameId && online?.gameId === pendingGameId) {
            console.log('[BoardWrapper] Game response received, clearing pending state');
            setPendingGameId(null);
            setPendingGameSettings(null);
            joinAttemptedRef.current = null;
        }
    }, [pendingGameId, online?.gameId]);

    // Handle game not found errors - reset state and show message
    useEffect(() => {
        if (online?.error?.code === 'GAME_NOT_FOUND') {
            console.log('[BoardWrapper] Game not found error, resetting state');
            setPendingGameId(null);
            setPendingGameSettings(null);
            joinAttemptedRef.current = null;
            setGameStarted(false);
            setMode('local');
            showToast('Game not found. It may have been deleted or expired.');
            // Clear the URL if it had a game ID
            if (window.location.pathname.startsWith('/game/')) {
                window.history.replaceState({}, '', '/');
            }
            online.clearError();
        }
    }, [online?.error, online?.clearError, showToast]);

    // Set gameStarted when entering a game mode
    useEffect(() => {
        // Game shows as started in friend mode when we have a game ID (waiting or playing)
        if (mode === 'friend' && online?.gameId) {
            console.log('[BoardWrapper] Setting gameStarted=true for friend mode');
            setGameStarted(true);
        }
    }, [mode, online?.gameId]);
    useEffect(() => {
        if (mode !== "friend" && !isBotGameTimed && clock?.pause) {
            clock.pause();
        }
    }, [mode, isBotGameTimed, clock]);

    // Sync playerColor in local mode
    useEffect(() => {
        if (mode === "local") {
            chess.setPlayerColor(playerColor);
        }
    }, [playerColor, mode, chess]);

    // Trigger engine move when it should play first (engine is White, player is Black)
    useEffect(() => {
        if (mode !== "local") return;
        if (playerColor !== 'b') return; // Only when player is Black
        if (chess.moveHistory.length > 0) return; // Only at game start
        if (!marseillais?.isReady) return;
        
        // Check if it's actually the engine's turn (white's turn when player is black)
        if (chess.chessGame.turn() === 'w') {
            console.log('[BoardWrapper] Triggering initial engine move (Player is Black)');
            const timer = setTimeout(() => {
                if (marseillais?.makeEngineMove) {
                    marseillais.makeEngineMove();
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [mode, playerColor, chess.moveHistory.length, marseillais?.isReady, chess.chessGame]);

    // Auto-reset to "Live" when a real move happens
    useEffect(() => {
        setViewIndex(null);
    }, [chess.chessPosition]);

    // Determine if a friend game is actively in progress (disable mode buttons)
    // Only disable during online friend games, not during bot games
    const isGameActive = (mode === "friend" && gameStarted && !gameOverInfo);

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

    // Sync bot game moves to server for disconnect tracking
    useEffect(() => {
        if (mode !== 'local' || !currentBotGameId) return;
        
        // Use moveHistory state instead of chess.js history() because
        // chess.js history is cleared when load(fen) is called during game restoration
        const moves = (chess.moveHistory || []).map(m => m.san);
        const fen = chess.chessGameRef.current?.fen() || '';
        
        // Notify server of the current game state (only if moves have been made)
        if (moves.length > 0) {
            online.notifyBotGameMove(currentBotGameId, moves, fen);
        }
    }, [chess.moveHistory, mode, currentBotGameId, online]);

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
        
        // Log timeout for bot games (friend games are logged server-side)
        if (mode === 'local') {
            logGameCompleted(currentBotGameId, 'timeout', winner, true, {
                moves: chess.moveHistory.map(m => m.san),
                fen: chess.chessGame.fen()
            });
            // Notify server that bot game ended (server can stop tracking it)
            online.notifyBotGameEnded(currentBotGameId);
            setCurrentBotGameId(null);
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
        // Clear any pending online game state
        setPendingGameId(null);
        setPendingGameSettings(null);
        joinAttemptedRef.current = null;
        
        // Leave any current online game
        if (online?.leaveCurrentGame) {
            online.leaveCurrentGame();
        }
        
        setShowPlayBot(false);
        setShowPlayFriend(false); // Also close friend modal just in case
        setMode("local");
        setGameOverInfo(null);
        setFlipBoard(false);
        setGameStarted(true);
        
        // Reset URL
        window.history.pushState({}, '', '/');
        
        // Apply bot game settings
        setSkillLevel(settings.skillLevel);
        setIsUnbalanced(settings.isUnbalanced);
        setIsBotGameTimed(settings.isTimed || false);
        setBotTimeMinutes(settings.timeMinutes || 3);
        setBotIncrementSeconds(settings.incrementSeconds || 2);
        
        if (settings.isTimed) {
            clock.reset({ initialSeconds: (settings.timeMinutes || 3) * 60 });
        }
        
        // Reset the game with new settings
        chess.resetGame({ keepClock: settings.isTimed });
        
        // COLOR NORMALIZATION: Use 'w'/'b' internally for all logic
        const shortColor = settings.color === 'white' || settings.color === 'w' ? 'w' : 'b';
        
        // Set player color AFTER resetGame (which resets it to 'w')
        setPlayerColor(shortColor);
        chess.setPlayerColor(shortColor);
        
        // Start the clock if the engine (White) moves first
        if (settings.isTimed && shortColor === 'b') {
            clock.start('w');
        }
        
        // Log bot game started for analytics and capture the game ID
        logBotGameStarted(settings.skillLevel, shortColor, settings.isUnbalanced).then(gameId => {
            setCurrentBotGameId(gameId);
            // Notify server about bot game start for disconnect tracking
            online.notifyBotGameStarted(gameId, settings.skillLevel, shortColor, settings.isUnbalanced);
        });
    }

    function handleStartFriendGame(settings) {
        // Always close the modal first
        setShowPlayFriend(false);
        
        // Check if socket is connected before trying to create a game
        if (!online?.isConnected) {
            showToast('Connection lost. Please wait and try again.');
            return;
        }
        
        // Leave any current game first (cleanup old game rooms and state)
        if (online?.leaveCurrentGame) {
            online.leaveCurrentGame();
        }
        
        setMode("friend");
        setGameOverInfo(null);
        setFlipBoard(false);
        // Don't set gameStarted=true yet - wait for waitingForOpponent or gameStarted event
        
        // Update URL without time/increment parameters
        window.history.pushState({}, '', `/game/${settings.gameId}`);
        
        // Store game settings in localStorage for reconnection
        const playerInfo = {
            gameId: settings.gameId,
            timeMinutes: settings.timeMinutes,
            incrementSeconds: settings.incrementSeconds,
            color: settings.color,
            isUnbalanced: settings.isUnbalanced
        };
        localStorage.setItem(`chess_game_${settings.gameId}`, JSON.stringify(playerInfo));
        console.log('[BoardWrapper] Stored player info for reconnection:', playerInfo);
        
        // Reset the game completely
        chess.resetGame();
        
        // Initialize game with friend settings
        chess.setPlayerColor(settings.color);
        setIsUnbalanced(settings.isUnbalanced);
        clock.reset({ initialSeconds: settings.timeMinutes * 60 });
        
        // Set pending settings and game ID - let the join effect handle the actual join
        // This ensures we wait for socket connection before attempting to join
        setPendingGameSettings(settings);
        setPendingGameId(settings.gameId);
    }

    const handleOnlineStarted = useCallback(() => {
        setStartFinding(false);
    }, []);

    function handleResign() {
        if (mode === "friend" && online) {
            online.resign();
        } else if (mode === "local") {
            // In local mode, treat as resignation and set game over
            const winner = chess.turn === 'w' ? 'black' : 'white';
            setGameOverInfo({ reason: 'resignation', winner });
            clock.pause?.();
            
            // Log bot game resignation for analytics with full game data
            logGameCompleted(currentBotGameId, 'resignation', winner, true, {
                moves: chess.moveHistory.map(m => m.san),
                fen: chess.chessGame.fen()
            });
            
            // Notify server that bot game ended (server can stop tracking it)
            online.notifyBotGameEnded(currentBotGameId);
            
            // Clear bot game ID
            setCurrentBotGameId(null);
        }
        // Don't reset - keep the final position visible
    }

    // Bot games are NOT persisted - page reload resets the game
    // (Friend games are still persisted via chess_active_game)

    // Game over modal handler for local checkmates and draws (not emitted via socket)
    useEffect(() => {
        if (gameOverInfo) return;
        if (mode !== 'local') return;
        
        let reason = null;
        let winner = null;
        
        // Check for checkmate or standard draw from chess.js
        if (chess.chessGame.isGameOver()) {
            if (chess.chessGame.isCheckmate()) {
                reason = 'checkmate';
                winner = chess.turn === 'w' ? 'black' : 'white';
            } else if (chess.chessGame.isDraw()) {
                reason = 'draw';
                winner = null;
            }
        }
        
        // Check for Marseillais-specific draw conditions (threefold repetition and 50-move rule)
        if (!reason && chess.drawStatus) {
            if (chess.drawStatus.isRepetition) {
                reason = 'repetition';
                winner = null;
            } else if (chess.drawStatus.isFiftyMove) {
                reason = 'fifty-move';
                winner = null;
            }
        }
        
        if (reason) {
            setGameOverInfo({ reason, winner });
            clock.pause?.();
            
            // Log bot game completion for analytics with full game data
            logGameCompleted(currentBotGameId, reason, winner, true, {
                moves: chess.moveHistory.map(m => m.san),
                fen: chess.chessGame.fen()
            });
            
            // Notify server that bot game ended (server can stop tracking it)
            online.notifyBotGameEnded(currentBotGameId);
            
            // Clear the bot game ID since it's finished
            setCurrentBotGameId(null);
        }
    }, [mode, chess.chessGame, chess.turn, chess.drawStatus, gameOverInfo, clock]);

    useEffect(() => {
        if (!startFinding) return;
        if (!online) return;

        if (online.isConnected) {
            online.findOnlineGame(null);
            handleOnlineStarted();
            return;
        }
        // when online.isConnected flips to true, this effect re-runs and will call findOnlineGame
    }, [startFinding, online?.isConnected, online, handleOnlineStarted]);

    // Stop clocks when game is over in online friend mode
    useEffect(() => {
        if (mode === 'friend' && gameOverInfo) {
            clock.pause();
        }
    }, [gameOverInfo, mode, clock]);

    // Beforeunload warning is not needed for online games since server preserves state
    // Removing it completely to avoid unwanted alerts



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
            ? `${gameOverInfo.winner.charAt(0).toUpperCase() + gameOverInfo.winner.slice(1)} won by ${gameOverInfo.reason}` 
            : (gameOverInfo.reason === 'draw' ? 'Draw' : `Draw by ${gameOverInfo.reason}`))
        : (clock.status || gameStatus || 'Game in progress');

    // Helper to get clock times during history navigation
    const getHistoricalClockTime = (player) => {
        // Apply flip if requested
        const effectivePlayer = flipBoard 
            ? (player === 'player' ? 'opponent' : 'player') 
            : player;

        // If at opening position (viewIndex === -1), show initial time
        if (viewIndex === -1) {
            // Get initial time from clock or use default (3 minutes for friend, botTimeMinutes for bot)
            const initialMs = mode === "friend" 
                ? (clock.initialMs || 180000)  // Default 3 minutes for friend games
                : (isBotGameTimed ? botTimeMinutes * 60 * 1000 : 180000);
            return initialMs;
        }

        // If viewing history and move has timing info, show clock at that move
        if (viewIndex !== null && viewIndex >= 0) {
            const move = chess.moveHistory[viewIndex];
            if (move && typeof move === 'object') {
                const whiteAtMove = move.whiteMs;
                const blackAtMove = move.blackMs;
                if (whiteAtMove !== undefined && blackAtMove !== undefined) {
                    return effectivePlayer === 'player'
                        ? (online?.isSpectator ? whiteAtMove : (chess.playerColor === "w" ? whiteAtMove : blackAtMove))
                        : (online?.isSpectator ? blackAtMove : (chess.playerColor === "w" ? blackAtMove : whiteAtMove));
                }
            }
        }
        // Show live time
        return effectivePlayer === 'player' 
            ? (online?.isSpectator ? clock.whiteMs : (chess.playerColor === "w" ? clock.whiteMs : clock.blackMs))
            : (online?.isSpectator ? clock.blackMs : (chess.playerColor === "w" ? clock.blackMs : clock.whiteMs));
    };

    // Helper for clock labels that account for flip
    const getClockLabel = (position) => {
        const isActuallyTop = position === 'top';
        const showOpponent = flipBoard ? !isActuallyTop : isActuallyTop;

        if (online?.isSpectator) {
            if (showOpponent) {
                return chess.playerColor === "w" ? (online?.opponentNames?.black || "Black") : (online?.opponentNames?.white || "White");
            } else {
                return chess.playerColor === "w" ? (online?.opponentNames?.white || "White") : (online?.opponentNames?.black || "Black");
            }
        }

        if (showOpponent) {
            return chess.playerColor === "w" ? (online?.opponentNames?.black || "Black") : (online?.opponentNames?.white || "White");
        } else {
            return chess.playerColor === "w" ? (online?.opponentNames?.white || "White") : (online?.opponentNames?.black || "Black");
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-800 overflow-hidden">
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
                            initialPlayerColor={playerColor}
                            initialIsUnbalanced={isUnbalanced}
                        />
                    </div>
                </div>
            )}

            {/* Rules Modal Overlay */}
            {showRules && (
                <RulesModal onClose={() => setShowRules(false)} />
            )}

            {/* About Modal Overlay */}
            {showAbout && (
                <About onClose={() => setShowAbout(false)} />
            )}

            {/* Top Navigation Bar */}
            <div className="flex-shrink-0 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 px-2 py-1 md:px-4 md:py-3 z-40 shadow-lg shadow-slate-900/50 w-full">
                <div className="flex justify-between items-center gap-1 md:gap-2 whitespace-nowrap min-w-0">
                    <h1 
                        className="text-base md:text-2xl lg:text-3xl font-bold bg-linear-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent cursor-pointer hover:from-blue-300 hover:to-purple-300 transition-all min-w-0 truncate leading-tight"
                        style={{ fontSize: 'clamp(1rem, 6vw, 1.8rem)' }}
                        onClick={() => {
                            // Leave current game but keep socket connected for reuse
                            if (online?.leaveCurrentGame) {
                                online.leaveCurrentGame();
                            }
                            setMode("local");
                            setGameStarted(false);
                            setShowPlayFriend(false);
                            setShowPlayBot(false);
                            setGameOverInfo(null);
                            setFlipBoard(false);
                            setPlayerColor("w");
                            setIsUnbalanced(true);
                            setIsBotGameTimed(false);
                            setPendingGameId(null);
                            setPendingGameSettings(null);
                            joinAttemptedRef.current = null;
                            window.history.pushState({}, '', '/');
                            chess.resetGame();
                            clock?.pause?.();
                        }}
                    >
                        ♟️ Double-Move Chess
                    </h1>  
                    <div className="flex gap-1 md:gap-2 items-center flex-shrink">
                        <button
                            onClick={() => setFlipBoard((f) => !f)}
                            aria-label="Flip board"
                            className="w-7 h-7 p-0 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white text-[12px] font-medium rounded-full transition-colors shadow-sm border border-slate-600/50 flex-shrink-0 flex items-center justify-center md:rounded-md md:px-3 md:py-1 md:w-auto md:h-auto md:gap-2"
                        >
                            <span aria-hidden="true">🔄</span>
                            <span className="hidden md:inline ml-1">Flip Board</span>
                        </button> 
                        {/* Copy Link Button for Friend Mode */}
                        {mode === "friend" && online?.waiting && (
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    showToast('Link copied to clipboard!');
                                }}
                                aria-label="Copy link"
                                className="w-7 h-7 p-0 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-[12px] font-medium rounded-full transition-colors shadow-sm hover:shadow-sm border border-emerald-500/30 flex-shrink-0 flex items-center justify-center md:rounded-md md:px-3 md:py-1 md:w-auto md:h-auto md:gap-2"
                            >
                                <span aria-hidden="true">📋</span>
                                <span className="hidden md:inline ml-1">Copy link</span>
                            </button>
                        )} 
                        <button 
                            onClick={() => setShowAbout(true)}
                            aria-label="About"
                            className="w-7 h-7 p-0 bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white text-[12px] font-medium rounded-full transition-colors shadow-sm hover:shadow-sm border border-slate-600/50 flex-shrink-0 flex items-center justify-center md:rounded-md md:px-3 md:py-1 md:w-auto md:h-auto md:gap-2"
                        >
                            <span aria-hidden="true">ℹ️</span>
                            <span className="hidden md:inline ml-1">About</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-1 md:p-4 flex flex-col lg:flex-row gap-1 md:gap-4 items-start w-full">
                {/* LEFT PANEL */}
                <div className="flex flex-col w-full lg:w-64 gap-2 md:gap-4 order-2 lg:order-1 px-2 md:px-0">
                <Controls
                    onSelectMode={handleSelectMode}
                    onShowRules={() => setShowRules(true)}
                    disabled={isGameActive}
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
                    opponentNames={online?.opponentNames}
                    winnerInfo={gameOverInfo}
                    moveHistory={chess.moveHistory}
                    drawOffer={online?.drawOffer}
                    drawOfferSent={online?.drawOfferSent}
                    onOfferDraw={online?.offerDraw}
                    onAcceptDraw={online?.acceptDraw}
                    onDeclineDraw={online?.declineDraw}
                    onCopyLink={() => {
                        navigator.clipboard.writeText(window.location.href);
                        showToast('Link copied to clipboard!');
                    }}
                />
            </div>

            {/* CENTER PANEL: BOARD */}
            <div className="flex flex-col lg:flex-row gap-2 md:gap-4 order-1 lg:order-2">
                {/* Mobile Waiting for Opponent Indicator */}
                {mode === "friend" && online?.waiting && !online?.isSpectator && (
                    <div className="lg:hidden w-full px-2 mb-2">
                        <div className="bg-amber-500/20 border border-amber-500/40 rounded-xl p-3 backdrop-blur-sm">
                            <div className="text-amber-300 font-semibold mb-2 text-center text-sm">⏳ Waiting for opponent...</div>
                            <div className="text-xs text-amber-200 mb-3 text-center">Share the game link with your friend</div>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    showToast('Link copied to clipboard!');
                                }}
                                className="w-full py-2 px-4 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white font-semibold text-sm rounded-lg transition-all shadow-lg border border-amber-500/30"
                            >
                                📋 Copy Game Link
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Top clock - mobile only (only show if timed game and not waiting) */}
                {(mode === "friend" || isBotGameTimed) && !(mode === "friend" && online?.waiting) && (
                    <div className="lg:hidden w-full">
                        <ClockView 
                            timeMs={getHistoricalClockTime('opponent')} 
                            label={getClockLabel('top')} 
                        />
                    </div>
                )}
                
                <div className="w-full max-w-[min(100vw-8px,560px)] lg:max-w-[560px] mx-auto lg:max-h-[560px]">
                    <Board
                        chess={chess}
                        mode={mode}
                        opponent={mode === "friend" ? online : marseillais}
                        clock={clock}
                        gameStarted={gameStarted}
                        incrementSeconds={isBotGameTimed ? botIncrementSeconds : 0}
                        isTimed={mode === "friend" || isBotGameTimed}
                        gameOver={gameOverInfo}
                        {...boardProps}
                    />
                </div>
                
                {/* Bottom clock - mobile only (only show if timed game) */}
                {(mode === "friend" || isBotGameTimed) && (
                    <div className="lg:hidden w-full">
                        <ClockView 
                            timeMs={getHistoricalClockTime('player')} 
                            label={getClockLabel('bottom')} 
                        />
                    </div>
                )}

                {/* Incoming Draw Offer - mobile only */}
                {online?.drawOffer && !online?.isSpectator && (
                    <div className="lg:hidden w-full px-2">
                        <div className="bg-blue-500/20 border border-blue-500/40 rounded-xl p-3 backdrop-blur-sm">
                            <div className="text-blue-300 font-semibold mb-2 text-center text-sm">🤝 Draw Offered</div>
                            <div className="text-xs text-blue-200 mb-3 text-center">Your opponent offers a draw</div>
                            <div className="flex gap-2">
                                <button
                                    onClick={online?.acceptDraw}
                                    className="flex-1 py-2 px-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold text-sm rounded-lg transition-all shadow-lg border border-green-500/30"
                                >
                                    ✓ Accept
                                </button>
                                <button
                                    onClick={online?.declineDraw}
                                    className="flex-1 py-2 px-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold text-sm rounded-lg transition-all shadow-lg border border-red-500/30"
                                >
                                    ✗ Decline
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Mobile Action Buttons - below the board */}
                {mode && !gameStatus && !online?.isSpectator && (mode === 'friend' || chess.moveHistory?.length > 0) && (
                    <div className="lg:hidden flex gap-2 w-full px-2">
                        {/* Draw Button - only for online friend mode */}
                        {mode === 'friend' && (
                            <button
                                onClick={online?.offerDraw}
                                disabled={gameOverInfo || online?.waiting || !chess.moveHistory?.length || online?.drawOfferSent || online?.drawOffer}
                                className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-all shadow-lg border border-blue-500/30 disabled:border-slate-600"
                            >
                                {online?.drawOfferSent ? '⏳ Sent' : '🤝 Draw'}
                            </button>
                        )}
                        {/* Resign Button - for both friend and bot modes */}
                        <button
                            onClick={handleResign}
                            disabled={gameOverInfo || (mode === 'friend' && online?.waiting) || !chess.moveHistory?.length}
                            className={`${mode === 'friend' ? 'flex-1' : 'w-full'} py-2 px-4 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed disabled:opacity-50 text-white font-semibold text-sm rounded-lg transition-all shadow-lg border border-red-500/30 disabled:border-slate-600`}
                        >
                            🏳️ Resign
                        </button>
                    </div>
                )}
                
                {/* CLOCKS + HISTORY - Right side of board - desktop only */}
                <div className="hidden lg:flex flex-col w-56 h-[560px]">
                    {/* Opponent/Top clock */}
                    {(mode === "friend" || isBotGameTimed) && (
                        <ClockView 
                            timeMs={getHistoricalClockTime('opponent')} 
                            label={getClockLabel('top')} 
                        />
                    )}
                    
                    {/* Move History in the middle - fixed height */}
                    <div className={`h-[400px] ${!(mode === "friend" || isBotGameTimed) ? "h-full" : "my-2"}`}>
                        <MoveHistory
                            moves={chess.moveHistory}
                            viewIndex={viewIndex}
                            onNavigate={setViewIndex}
                        />
                    </div>
                    
                    {/* Player/Bottom clock */}
                    {(mode === "friend" || isBotGameTimed) && (
                        <ClockView 
                            timeMs={getHistoricalClockTime('player')} 
                            label={getClockLabel('bottom')} 
                        />
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: HISTORY (for mobile only) */}
            <div className="flex flex-col w-full lg:hidden gap-2 md:gap-4 order-3 lg:order-3 px-2 md:px-0">
                <MoveHistory
                    moves={chess.moveHistory}
                    viewIndex={viewIndex}
                    onNavigate={setViewIndex}
                />
            </div>
            </div>

        {gameOverInfo && !gameOverInfo.dismissed && (
            <div 
                className="absolute inset-0 bg-black/40 flex items-center justify-center z-50" 
                onClick={() => setGameOverInfo({...gameOverInfo, dismissed: true})}
                onKeyDown={(e) => { if (e.key === 'Enter') setGameOverInfo({...gameOverInfo, dismissed: true}); }}
                tabIndex={0}
                ref={(el) => el?.focus()}
            >
                <div className="bg-slate-800/95 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-[360px] text-center space-y-6 border border-slate-700/50" onClick={(e) => e.stopPropagation()}>
                    <div className="text-6xl animate-bounce">
                        {gameOverInfo.winner ? '🏆' : '🤝'}
                    </div>
                    <h3 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Game Over</h3>
                    <p className="text-lg text-slate-200 font-medium">
                        {gameOverInfo.winner
                            ? `${gameOverInfo.winner.charAt(0).toUpperCase() + gameOverInfo.winner.slice(1)} won by ${gameOverInfo.reason}`
                            : (gameOverInfo.reason === 'draw' ? 'Draw' : `Draw by ${gameOverInfo.reason}`)}
                    </p>
                    <button
                        className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:shadow-blue-500/50 transform hover:scale-105 border border-blue-500/30"
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