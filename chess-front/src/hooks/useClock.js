import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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

    // 2. Use setInterval for efficient timing (100ms updates for UI, refs for accuracy)
    useEffect(() => {
        if (!isActive || !activePlayer) {
            clockStateRef.current.isActive = false;
            return;
        }

        clockStateRef.current.isActive = true;
        clockStateRef.current.activePlayer = activePlayer;
        clockStateRef.current.lastUpdateTime = Date.now();

        // Update refs every frame for accuracy, but only update React state every 100ms
        let lastStateUpdate = Date.now();
        
        const updateClock = () => {
            const now = Date.now();
            const elapsed = now - clockStateRef.current.lastUpdateTime;
            clockStateRef.current.lastUpdateTime = now;

            if (clockStateRef.current.activePlayer === "w") {
                clockStateRef.current.whiteMs = Math.max(0, clockStateRef.current.whiteMs - elapsed);
            } else if (clockStateRef.current.activePlayer === "b") {
                clockStateRef.current.blackMs = Math.max(0, clockStateRef.current.blackMs - elapsed);
            }

            // Only update React state every 100ms to reduce re-renders
            if (now - lastStateUpdate >= 100) {
                lastStateUpdate = now;
                setWhiteMs(clockStateRef.current.whiteMs);
                setBlackMs(clockStateRef.current.blackMs);
            }

            // Check for flag
            if (clockStateRef.current.whiteMs <= 0 || clockStateRef.current.blackMs <= 0) {
                setWhiteMs(clockStateRef.current.whiteMs);
                setBlackMs(clockStateRef.current.blackMs);
            }
        };

        const intervalId = setInterval(updateClock, 16); // ~60fps internally

        return () => {
            clearInterval(intervalId);
        };
    }, [activePlayer, isActive]);

    const start = useCallback((side = "w") => {
        if (side !== "w" && side !== "b" && side !== null) return;
        console.log('[Clock] start() called with side:', side);
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

    const applyIncrement = useCallback((side, incrementSeconds) => {
        if (!side || !incrementSeconds || incrementSeconds <= 0) return;
        const player = (side === "w" || side === "white") ? "w" : "b";
        const incMs = incrementSeconds * 1000;
        
        if (player === "w") {
            clockStateRef.current.whiteMs += incMs;
            setWhiteMs(clockStateRef.current.whiteMs);
        } else {
            clockStateRef.current.blackMs += incMs;
            setBlackMs(clockStateRef.current.blackMs);
        }
        console.log(`[Clock] Applied increment to ${player}: +${incrementSeconds}s`);
    }, []);

    const reset = useCallback((opts = {}) => {
        const { initialSeconds = initialTime } = opts;
        
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        const resetTime = initialSeconds * 1000;
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
     * @param serverTime - optional timestamp from server when values were calculated
     */
    const syncFromServer = useCallback((serverWhiteMs, serverBlackMs, activePlayerColor, opts = {}) => {
        const { startClock = false, serverTime = Date.now() } = opts;

        console.log('[Clock] syncFromServer called:', {
            serverWhiteMs,
            serverBlackMs,
            activePlayerColor,
            startClock,
            serverTime
        });

        // Update both state and ref for accurate tracking
        setWhiteMs(serverWhiteMs);
        setBlackMs(serverBlackMs);
        clockStateRef.current.whiteMs = serverWhiteMs;
        clockStateRef.current.blackMs = serverBlackMs;
        clockStateRef.current.lastUpdateTime = serverTime;

        if (startClock && activePlayerColor) {
            const player = activePlayerColor === "w" ? "w" : "b";
            console.log('[Clock] Starting clock for player:', player);
            clockStateRef.current.activePlayer = player;
            setActivePlayer(player);
            setIsActive(true);
        } else {
            console.log('[Clock] NOT starting clock (startClock=' + startClock + ')');
        }
    }, []);

    // Wrap return object in useMemo to ensure stable references for dependency arrays
    return useMemo(() => ({
        isActive,
        whiteMs,
        blackMs,
        setIsActive,
        setActivePlayer,
        start,
        pause,
        applyIncrement,
        status,
        isTimeout,
        reset,
        syncFromServer
    }), [isActive, whiteMs, blackMs, setIsActive, setActivePlayer, start, pause, applyIncrement, status, isTimeout, reset, syncFromServer]);
}