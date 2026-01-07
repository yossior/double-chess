import React from 'react';

export default function RulesModal({ onClose }) {
  return (
    <>
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-slate-800/95 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-100">Game Rules</h2>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Double-Move Chess */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">🔄 Double-Move Chess</h3>
              <p className="text-slate-300 mb-2">
                This is a variant of standard chess where each player gets <strong>two moves per turn</strong> instead of one, with some important exceptions.
              </p>
            </div>

            {/* Basic Rules */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">📋 Basic Rules</h3>
              <ul className="text-slate-300 space-y-2">
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Each turn consists of <strong>up to 2 consecutive moves</strong> by the same player</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>All standard chess rules apply (moves must be legal, pieces move normally)</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Checkmate and stalemate end the game immediately</span>
                </li>
              </ul>
            </div>

            {/* Check Exception */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">⚠️ Check Exception</h3>
              <p className="text-slate-300 mb-2">
                If a player delivers <strong>check</strong> on either of their two moves, their turn <strong>ends immediately</strong>, even if they haven't made their second move yet.
              </p>
              <p className="text-slate-300 text-sm italic">
                The opponent must respond to the check on their next turn.
              </p>
            </div>

            {/* Game Modes */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">🎮 Game Modes</h3>
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-slate-100 mb-1">Unbalanced Mode</p>
                  <p className="text-slate-300 text-sm">White starts with 2 moves, giving them an advantage. Great for playing against stronger opponents.</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-100 mb-1">Balanced Mode</p>
                  <p className="text-slate-300 text-sm">White starts with only 1 move on their first turn, then both players get 2 moves per turn thereafter. This creates a fair, balanced game.</p>
                </div>
              </div>
            </div>

            {/* Timing */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">⏱️ Time Controls (Optional)</h3>
              <ul className="text-slate-300 space-y-2">
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span><strong>Initial Time:</strong> Starting time for each player (e.g., 3 minutes)</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span><strong>Increment:</strong> Additional time added after each completed turn</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>If a player runs out of time, they <strong>lose the game</strong></span>
                </li>
              </ul>
            </div>

            {/* How to Win */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">🏆 How to Win</h3>
              <ul className="text-slate-300 space-y-2">
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span><strong>Checkmate</strong> your opponent's king</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Opponent <strong>runs out of time</strong> (in timed games)</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Opponent <strong>resigns</strong></span>
                </li>
              </ul>
            </div>

            {/* Strategy Tips */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">💡 Strategy Tips</h3>
              <ul className="text-slate-300 space-y-2">
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>The extra move allows for aggressive play and tactical combinations</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Be careful not to leave your king in check—remember you can't use your second move if you deliver check first</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Plan ahead—use your two moves to set up powerful positions</span>
                </li>
              </ul>
            </div>

            {/* Example */}
            <div className="bg-slate-700/30 p-4 rounded-lg">
              <p className="font-semibold text-slate-100 mb-2">📌 Example Turn</p>
              <p className="text-slate-300 text-sm">
                <strong>White's Turn:</strong> White moves their knight (1st move). The knight does NOT give check, so White can make a 2nd move. White moves their bishop, delivering check to Black's king. Since check was delivered, White's turn ends immediately, even though they haven't used both moves to their full advantage.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-slate-800/95 border-t border-slate-700/50 px-6 py-4 flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold rounded-lg transition-all shadow-lg hover:shadow-xl hover:shadow-blue-500/50"
            >
              Got it!
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
