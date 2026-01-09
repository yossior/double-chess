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
                This is a variant of standard chess where each player gets <strong>two moves per turn</strong> instead of one, with some exceptions.
              </p>
            </div>

            {/* Basic Rules */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">📋 Basic Rules</h3>
              <ul className="text-slate-300 space-y-2">
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Each turn consists of <strong>2 consecutive moves</strong> by the same player</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>If a player delivers check on their first move, their turn ends.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>Checks must be responded to on the first move.</span>
                </li>
              </ul>
            </div>

            {/* Game Modes */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">🎮 Balanced vs Unbalanced</h3>
              <div className="space-y-3">
                To reduce white opening advantege, in Balanced mode white only gets one move on their first turn
              </div>
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
