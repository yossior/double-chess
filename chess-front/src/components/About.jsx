export default function About() {
  return (
    <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 max-w-lg border border-slate-700/50">
      <h2 className="text-xl font-semibold mb-4 text-slate-100">About Double-Move Chess</h2>
      
      <div className="space-y-4 text-slate-300 text-sm">
        <p>
          Double-Move Chess is a chess variant where each player makes <strong className="text-blue-400">two moves per turn</strong> instead of one.
        </p>

        <div>
          <h3 className="font-medium text-slate-100 mb-2">History</h3>
          <div className="space-y-3 text-slate-400">
            <p>
              Double-Move Chess, also known as Marseillais Chess or Progressive Chess variants, emerged in the early 20th century as chess enthusiasts sought to create more dynamic and tactical versions of the classical game. The variant was particularly popular in France, where it gained the name "Marseillais" after the city of Marseille. The fundamental rule modification—allowing two consecutive moves per turn—dramatically altered the strategic landscape of chess, creating a game where aggressive play and tactical alertness became paramount.
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
          </div>
        </div>

        <div>
          <h3 className="font-medium text-slate-100 mb-2">Key Differences from Standard Chess</h3>
          <ul className="list-disc list-inside space-y-1 ml-1 text-slate-400">
            <li>Each turn consists of two consecutive moves</li>
            <li>If your first move gives check, your turn ends immediately</li>
            <li>The game is much more tactical and aggressive</li>
            <li>King safety is harder to maintain</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium text-slate-100 mb-2">Two Variants</h3>
          <ul className="space-y-2 text-slate-400">
            <li><strong className="text-purple-400">Unbalanced:</strong> White starts with 2 moves, giving a significant first-move advantage.</li>
            <li><strong className="text-emerald-400">Balanced:</strong> White starts with only 1 move on the first turn, then both players get 2 moves per turn.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium text-slate-100 mb-2">Strategy Tips</h3>
          <ul className="list-disc list-inside space-y-1 ml-1 text-slate-400">
            <li>Development happens twice as fast</li>
            <li>Checkmate threats are much more potent</li>
            <li>Giving check on your first move sacrifices your second move</li>
            <li>Piece coordination becomes even more important</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
