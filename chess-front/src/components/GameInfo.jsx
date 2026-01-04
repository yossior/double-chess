/**
 * Modern game info panel with visual design
 */
export default function GameInfo({ mode, gameStatus, isMyTurn, turn, movesInTurn, isUnbalanced, playerColor, onResign, waiting, isSpectator, onCopyLink, winnerInfo }) {
  const turnColor = turn === "w" ? "White" : "Black";
  const playerColorName = playerColor === "w" ? "White" : "Black";
  
  return (
    <div className="bg-slate-800 rounded-xl shadow-lg p-3 md:p-4 space-y-3 border border-slate-700">
      {/* Spectator Badge */}
      {isSpectator && (
        <div className="bg-indigo-900/50 border border-indigo-500/50 rounded-xl p-3">
          <div className="text-indigo-300 font-semibold text-center flex items-center justify-center gap-2 text-sm">
            👁️ Spectating
          </div>
        </div>
      )}
      
      {/* Waiting for Opponent Indicator */}
      {waiting && !isSpectator && (
        <div className="bg-amber-900/30 border border-amber-500/50 rounded-xl p-3">
          <div className="text-amber-300 font-semibold mb-2 text-center text-sm">⏳ Waiting for opponent...</div>
          <div className="text-xs text-amber-400/80 mb-3 text-center">Share the game link with your friend</div>
          <button
            onClick={() => {
              if (onCopyLink) onCopyLink();
            }}
            className="w-full py-2 px-4 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm rounded-lg transition-all shadow-lg shadow-amber-600/30"
          >
            📋 Copy Game Link
          </button>
        </div>
      )}
      
      {/* Game Mode Badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">Game Mode</span>
        <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-900/50 text-indigo-300 border border-indigo-500/30">
          {mode === "friend" ? "Playing Friend" : mode === "online" ? "Online" : "VS Bot"}
        </span>
      </div>

      {/* Variant Badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">Variant</span>
        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${isUnbalanced ? 'bg-purple-900/50 text-purple-300 border border-purple-500/30' : 'bg-emerald-900/50 text-emerald-300 border border-emerald-500/30'}`}>
          {isUnbalanced ? "Unbalanced" : "Balanced"}
        </span>
      </div>

      {/* Your Color */}
      {(mode === "friend" || mode === "online") && !isSpectator && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-400">You are</span>
          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${playerColor === "w" ? 'bg-white text-slate-900' : 'bg-slate-900 text-white border border-slate-600'}`}>
            {playerColor === "w" ? "⚪" : "⚫"} {playerColorName}
          </span>
        </div>
      )}

      {/* Turn Indicator */}
      <div className="pt-3 border-t border-slate-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-400">Current Turn</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${turn === "w" ? 'bg-white shadow-lg shadow-white/30' : 'bg-slate-900 border-2 border-slate-500'}`}></div>
            <span className="text-sm font-semibold text-slate-200">{turnColor}</span>
          </div>
        </div>
        
        {isUnbalanced && (
          <div className="mt-2 text-center">
            <span className="text-xs font-medium text-indigo-400">
              Move {movesInTurn !== undefined ? `${movesInTurn + 1}/2` : "1/1"}
            </span>
          </div>
        )}
      </div>

      {/* Status */}
      <div className="pt-3 border-t border-slate-700">
        <div className={`text-center py-2 px-3 rounded-lg font-semibold text-sm ${
          (winnerInfo && winnerInfo.winner) ? "bg-emerald-900/50 text-emerald-300 border border-emerald-500/30" :
          gameStatus?.includes("Checkmate") ? "bg-red-900/50 text-red-300 border border-red-500/30" :
          gameStatus?.includes("Check") ? "bg-amber-900/50 text-amber-300 border border-amber-500/30" :
          gameStatus?.includes("Draw") ? "bg-slate-700 text-slate-300" :
          winnerInfo ? "bg-indigo-900/50 text-indigo-300 border border-indigo-500/30" :
          "bg-slate-700/50 text-slate-300"
        }`}>
          {winnerInfo
            ? (winnerInfo.winner 
                ? `🏆 ${winnerInfo.winner.charAt(0).toUpperCase() + winnerInfo.winner.slice(1)} wins by ${winnerInfo.reason}` 
                : (winnerInfo.reason === 'draw' ? '🤝 Draw' : `🤝 Draw by ${winnerInfo.reason}`))
            : gameStatus || '♟️ Game in progress'}
        </div>
      </div>

      {/* Turn Status */}
      {!gameStatus && !winnerInfo && !isSpectator && (
        <div className="pt-3 border-t border-slate-700">
          <div className={`text-center py-2 px-3 rounded-lg font-semibold text-sm ${
            isMyTurn ? "bg-emerald-900/50 text-emerald-300 border border-emerald-500/30" : "bg-slate-700/50 text-slate-400"
          }`}>
            {isMyTurn ? "✨ Your Turn" : "⏳ Opponent's Turn"}
          </div>
        </div>
      )}

      {/* Resign Button */}
      {(mode === "friend" || mode === "online") && !gameStatus && !isSpectator && (
        <button
          onClick={onResign}
          className="w-full mt-2 py-2 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-sm rounded-lg transition-all shadow-lg shadow-red-600/30"
        >
          🏳️ Resign
        </button>
      )}
    </div>
  );
}
