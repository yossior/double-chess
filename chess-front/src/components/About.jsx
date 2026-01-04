export default function About() {
  return (
    <div className="bg-slate-800 rounded-xl shadow-xl p-5 max-w-lg border border-slate-700">
      <h2 className="text-lg font-semibold mb-4 text-white">About Double-Move Chess</h2>
      
      <div className="space-y-4 text-slate-300 text-sm">
        <p>
          Double-Move Chess is a chess variant where each player makes <strong className="text-white">two moves per turn</strong> instead of one.
        </p>

        <div>
          <h3 className="font-medium text-slate-200 mb-2">Key Differences from Standard Chess</h3>
          <ul className="list-disc list-inside space-y-1 ml-1 text-slate-400">
            <li>Each turn consists of two consecutive moves</li>
            <li>If your first move gives check, your turn ends immediately</li>
            <li>The game is much more tactical and aggressive</li>
            <li>King safety is harder to maintain</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium text-slate-200 mb-2">Two Variants</h3>
          <ul className="space-y-2 text-slate-400">
            <li><strong className="text-slate-200">Unbalanced:</strong> White starts with 2 moves, giving a significant first-move advantage.</li>
            <li><strong className="text-slate-200">Balanced:</strong> White starts with only 1 move on the first turn, then both players get 2 moves per turn.</li>
          </ul>
        </div>

        <div>
          <h3 className="font-medium text-slate-200 mb-2">Strategy Tips</h3>
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
