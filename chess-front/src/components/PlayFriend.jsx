import { useState } from 'react';

export default function PlayFriend({ onStartGame, onBack, onCopyLink, initialIsUnbalanced = true }) {
  const [selectedColor, setSelectedColor] = useState('random');
  const [startTime, setStartTime] = useState(3); // minutes
  const [increment, setIncrement] = useState(2); // seconds
  const [isUnbalanced, setIsUnbalanced] = useState(initialIsUnbalanced);
  const [gameLink, setGameLink] = useState('');

  const handleCreateGame = () => {
    // Generate a unique game ID
    const gameId = Math.random().toString(36).substr(2, 9);
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/game/${gameId}`;
    setGameLink(link);
    navigator.clipboard.writeText(link).catch(() => {});
    if (onCopyLink) onCopyLink();
    
    // Determine color - generate random if 'random' is selected
    const finalColor = selectedColor === 'random' 
      ? (Math.random() < 0.5 ? 'w' : 'b') 
      : selectedColor;
    
    // Start the game with selected settings (creator navigates to the link)
    onStartGame({
      gameId,
      color: finalColor,
      timeMinutes: startTime,
      incrementSeconds: increment,
      isUnbalanced
    });
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(gameLink);
    if (onCopyLink) onCopyLink();
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 w-80 border border-slate-700/50">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-slate-100">Play a Friend</h2>
        <button 
          onClick={onBack}
          className="text-slate-400 hover:text-slate-100 transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        {/* Color Selection */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Your Color
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setSelectedColor('w')}
              className={`py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'w' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg border border-purple-500/30' 
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/30'
              }`}
            >
              ⚪ White
            </button>
            <button
              onClick={() => setSelectedColor('random')}
              className={`py-2 px-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                selectedColor === 'random' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg border border-purple-500/30' 
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/30'
              }`}
            >
              <span>🎲Random</span>
            </button>
            <button
              onClick={() => setSelectedColor('b')}
              className={`py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'b' 
                  ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg border border-purple-500/30' 
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/30'
              }`}
            >
              ⚫ Black
            </button>
          </div>
        </div>

        {/* Game Variant */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Variant
          </label>
          <div className="space-y-2">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gameMode"
                checked={isUnbalanced}
                onChange={() => setIsUnbalanced(true)}
                className="w-3.5 h-3.5 text-purple-600 bg-slate-700 border-slate-500"
              />
              <div className="ml-2">
                <span className="text-sm text-slate-100">Unbalanced</span>
                <span className="text-xs text-slate-400 ml-1">· White starts with 2 moves</span>
              </div>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                name="gameMode"
                checked={!isUnbalanced}
                onChange={() => setIsUnbalanced(false)}
                className="w-3.5 h-3.5 text-purple-600 bg-slate-700 border-slate-500"
              />
              <div className="ml-2">
                <span className="text-sm text-slate-100">Balanced</span>
                <span className="text-xs text-slate-400 ml-1">· White starts with 1 move</span>
              </div>
            </label>
          </div>
        </div>

        {/* Time Controls - Combined */}
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-2">
            Time Control
          </label>
          <div className="bg-slate-700/30 rounded-lg p-3 space-y-3 border border-slate-600/30 backdrop-blur-sm">
            {/* Time per side */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400">Time per side</span>
                <span className="text-xs text-slate-200">{startTime} min</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                value={startTime}
                onChange={(e) => setStartTime(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
            {/* Increment */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-slate-400">Increment</span>
                <span className="text-xs text-slate-200">{increment} sec</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={increment}
                onChange={(e) => setIncrement(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>
          </div>
        </div>

        {/* Create Game Button */}
        <button
          onClick={handleCreateGame}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:shadow-purple-500/50 transform hover:scale-[1.02] border border-purple-500/30"
        >
          🎮 Create Game & Copy Link
        </button>
        
        {gameLink && (
          <div className="space-y-2">
            <input
              readOnly
              value={gameLink}
              className="w-full text-xs px-3 py-2 rounded-lg bg-slate-700/50 text-slate-200 border border-slate-600/50 focus:outline-none backdrop-blur-sm"
            />
            <button
              onClick={handleCopyLink}
              className="w-full py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-200 text-sm font-medium rounded-lg transition-all border border-slate-600/50"
            >
              Copy Link Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
