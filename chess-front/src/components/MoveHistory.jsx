import { useEffect, useRef } from "react";

export default function MoveHistory({ moves, viewIndex, onNavigate }) {
  const scrollRef = useRef(null);

  // 1. Calculate the "visual" index. 
  // If viewIndex is null (Live), we treat it as the last move (moves.length - 1).
  const effectiveIndex = viewIndex === null ? moves.length - 1 : viewIndex;

  // Auto-scroll to bottom if viewing live or the very last move
  useEffect(() => {
    if ((viewIndex === null || viewIndex === moves.length - 1) && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length, viewIndex]);

  // Split moves into pairs for the table
  const movePairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({
      number: Math.floor(i / 2) + 1,
      white: moves[i],
      black: moves[i + 1] || null,
      whiteIndex: i,
      blackIndex: i + 1,
    });
  }

  // Navigation Logic
  const handleStart = () => onNavigate(-1);
  const handlePrev = () => {
    // If we are at the "effective" last move, go back one
    const current = effectiveIndex;
    return onNavigate(Math.max(-1, current - 1));
  };
  const handleNext = () => {
    // If we are at the end, switch to null (Live)
    if (effectiveIndex >= moves.length - 1) return onNavigate(null);
    onNavigate(effectiveIndex + 1);
  };
  const handleEnd = () => onNavigate(null);

  return (
    <div data-test="move-history" className="flex flex-col w-full h-[300px] bg-gray-900 rounded-md shadow-lg overflow-hidden border border-gray-700 mt-4">
      <div data-test="move-history-header" className="bg-gray-800 text-gray-200 px-4 py-2 font-bold border-b border-gray-700 text-sm">
        Move History
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-gray-600">
        <table data-test="move-history-table" className="w-full text-sm text-left text-gray-300">
          <tbody>
            {movePairs.map((pair) => (
              <tr key={pair.number} className="hover:bg-gray-800/50 transition-colors">
                <td className="w-8 py-1 px-2 text-gray-500 font-mono text-xs">{pair.number}.</td>
                
                {/* WHITE MOVE */}
                <td 
                  data-test={`move-white-${pair.whiteIndex}`}
                  onClick={() => onNavigate(pair.whiteIndex)}
                  // Compare against effectiveIndex instead of viewIndex
                  className={`cursor-pointer px-2 py-1 rounded transition-colors ${
                    effectiveIndex === pair.whiteIndex 
                      ? "bg-yellow-600 text-white font-bold" 
                      : "hover:text-white"
                  }`}
                >
                  {pair.white.san}
                </td>

                {/* BLACK MOVE */}
                <td 
                  data-test={`move-black-${pair.blackIndex}`}
                  onClick={() => pair.black && onNavigate(pair.blackIndex)}
                  // Compare against effectiveIndex instead of viewIndex
                  className={`cursor-pointer px-2 py-1 rounded transition-colors ${
                    effectiveIndex === pair.blackIndex 
                      ? "bg-yellow-600 text-white font-bold" 
                      : "hover:text-white"
                  }`}
                >
                  {pair.black?.san}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {moves.length === 0 && <div className="text-gray-500 text-xs text-center mt-4 italic">Game started</div>}
      </div>

      <div className="flex justify-between items-center p-1 bg-gray-800 border-t border-gray-700 text-gray-300">
        <button data-test="history-start" onClick={handleStart} className="p-2 hover:bg-gray-700 rounded" title="Start"><span className="text-xs">|&lt;</span></button>
        <button data-test="history-prev" onClick={handlePrev} className="p-2 hover:bg-gray-700 rounded" title="Prev"><span className="text-xs">&lt;</span></button>
        <button data-test="history-next" onClick={handleNext} className="p-2 hover:bg-gray-700 rounded" title="Next"><span className="text-xs">&gt;</span></button>
        <button data-test="history-live" onClick={handleEnd} className="p-2 hover:bg-gray-700 rounded" title="Live"><span className="text-xs">&gt;|</span></button>
      </div>
    </div>
  );
}