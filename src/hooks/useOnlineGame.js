import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

/**
 * useOnlineGame manages a socket connection and provides:
 * - socketRef
 * - isConnected
 * - playerColor
 * - findOnlineGame()
 * - sendMoveOnline(move)
 *
 * Important: cleanup calls socket.close() so reconnection stops.
 */
export function useOnlineGame(chessGameRef, setChessPosition, setMoveHistory, setHistoryIndex, setTurn, playerColor, setPlayerColor) {
  const socketRef = useRef(null);
  const [waiting, setWaiting] = useState(false);
  const [gameId, setGameId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Close any old socket (defensive, useful for HMR)
    if (socketRef.current) {
      try { socketRef.current.close(); } catch (e) { console.warn('socket close error', e); }
    }

    const socket = io("http://localhost:5001", {
      reconnection: true,
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

    socket.on("gameStarted", ({ gameId, color, fen, turn }) => {
      console.log("game started", gameId, color);
      setWaiting(false);
      setGameId(gameId);
      setPlayerColor(color);
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

    socket.on("moveMade", ({ move, fen, turn }) => {
      if (!fen) return;
      chessGameRef.current?.load?.(fen);
      setChessPosition(fen);
      if (move?.san) setMoveHistory((prev) => [...prev, move.san]);
      setHistoryIndex(null);
      setTurn(turn);
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

    socket.on("gameOver", ({ reason }) => {
      alert(`Game Over: ${reason}`);
      setWaiting(false);
      setGameId(null);
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

  function findOnlineGame() {
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
    socket.emit("findGame");
  }

  function sendMoveOnline(moveObj) {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error("Cannot send move: socket not connected");
      return;
    }
    socket.emit("move", { move: moveObj, gameId });
  }

  return {
    socketRef,
    waiting,
    gameId,
    playerColor,
    isConnected,
    findOnlineGame,
    sendMoveOnline,
  };
}
