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
    <div data-test="move-history" className="flex flex-col w-full h-[400px] md:h-[500px] bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-700">
      <div data-test="move-history-header" className="bg-slate-900 text-slate-200 px-4 py-3 font-bold border-b border-slate-700 text-sm flex items-center gap-2">
        📋 Move History
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-600">
        <div className="space-y-1">
          {turns.map((turn) => (
            <div key={turn.number} className="border border-slate-700/50 rounded-lg overflow-hidden">
              {/* White row: turn number + all white plies for this turn */}
              <div className="flex items-center px-3 py-2 bg-slate-700/40">
                <span className="text-indigo-400 text-xs font-bold w-10">{turn.number}.</span>
                <div className="flex gap-2 flex-1 flex-wrap">
                  {turn.white.length === 0 && <span className="text-slate-500 text-sm">…</span>}
                  {turn.white.map((move, idx) => {
                    const san = getSan(move);
                    if (!san) return null;
                    return (
                      <button
                        key={`w-${turn.number}-${idx}`}
                        onClick={() => onNavigate(turn.indices.white[idx])}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          effectiveIndex === turn.indices.white[idx]
                            ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                            : "text-slate-200 hover:text-white hover:bg-slate-600"
                        }`}
                      >
                        {san}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Black row: indent, opposite side plies on their own line */}
              <div className="flex items-center px-3 py-2 bg-slate-800/60">
                <span className="text-xs font-bold w-10" />
                <div className="flex gap-2 flex-1 flex-wrap">
                  {turn.black.length === 0 && <span className="text-slate-500 text-sm">…</span>}
                  {turn.black.map((move, idx) => {
                    const san = getSan(move);
                    if (!san) return null;
                    return (
                      <button
                        key={`b-${turn.number}-${idx}`}
                        onClick={() => onNavigate(turn.indices.black[idx])}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                          effectiveIndex === turn.indices.black[idx]
                            ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                            : "text-slate-200 hover:text-white hover:bg-slate-600"
                        }`}
                      >
                        {san}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
        {moves.length === 0 && <div className="text-slate-400 text-sm text-center mt-8 italic">Game started — make your move!</div>}
      </div>

      <div className="flex justify-between items-center p-2 bg-slate-900 border-t border-slate-700">
        <button data-test="history-start" onClick={handleStart} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors" title="Start"><span className="text-sm font-bold">⏮</span></button>
        <button data-test="history-prev" onClick={handlePrev} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors" title="Prev"><span className="text-sm font-bold">◀</span></button>
        <button data-test="history-next" onClick={handleNext} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors" title="Next"><span className="text-sm font-bold">▶</span></button>
        <button data-test="history-live" onClick={handleEnd} className="p-2 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors" title="Live"><span className="text-sm font-bold">⏭</span></button>
      </div>
    </div>
  );
}

export default memo(MoveHistory);