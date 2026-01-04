import { useEffect, useRef, useState } from "react";
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
export function useOnlineGame(chessGameRef, setChessPosition, setMoveHistory, setHistoryIndex, setTurn, playerColor, setPlayerColor, clock, isUnbalanced = true, setMovesInTurn, onGameOver) {
  const socketRef = useRef(null);
  const [waiting, setWaiting] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const initialTime = 300; // Default initial time in seconds

  useEffect(() => {
    // Close any old socket (defensive, useful for HMR)
    if (socketRef.current) {
      try { socketRef.current.close(); } catch (e) { console.warn('socket close error', e); }
    }

    const socket = io("http://localhost:5001", {
      reconnection: true,
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

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
    socket.on("waitingForOpponent", ({ gameId }) => {
      console.log("waiting for opponent", gameId);
      setWaiting(true);
      setGameId(gameId);
    });

    socket.on("gameStarted", ({ gameId, color, fen, turn, whiteMs, blackMs, serverTime }) => {
      console.log("game started", gameId, color);
      setWaiting(false);
      setGameId(gameId);
      setPlayerColor(color);
      setIsSpectator(false);

      // Sync clock state from server
      if (clock?.syncFromServer) {
        clock.syncFromServer(whiteMs || initialTime * 1000, blackMs || initialTime * 1000, turn, { startClock: false });
      }

      // sync position
      try {
        chessGameRef.current?.load?.(fen);
        setChessPosition(fen);
        setMoveHistory([]);
        setHistoryIndex(null);
        setTurn(turn);
      } catch (e) {
        console.warn("failed to load fen", e);
      }
    });

    socket.on("spectatorJoined", ({ gameId, fen, turn, whiteMs, blackMs, serverTime, history, isCompleted, movesInTurn, gameResult, winner }) => {
      console.log("joined as spectator", gameId, "fen:", fen, "history length:", history?.length, "isCompleted:", isCompleted);
      setWaiting(false);
      setGameId(gameId);
      setIsSpectator(true);
      setPlayerColor(null); // No color for spectators

      // Sync clock state from server
      if (clock?.syncFromServer) {
        clock.syncFromServer(whiteMs || initialTime * 1000, blackMs || initialTime * 1000, turn, { startClock: !isCompleted });
      }

      // If game is completed, notify the game over handler
      if (isCompleted && onGameOver) {
        onGameOver({ reason: gameResult || 'game over', winner: winner || null });
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
        setChessPosition(fen);
        setMoveHistory(history || []);
        setHistoryIndex(null);
        setTurn(turn);

        // Sync movesInTurn for spectators
        if (movesInTurn !== undefined && setMovesInTurn) {
          setMovesInTurn(movesInTurn);
        }
      } catch (e) {
        console.error("failed to load spectator state", e);
      }
    });

    socket.on("moveMade", ({ move, fen, turn, movesInTurn, whiteMs, blackMs, serverTime }) => {
      console.log("move made", move.san);
      if (!fen) return;
      chessGameRef.current?.load?.(fen);
      setChessPosition(fen);
      
      // Store full move object with FEN and clock times for proper history navigation
      if (move) {
        const moveObject = {
          ...move,
          fen: fen,
          whiteMs: whiteMs,
          blackMs: blackMs,
        };
        setMoveHistory((prev) => [...prev, moveObject]);
      }
      
      setHistoryIndex(null);
      setTurn(turn);
      
      // Update movesInTurn from server
      if (movesInTurn !== undefined && setMovesInTurn) {
        setMovesInTurn(movesInTurn);
      }

      // Sync clock state from server after move (includes starting the clock)
      if (clock?.syncFromServer) {
        clock.syncFromServer(whiteMs, blackMs, turn, { startClock: true });
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
      if (onGameOver) {
        onGameOver({ reason, winner });
      }
      setWaiting(false);
      setGameId(null);
      if (clock?.pause) clock.pause();
    });

    socket.on("error", (msg) => {
      console.error("Server error:", msg);
    });

    // cleanup: fully close the socket so reconnection stops
    return () => {
      console.log("🧹 useOnlineGame cleanup: closing socket");
      try {
        socket.close();
      } catch (e) {
        console.warn("Error closing socket", e);
      }
      socketRef.current = null;
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function findOnlineGame(userId) {
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
    console.log("🔍 Finding game...");
    socket.emit("findGame", { userId });
  }

  function joinSpecificGame(gameIdToJoin, userId, timeMinutes, incrementSeconds, playerColor) {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("Cannot join game: socket not connected");
      return;
    }
    console.log("🔗 Joining specific game:", gameIdToJoin, "with", timeMinutes, "min +", incrementSeconds, "sec", "color:", playerColor);
    socket.emit("joinGame", { gameId: gameIdToJoin, userId, timeMinutes, incrementSeconds, playerColor });
  }

  function sendMoveOnline(moveObj) {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("Cannot send move: socket not connected");
      return;
    }
    socket.emit("move", { move: moveObj, gameId });
  }

  function resign() {
    const socket = socketRef.current;
    if (!socket || !socket.connected || !gameId) {
      console.error("Cannot resign: socket not connected or no active game");
      return;
    }
    socket.emit("resign", { gameId });
  }

  return {
    socketRef,
    waiting,
    gameId,
    playerColor,
    isConnected,
    isSpectator,
    findOnlineGame,
    joinSpecificGame,
    sendMoveOnline,
    resign,
  };
}
