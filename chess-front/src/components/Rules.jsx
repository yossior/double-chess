export default function Rules() {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-2xl p-6 max-w-2xl border border-slate-700">
      <h2 className="text-2xl font-bold mb-4 text-white flex items-center gap-2">📜 Double-Move Chess Rules</h2>
      
      <div className="space-y-5">
        <section className="bg-slate-700/30 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">⚡ Core Mechanic</h3>
          <p className="text-slate-300 mb-2">
            This is <strong className="text-white">Double-Move Chess</strong> - a unique variant where each player makes <strong className="text-indigo-400">two consecutive moves</strong> per turn, with two important exceptions:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-300 ml-4">
            <li>If a check is delivered, the turn ends immediately</li>
            <li>If the game ends (checkmate, stalemate, etc.)</li>
          </ul>
          <p className="text-slate-300 mt-2">
            This creates dynamic, aggressive gameplay where tactics and combinations are amplified.
          </p>
        </section>

        <section className="bg-slate-700/30 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">🎮 Game Modes</h3>
          <div className="space-y-3">
            <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-500/30">
              <strong className="text-purple-300">Unbalanced Mode (Default):</strong>
              <p className="text-slate-300">White gets two moves on the first turn, giving a significant advantage. Fast-paced and aggressive.</p>
            </div>
            <div className="bg-emerald-900/30 rounded-lg p-3 border border-emerald-500/30">
              <strong className="text-emerald-300">Balanced Mode:</strong>
              <p className="text-slate-300">White plays only <strong className="text-white">one move</strong> on the first turn, then both players get two moves per turn. This balances the game for competitive play.</p>
            </div>
          </div>
        </section>

        <section className="bg-slate-700/30 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">⏱️ Time Controls</h3>
          <p className="text-slate-300">
            When playing with a friend, you can customize:
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-300 ml-4">
            <li><strong className="text-white">Starting Time:</strong> How much time each player begins with</li>
            <li><strong className="text-white">Increment:</strong> Bonus seconds added after each move</li>
          </ul>
        </section>

        <section className="bg-slate-700/30 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-indigo-300 mb-2">🤖 Playing Against the Bot</h3>
          <p className="text-slate-300">
            The AI opponent uses Stockfish engine with adjustable difficulty levels (1-10), 
            optimized specifically for double-move chess strategy and tactics.
          </p>
        </section>
      </div>
    </div>
  );
}
