import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { io } from "socket.io-client";

/**
 * useOnlineGame manages a socket connection and provides:
 * - socketRef
 * - isConnected
 * - playerColor
 * - findOnlineGame(userId?)
 * - sendMoveOnline(move)
 *
 * Important: cleanup calls socket.close() so reconnection stops.
 */
export function useOnlineGame(chessGameRef, setChessPosition, setMoveHistory, setHistoryIndex, setTurn, playerColor, setPlayerColor, clock, isUnbalanced = true, setMovesInTurn, onGameOver, setIsUnbalanced) {
  const socketRef = useRef(null);
  const gameIdRef = useRef(null);
  const hasResignedRef = useRef(false);
  const onGameOverRef = useRef(onGameOver);
  
  // Use a ref for all parameters to avoid stale closures in socket event handlers
  const propsRef = useRef({
    setChessPosition,
    setMoveHistory,
    setHistoryIndex,
    setTurn,
    playerColor,
    setPlayerColor,
    clock,
    isUnbalanced,
    setMovesInTurn,
    onGameOver,
    setIsUnbalanced
  });

  // Update propsRef on every render
  propsRef.current = {
    setChessPosition,
    setMoveHistory,
    setHistoryIndex,
    setTurn,
    playerColor,
    setPlayerColor,
    clock,
    isUnbalanced,
    setMovesInTurn,
    onGameOver,
    setIsUnbalanced
  };

  const [waiting, setWaiting] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [opponentNames, setOpponentNames] = useState({ white: 'White', black: 'Black' });
  const [error, setError] = useState(null); // Track connection/game errors
  const initialTime = 300; // Default initial time in seconds

  /**
   * Helper to clear old game data from localStorage
   */
  const clearOldGames = (excludeGameId = null) => {
    if (typeof window === 'undefined') return;
    
    // Find and remove all chess_game_ keys and the main active game key
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      // Clear specific game settings or the active game session
      if (key.startsWith('chess_game_') || key === 'chess_active_game' || key === 'chess_active_bot_game') {
        // Don't remove the key for the game we are currently joining
        if (excludeGameId && key === `chess_game_${excludeGameId}`) continue;
        
        keysToRemove.push(key);
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    if (keysToRemove.length > 0) {
      console.log("🧹 Cleared old game data from localStorage:", keysToRemove);
    }
  };

  // Update ref synchronously on EVERY render (not in an effect)
  onGameOverRef.current = onGameOver;

  useEffect(() => {
    // Reuse existing connected socket (handles React Strict Mode remount)
    // But we still need to set up event handlers each time
    let socket = socketRef.current;
    const isReusingSocket = socket?.connected;
    console.log('[Socket] useEffect start ts:', Date.now());
    
    if (isReusingSocket) {
      console.log("♻️ Reusing existing socket connection:", socket.id, 'ts:', Date.now());
      setIsConnected(true);
    } else {
      // Close any old disconnected socket (defensive, useful for HMR)
      if (socket && !socket.connected) {
        try { socket.close(); } catch (e) { console.warn('socket close error', e); }
      }

      console.log('[Socket] creating IO socket at ts:', Date.now());
      socket = io("http://localhost:5001", {
        reconnection: true,
        reconnectionDelay: 500,      // Start with 500ms delay (default is 1000ms)
        reconnectionDelayMax: 2000,  // Cap at 2 seconds (default is 5000ms)
        timeout: 5000,               // Connection timeout 5 seconds (default is 20000ms)
        transports: ['polling', 'websocket'], // Try polling first for faster initial connection
        upgrade: true,               // Upgrade to websocket after polling connects
      });
      socketRef.current = socket;
    }

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      setIsConnected(true);
      socket.emit("sync_start", { t1_client: Date.now() });
    });

    socket.once("sync_reply", () => {
      const t4_client = Date.now();
      socket.emit("sync_finish", { t4_client });
    });

    socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected", reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connect error:", err);
      setIsConnected(false);
    });

    // server events
    socket.on("waitingForOpponent", ({ gameId, color, whiteMs, blackMs, incrementMs }) => {
      console.log("waiting for opponent", gameId, "assigned color:", color);
      setWaiting(true);
      setGameId(gameId);
      gameIdRef.current = gameId;
      hasResignedRef.current = false;
      
      // Store game info for reconnection on page refresh and for second player to find
      if (typeof window !== 'undefined') {
        // Calculate time in minutes and seconds from milliseconds
        const timeMinutes = whiteMs ? Math.round(whiteMs / 1000 / 60) : 5;
        const incrementSeconds = incrementMs ? Math.round(incrementMs / 1000) : 2;
        
        // Store game settings for second player (and this player's color confirmation)
        const gameSettings = {
          gameId,
          timeMinutes,
          incrementSeconds,
          color, // Include assigned color
          mode: 'friend'
        };
        localStorage.setItem(`chess_game_${gameId}`, JSON.stringify(gameSettings));
        console.log("Stored game settings for waiting game", gameId, gameSettings);
      }
    });

    socket.on("gameStarted", ({ gameId, color, fen, turn, whiteMs, blackMs, incrementMs, serverTime, history, movesInTurn }) => {
      console.log("game started", gameId, color);
      console.log('[Online] gameStarted - clock times:', { whiteMs, blackMs, turn });
      
      // Clear old games but keep this one (since we are joining as a player)
      clearOldGames(gameId);

      setWaiting(false);
      setGameId(gameId);
      gameIdRef.current = gameId;
      hasResignedRef.current = false;
      propsRef.current.setPlayerColor(color);
      setIsSpectator(false);

      // Store game info for reconnection on page refresh
      if (typeof window !== 'undefined') {
        const timeMinutes = Math.round(whiteMs / 1000 / 60);
        const incrementSeconds = incrementMs ? Math.round(incrementMs / 1000) : 2;
        
        localStorage.setItem(`chess_active_game`, JSON.stringify({
          gameId,
          color,
          mode: 'friend',
          timeMinutes,
          incrementSeconds
        }));
      }

      // Store increment (convert ms to seconds)
      if (incrementMs !== undefined && typeof window !== 'undefined') {
        window.gameIncrementSeconds = Math.floor(incrementMs / 1000);
      }

      // Sync clock state from server - DON'T start clock yet, wait for first move
      const { clock: currentClock, setChessPosition: scp, setMoveHistory: smh, setHistoryIndex: shi, setTurn: st, setMovesInTurn: smit } = propsRef.current;
      if (currentClock?.syncFromServer) {
        console.log('[Online] Calling syncFromServer with startClock=false');
        currentClock.syncFromServer(
          typeof whiteMs === 'number' ? whiteMs : initialTime * 1000,
          typeof blackMs === 'number' ? blackMs : initialTime * 1000,
          turn,
          { startClock: false, serverTime }  // Don't start clock yet
        );
      }

      // sync position
      try {
        chessGameRef.current?.load?.(fen);
        scp(fen);
        smh(history || []);
        shi(null);
        st(turn);
        
        // Sync movesInTurn if available
        if (movesInTurn !== undefined && smit) {
          smit(movesInTurn);
        }
      } catch (e) {
        console.warn("failed to load fen", e);
      }
    });

    socket.on("spectatorJoined", ({ gameId, fen, turn, whiteMs, blackMs, incrementMs, serverTime, history, isCompleted, movesInTurn, gameResult, winner, whitePlayer, blackPlayer, isUnbalanced: serverIsUnbalanced }) => {
      console.log("joined as spectator", gameId, "fen:", fen, "history length:", history?.length, "isCompleted:", isCompleted);
      
      // Clear all active game IDs from localStorage when spectating
      clearOldGames();

      const { setChessPosition: scp, setMoveHistory: smh, setHistoryIndex: shi, setTurn: st, setMovesInTurn: smit, clock: c, onGameOver: ogo, setIsUnbalanced: siu } = propsRef.current;
      
      setWaiting(false);
      setGameId(gameId);
      gameIdRef.current = gameId;
      setIsSpectator(true);
      propsRef.current.setPlayerColor(null); // No color for spectators
      
      if (whitePlayer && blackPlayer) {
        setOpponentNames({ white: whitePlayer, black: blackPlayer });
      }
      
      if (serverIsUnbalanced !== undefined && siu) {
        siu(serverIsUnbalanced);
      }

      // Store increment (convert ms to seconds)
      if (incrementMs !== undefined && typeof window !== 'undefined') {
        window.gameIncrementSeconds = Math.floor(incrementMs / 1000);
      }

      // Sync clock state from server
      if (c?.syncFromServer) {
        c.syncFromServer(
          typeof whiteMs === 'number' ? whiteMs : initialTime * 1000,
          typeof blackMs === 'number' ? blackMs : initialTime * 1000,
          turn,
          { startClock: !isCompleted, serverTime }
        );
      }

      // If game is completed, notify the game over handler
      if (isCompleted && ogo) {
        ogo({ reason: gameResult || 'game over', winner: winner || null });
      }

      // For spectators, trust the server-provided history (with FEN) and final FEN
      try {
        const chessGame = chessGameRef.current;
        if (!chessGame) {
          console.error("Chess game not initialized for spectator");
          return;
        }

        chessGame.reset();
        chessGame.load(fen);
        scp(fen);
        smh(history || []);
        shi(null);
        st(turn);

        // Sync movesInTurn for spectators
        if (movesInTurn !== undefined && smit) {
          smit(movesInTurn);
        }
      } catch (e) {
        console.error("failed to load spectator state", e);
      }
    });

    socket.on("moveMade", ({ move, fen, turn, movesInTurn, whiteMs, blackMs, serverTime }) => {
      console.log("move made", move.san);
      console.log('[Online] moveMade - clock times:', { whiteMs, blackMs, turn });
      const { setChessPosition: scp, setMoveHistory: smh, setHistoryIndex: shi, setTurn: st, setMovesInTurn: smit, clock: c } = propsRef.current;
      
      if (!fen) return;
      chessGameRef.current?.load?.(fen);
      scp(fen);
      
      // Store full move object with FEN and clock times for proper history navigation
      if (move) {
        const moveObject = {
          ...move,
          fen: fen,
          whiteMs: whiteMs,
          blackMs: blackMs,
        };
        smh((prev) => [...prev, moveObject]);
      }
      
      shi(null);
      st(turn);
      
      // Update movesInTurn from server
      if (movesInTurn !== undefined && smit) {
        smit(movesInTurn);
      }

      // Sync clock state from server after move (includes starting the clock)
      if (c?.syncFromServer) {
        console.log('[Online] Calling syncFromServer with startClock=true on moveMade');
        c.syncFromServer(whiteMs, blackMs, turn, { startClock: true, serverTime });
      }
    });

    socket.on("opponentMove", (move) => {
      const chessGame = chessGameRef.current;
      if (!chessGame) return;
      chessGame.move(move);
      setChessPosition(chessGame.fen());
      setMoveHistory((prev) => [...prev, move]);
      setHistoryIndex(null);
      setTurn(chessGame.turn());
    });

    socket.on("gameOver", ({ reason, winner }) => {
      console.log("[gameOver] Socket event received:", { reason, winner });
      
      const { onGameOver: callback, clock: c } = propsRef.current;
      console.log("[gameOver] callback type:", typeof callback);
      if (callback) {
        console.log("[gameOver] Calling callback...");
        try {
          callback({ reason, winner });
          console.log("[gameOver] Callback executed successfully");
        } catch (error) {
          console.error("[gameOver] Error calling callback:", error);
        }
      } else {
        console.error("[gameOver] callback is null/undefined!");
      }
      
      // Clean up game state and stored info
      setWaiting(false);
      setGameId(null);
      gameIdRef.current = null;
      
      // Clear all game-related storage on game over
      clearOldGames();
      
      if (c?.pause) c.pause();
    });

    socket.on("error", (msg) => {
      console.error("Server error:", msg);
      
      // Handle specific error codes
      if (msg?.code === 'GAME_NOT_FOUND') {
        setWaiting(false);
        setGameId(null);
        gameIdRef.current = null;
        setError({ code: 'GAME_NOT_FOUND', message: 'Game not found. It may have been deleted or never existed.' });
      }
    });

    // Cleanup: remove listeners and optionally close socket
    return () => {
      console.log("🧹 useOnlineGame cleanup");
      
      // Remove all listeners we added to prevent duplicates on remount
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("waitingForOpponent");
      socket.off("gameStarted");
      socket.off("spectatorJoined");
      socket.off("moveMade");
      socket.off("opponentMove");
      socket.off("gameOver");
      socket.off("error");
      
      // Delay socket close to handle React Strict Mode double-mounting
      // In Strict Mode, the component unmounts and remounts immediately
      setTimeout(() => {
        // Only close if this socket is still the current one (wasn't replaced by remount)
        if (socketRef.current === socket && !socket.connected) {
          console.log("🧹 useOnlineGame: closing stale socket");
          try {
            socket.close();
          } catch (e) {
            console.warn("Error closing socket", e);
          }
          socketRef.current = null;
          setIsConnected(false);
        }
      }, 200); // Small delay to allow React Strict Mode remount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findOnlineGame = useCallback((userId) => {
    const socket = socketRef.current;
    if (!socket) {
      console.error("Socket not initialized");
      return;
    }
    if (!socket.connected) {
      console.error("Socket not connected yet");
      alert("Connection not established yet. Try again in a few seconds.");
      return;
    }
    
    // Clear old game data before starting a new search
    clearOldGames();
    
    console.log("🔍 Finding game...");
    socket.emit("findGame", { userId });
  }, []);

  const joinSpecificGame = useCallback((gameIdToJoin, userId, timeMinutes, incrementSeconds, playerColor) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("Cannot join game: socket not connected");
      return;
    }

    // Clear old game data before joining a new specific game, preserving the current one
    clearOldGames(gameIdToJoin);

    console.log("🔗 Joining specific game:", gameIdToJoin, "with", timeMinutes, "min +", incrementSeconds, "sec", "color:", playerColor);
    socket.emit("joinGame", { gameId: gameIdToJoin, userId, timeMinutes, incrementSeconds, playerColor });
  }, []);

  const sendMoveOnline = useCallback((moveObj) => {
    const socket = socketRef.current;
    const currentGameId = gameIdRef.current;
    if (!socket || !socket.connected) {
      console.error("Cannot send move: socket not connected");
      return;
    }
    socket.emit("move", { move: moveObj, gameId: currentGameId });
  }, []);

  const resign = useCallback(() => {
    const socket = socketRef.current;
    const currentGameId = gameIdRef.current;
    
    // Prevent duplicate resign calls
    if (hasResignedRef.current) {
      console.log('[resign] Already resigned, ignoring duplicate call');
      return;
    }
    
    console.log('[resign] Debug:', { 
      hasSocket: !!socket, 
      isConnected: socket?.connected, 
      gameId: currentGameId 
    });
    if (!socket || !socket.connected || !currentGameId) {
      console.error("Cannot resign: socket not connected or no active game");
      return;
    }
    
    hasResignedRef.current = true;
    socket.emit("resign", { gameId: currentGameId });
  }, []);

  const disconnect = useCallback(() => {
    const socket = socketRef.current;
    if (socket) {
      console.log('🧹 Manual disconnect called');
      try {
        socket.close();
      } catch (e) {
        console.warn('Error closing socket during disconnect:', e);
      }
      socketRef.current = null;
    }
    // Reset all state
    setWaiting(false);
    setGameId(null);
    gameIdRef.current = null;
    setIsSpectator(false);
    setPlayerColor(null);
    setIsConnected(false);
    hasResignedRef.current = false;
  }, []);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Memoize return object to prevent infinite dependency loops in useEffect
  return useMemo(() => ({
    socketRef,
    waiting,
    gameId,
    playerColor,
    isConnected,
    isSpectator,
    opponentNames,
    error,
    findOnlineGame,
    joinSpecificGame,
    sendMoveOnline,
    resign,
    disconnect,
    clearError,
  }), [waiting, gameId, playerColor, isConnected, isSpectator, opponentNames, error, findOnlineGame, joinSpecificGame, sendMoveOnline, resign, disconnect, clearError]);
}
