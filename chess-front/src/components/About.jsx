import React from 'react';

export default function About({ onClose }) {
  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/50 max-w-lg w-full max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-slate-800/95 border-b border-slate-700/50 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold mb-0 text-slate-100">About Double-Move Chess</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-100 transition-colors text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-4 text-slate-300 text-sm">
            <p>
              Double-Move Chess is a chess variant where each player makes <strong className="text-blue-400">two moves per turn</strong> instead of one.
            </p>

            <div>
              {/* <h3 className="font-medium text-slate-100 mb-2">History</h3> */}
              <div className="space-y-3 text-slate-400">
                <p>
                  This an open-source project designed to bring back a varient of chess which seems to disappear in the online era. Double-Move Chess, also known as Marseillais Chess, emerged in the early 20th century as chess enthusiasts sought to create more dynamic and tactical versions of the classical game. The fundamental rule modification - allowing two consecutive moves per turn - dramatically altered the strategic landscape of chess, creating a game where aggressive play and tactical alertness became paramount.
                </p>
                <p className="pt-2">
                  <a
                    href="https://en.wikipedia.org/wiki/Marseillais_chess"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  >
                    Learn more on Wikipedia →
                  </a>
                </p>
                <p className="pt-2">
                  <a
                    href="https://github.com/yossior/double-chess"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline transition-colors"
                  >
                    Check out the source code on GitHub
                  </a>
                </p>
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
