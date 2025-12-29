// useChessClock.js
import { useEffect, useRef, useState, useCallback } from "react";

/**
 * useChessClock
 * - initialTime: seconds (default 300)
 * - increment: seconds (default 2)
 * - tickIntervalMs: how often UI updates (200ms for "live" feeling)
 * - onFlag: optional callback when a side reaches 0 (receives "white" or "black")
 */
export function useChessClock({
  initialTime = 300,
  increment = 2,
  tickIntervalMs = 200,
  onFlag = null
} = {}) {
  const initialMs = initialTime * 1000;
  const incrementMs = increment * 1000;

  // store times in ms in refs so interval updates don't suffer from stale closures
  const whiteMsRef = useRef(initialMs);
  const blackMsRef = useRef(initialMs);

  // which side is currently running: "white" | "black" | null
  const [active, setActive] = useState(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // last timestamp when we subtracted time
  const lastTsRef = useRef(null);

  // a small state toggler to force re-render for live UI
  const [, setTick] = useState(0);

  // pause both clocks
  const pause = useCallback(() => {
    setActive(null);
    activeRef.current = null;
    lastTsRef.current = null;
  }, []);

  // internal: call when a side flags
  const handleFlag = useCallback((side) => {
    pause();
    if (typeof onFlag === "function") onFlag(side);
  }, [pause, onFlag]);

  // start ticking that side
  const start = useCallback((side) => {
    if (side !== "white" && side !== "black" && side !== null) return;
    // if already active and same side, do nothing
    setActive(side);
    activeRef.current = side;
    lastTsRef.current = performance.now();
  }, []);

  // reset both clocks to initial value
  const reset = useCallback(({ initialSeconds = initialTime } = {}) => {
    pause();
    whiteMsRef.current = initialSeconds * 1000;
    blackMsRef.current = initialSeconds * 1000;
    setTick((t) => t + 1);
  }, [initialTime, pause]);

  // add increment to the side that just moved
  const applyIncrement = useCallback((side) => {
    if (side === "white") {
      whiteMsRef.current = Math.max(0, whiteMsRef.current + incrementMs);
    } else if (side === "black") {
      blackMsRef.current = Math.max(0, blackMsRef.current + incrementMs);
    }
    setTick((t) => t + 1);
  }, [incrementMs]);
  // internal interval: subtract elapsed ms from active side
  useEffect(() => {
    let intId = null;

    function tick() {
      const now = performance.now();
      const last = lastTsRef.current ?? now;
      const delta = now - last;
      lastTsRef.current = now;

      if (activeRef.current === "white") {
        whiteMsRef.current = Math.max(0, whiteMsRef.current - delta);
        if (whiteMsRef.current === 0) handleFlag("white");
      } else if (activeRef.current === "black") {
        blackMsRef.current = Math.max(0, blackMsRef.current - delta);
        if (blackMsRef.current === 0) handleFlag("black");
      }

      // update UI
      setTick((t) => t + 1);
    }

    if (activeRef.current) {
      // make sure lastTs is set immediately
      lastTsRef.current = performance.now();
      intId = setInterval(tick, tickIntervalMs);
    }

    return () => {
      if (intId) clearInterval(intId);
    };
    // we purposely do not put activeRef.current in deps; we rely on state `active`
    // to start/stop the interval. React guarantees active state changes will re-run effect.
  }, [active, tickIntervalMs, handleFlag]); // re-create interval when active changes

  // helpers to get readable time (seconds; keep ms resolution internally)
  function _msToDisplay(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centis = Math.floor((ms % 1000) / 10); // for showing hundredths if desired
    return { minutes, seconds, centis, totalSeconds, ms };
  }

  function getWhite() {
    return _msToDisplay(whiteMsRef.current);
  }
  function getBlack() {
    return _msToDisplay(blackMsRef.current);
  }

  // return minimal API + display getters
  return {
    // state
    active, // "white" | "black" | null

    // controls
    start,
    pause,
    reset,
    applyIncrement,

    // live display getters (call on each render)
    getWhite,
    getBlack,
  };
}
export default useChessClock;