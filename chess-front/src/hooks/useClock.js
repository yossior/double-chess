import { useState, useRef, useEffect, useCallback } from "react";

export default function useClock(initialTime = 300) {

    const [isActive, setIsActive] = useState(false);
    const [activePlayer, setActivePlayer] = useState(null);
    const [whiteMs, setWhiteMs] = useState(initialTime * 1000);
    const [blackMs, setBlackMs] = useState(initialTime * 1000);
    const [status, setStatus] = useState("");

    const animationFrameRef = useRef(null);
    
    // Track reference time for accurate countdown
    const clockStateRef = useRef({ 
        whiteMs: initialTime * 1000, 
        blackMs: initialTime * 1000, 
        lastUpdateTime: Date.now(),
        activePlayer: null,
        isActive: false
    });

    const isTimeout = useCallback(() => status !== "", [status]);

    // Wrap in useCallback so it can be used in dependency arrays safely
    const flag = useCallback((player) => {
        setIsActive(false);
        setActivePlayer(null);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        clockStateRef.current.isActive = false;
        setStatus(`${player == 'w' ? 'White' : 'Black'} flagged!`);
    }, []);

    // 1. Monitor time remaining
    useEffect(() => {
        if (whiteMs <= 0 && status === "") {
            flag("w");
        }
        if (blackMs <= 0 && status === "") {
            flag("b");
        }
    }, [whiteMs, blackMs, status, flag]);

    // 2. Use requestAnimationFrame for precise timing that works in background
    useEffect(() => {
        if (!isActive || !activePlayer) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            clockStateRef.current.isActive = false;
            return;
        }

        clockStateRef.current.isActive = true;
        clockStateRef.current.activePlayer = activePlayer;
        clockStateRef.current.lastUpdateTime = Date.now();

        const updateClock = () => {
            const now = Date.now();
            const elapsed = now - clockStateRef.current.lastUpdateTime;
            clockStateRef.current.lastUpdateTime = now;

            if (clockStateRef.current.activePlayer === "w") {
                const newWhite = Math.max(0, clockStateRef.current.whiteMs - elapsed);
                clockStateRef.current.whiteMs = newWhite;
                setWhiteMs(newWhite);
            } else if (clockStateRef.current.activePlayer === "b") {
                const newBlack = Math.max(0, clockStateRef.current.blackMs - elapsed);
                clockStateRef.current.blackMs = newBlack;
                setBlackMs(newBlack);
            }

            if (clockStateRef.current.isActive) {
                animationFrameRef.current = requestAnimationFrame(updateClock);
            }
        };

        animationFrameRef.current = requestAnimationFrame(updateClock);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [activePlayer, isActive]);

    const start = useCallback((side = "w") => {
        if (side !== "w" && side !== "b" && side !== null) return;
        clockStateRef.current.lastUpdateTime = Date.now();
        setIsActive(true);
        setActivePlayer(side);
    }, []);

    const pause = useCallback(() => {
        setIsActive(false);
        setActivePlayer(null);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        clockStateRef.current.isActive = false;
    }, []);

    const reset = useCallback(() => {
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        const resetTime = initialTime * 1000;
        setWhiteMs(resetTime);
        setBlackMs(resetTime);
        clockStateRef.current.whiteMs = resetTime;
        clockStateRef.current.blackMs = resetTime;
        clockStateRef.current.lastUpdateTime = Date.now();
        setIsActive(false);
        setActivePlayer(null);
        setStatus("");
    }, [initialTime]);

    /**
     * Synchronize clock times from server (for online play)
     * This ensures both players' clocks match the server state
     */
    const syncFromServer = useCallback((serverWhiteMs, serverBlackMs, activePlayerColor, opts = {}) => {
        const { startClock = false } = opts;

        // Update both state and ref for accurate tracking
        setWhiteMs(serverWhiteMs);
        setBlackMs(serverBlackMs);
        clockStateRef.current.whiteMs = serverWhiteMs;
        clockStateRef.current.blackMs = serverBlackMs;
        clockStateRef.current.lastUpdateTime = Date.now();

        if (startClock && activePlayerColor) {
            const player = activePlayerColor === "w" ? "w" : "b";
            clockStateRef.current.activePlayer = player;
            setActivePlayer(player);
            setIsActive(true);
        }
    }, []);

    return {
        isActive,
        whiteMs,
        blackMs,
        setIsActive,
        setActivePlayer,
        start,
        pause,
        status,
        isTimeout,
        reset,
        syncFromServer
    };
}