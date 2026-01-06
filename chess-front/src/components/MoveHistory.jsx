import { useEffect, useRef, useMemo, memo } from "react";

function MoveHistory({ moves, viewIndex, onNavigate }) {
  const scrollRef = useRef(null);

  // Helper to extract SAN from move (could be string or object)
  const getSan = (move) => {
    if (!move) return null;
    if (typeof move === 'string') return move;
    return move.san || null;
  };

  // Calculate the "visual" index. 
  const effectiveIndex = viewIndex === null ? moves.length - 1 : viewIndex;

  // Auto-scroll to bottom if viewing live or the very last move
  useEffect(() => {
    if ((viewIndex === null || viewIndex === moves.length - 1) && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length, viewIndex]);

  // Memoize turn grouping to avoid recomputing on every render
  const turns = useMemo(() => {
    const result = [];
    let current = { number: 1, white: [], black: [], indices: { white: [], black: [] } };

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];
      const color = move?.color || (i % 2 === 0 ? 'w' : 'b');

      if (color === 'w') {
        if (current.black.length > 0 || current.white.length >= 2) {
          result.push(current);
          current = { number: current.number + 1, white: [], black: [], indices: { white: [], black: [] } };
        }
        current.white.push(move);
        current.indices.white.push(i);
      } else {
        if (current.black.length >= 2) {
          result.push(current);
          current = { number: current.number + 1, white: [], black: [], indices: { white: [], black: [] } };
        }
        current.black.push(move);
        current.indices.black.push(i);
      }
    }

    if (current.white.length || current.black.length) {
      result.push(current);
    }
    return result;
  }, [moves]);

  // Navigation Logic
  const handleStart = () => onNavigate(-1);
  const handlePrev = () => {
    const current = effectiveIndex;
    return onNavigate(Math.max(-1, current - 1));
  };
  const handleNext = () => {
    if (effectiveIndex >= moves.length - 1) return onNavigate(null);
    onNavigate(effectiveIndex + 1);
  };
  const handleEnd = () => onNavigate(null);

  return (
    <div data-test="move-history" className="flex flex-col w-full h-full bg-slate-800/90 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-700/50">

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-600">
        <div className="space-y-0.5">
          {turns.map((turn) => (
            <div key={turn.number} className="space-y-0.5">
              {/* White moves row */}
              <div className="flex items-center px-1 py-0.5 hover:bg-slate-700/20 rounded transition-colors">
                <span className="text-blue-400 text-[9px] font-bold w-4 flex-shrink-0">{turn.number}.</span>
                <div className="flex gap-0.5 flex-1 items-center overflow-hidden">
                  {turn.white.length === 0 ? (
                    <span className="text-slate-500 text-[9px]">…</span>
                  ) : (
                    turn.white.map((move, idx) => {
                      const san = getSan(move);
                      if (!san) return null;
                      return (
                        <button
                          key={`w-${turn.number}-${idx}`}
                          onClick={() => onNavigate(turn.indices.white[idx])}
                          className={`px-1 py-0 rounded text-[9px] font-medium transition-all flex-shrink-0 ${
                            effectiveIndex === turn.indices.white[idx]
                              ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                              : "text-slate-300 hover:text-white hover:bg-slate-600/50"
                          }`}
                        >
                          {san}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              {/* Black moves row */}
              <div className="flex items-center px-1 py-0.5 hover:bg-slate-700/20 rounded transition-colors">
                <span className="w-4 flex-shrink-0"></span>
                <div className="flex gap-0.5 flex-1 items-center overflow-hidden">
                  {turn.black.length === 0 ? (
                    <span className="text-slate-500 text-[9px]">…</span>
                  ) : (
                    turn.black.map((move, idx) => {
                      const san = getSan(move);
                      if (!san) return null;
                      return (
                        <button
                          key={`b-${turn.number}-${idx}`}
                          onClick={() => onNavigate(turn.indices.black[idx])}
                          className={`px-1 py-0 rounded text-[9px] font-medium transition-all flex-shrink-0 ${
                            effectiveIndex === turn.indices.black[idx]
                              ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md"
                              : "text-slate-300 hover:text-white hover:bg-slate-600/50"
                          }`}
                        >
                          {san}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-evenly items-center py-1 gap-1 bg-gradient-to-r from-slate-700/80 to-slate-800/80 border-t border-slate-700/50 backdrop-blur-sm">
        <button data-test="history-start" onClick={handleStart} className="hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-all min-w-0" title="Start"><span className="text-[11px]">⏮</span></button>
        <button data-test="history-prev" onClick={handlePrev} className="hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-all min-w-0" title="Prev"><span className="text-[11px]">◀</span></button>
        <button data-test="history-next" onClick={handleNext} className="hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-all min-w-0" title="Next"><span className="text-[11px]">▶</span></button>
        <button data-test="history-live" onClick={handleEnd} className="hover:bg-slate-600 rounded text-slate-300 hover:text-white transition-all min-w-0" title="Live"><span className="text-[11px]">⏭</span></button>
      </div>
    </div>
  );
}

export default memo(MoveHistory);