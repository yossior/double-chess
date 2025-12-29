import { useState, useRef, useEffect, useCallback } from "react";

export default function useClock(initialTime = 300) {

    const [isActive, setIsActive] = useState(false);
    const [activePlayer, setActivePlayer] = useState(null);
    const [whiteMs, setWhiteMs] = useState(initialTime * 1000);
    const [blackMs, setBlackMs] = useState(initialTime * 1000);
    const [status, setStatus] = useState("");

    const whiteIntervalRef = useRef(null);
    const blackIntervalRef = useRef(null);

    const isTimeout = useCallback(() => status !== "", [status]);

    // Wrap in useCallback so it can be used in dependency arrays safely
    const flag = useCallback((player) => {
        setIsActive(false);
        setActivePlayer(null);
        clearInterval(whiteIntervalRef.current);
        clearInterval(blackIntervalRef.current);
        setStatus(`${player == 'w' ? 'White' : 'Black'} flagged!`);
    }, []);

    // 1. NEW EFFECT: Monitor time remaining
    // This runs every time whiteMs or blackMs updates.
    useEffect(() => {
        if (whiteMs <= 0 && status === "") {
            flag("w");
        }
        if (blackMs <= 0 && status === "") {
            flag("b");
        }
    }, [whiteMs, blackMs, status, flag]);



    // 2. UPDATED EFFECT: Handle the ticking intervals only
    useEffect(() => {
        if (!isActive) return;

        if (activePlayer === "w") {
            clearInterval(blackIntervalRef.current);
            whiteIntervalRef.current = setInterval(() => {
                // We only handle subtraction here. 
                // The state update triggers the effect above to check for <= 0.
                setWhiteMs((prev) => prev - 100);
            }, 100);
        } else {
            clearInterval(whiteIntervalRef.current);
            blackIntervalRef.current = setInterval(() => {
                setBlackMs((prev) => prev - 100);
            }, 100);
        }

        return () => {
            clearInterval(whiteIntervalRef.current);
            clearInterval(blackIntervalRef.current);
        };
    }, [activePlayer, isActive]); // Added isActive to dependencies

    const start = useCallback((side = "w") => {
        if (side !== "w" && side !== "b" && side !== null) return;
        setIsActive(true);
        setActivePlayer(side);
    }, []);

    const pause = useCallback(() => {
        setIsActive(false);
        setActivePlayer(null);
        clearInterval(whiteIntervalRef.current);
        clearInterval(blackIntervalRef.current);
    }, []);

    const reset = useCallback(() => {
        clearInterval(whiteIntervalRef.current);
        clearInterval(blackIntervalRef.current);
        setWhiteMs(initialTime * 1000);
        setBlackMs(initialTime * 1000);
        setIsActive(false);
        setActivePlayer(null);
        setStatus("");
    }, [initialTime]);



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
        reset
    };
}