import { useState } from 'react';

export default function PlayBot({ onStartGame, onBack, initialPlayerColor = 'w', initialIsUnbalanced = true }) {
  const [selectedColor, setSelectedColor] = useState(initialPlayerColor);
  const [isUnbalanced, setIsUnbalanced] = useState(initialIsUnbalanced);
  const [isTimed, setIsTimed] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState(3);
  const [incrementSeconds, setIncrementSeconds] = useState(2);

  const handleStartGame = () => {
    onStartGame({
      color: selectedColor,
      skillLevel: 2, // Fixed level
      isUnbalanced,
      isTimed,
      timeMinutes: isTimed ? timeMinutes : null,
      incrementSeconds: isTimed ? incrementSeconds : null
    });
  };

  return (
    <div className="bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl p-6 w-80 border border-slate-700/50">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-slate-100">Play vs Bot</h2>
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
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedColor('w')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'w' 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg border border-blue-500/30' 
                  : 'bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/30'
              }`}
            >
              ⚪ White
            </button>
            <button
              onClick={() => setSelectedColor('b')}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                selectedColor === 'b' 
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg border border-blue-500/30' 
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
                className="w-3.5 h-3.5 text-blue-600 bg-slate-700 border-slate-500"
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
                className="w-3.5 h-3.5 text-blue-600 bg-slate-700 border-slate-500"
              />
              <div className="ml-2">
                <span className="text-sm text-slate-100">Balanced</span>
                <span className="text-xs text-slate-400 ml-1">· White starts with 1 move</span>
              </div>
            </label>
          </div>
        </div>

        {/* Game Timing */}
        <div>
          <label className="flex items-center cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={isTimed}
              onChange={() => setIsTimed(!isTimed)}
              className="w-3.5 h-3.5 text-blue-600 bg-slate-700 border-slate-500"
            />
            <span className="ml-2 text-sm text-slate-100">Timed Game</span>
          </label>
          {isTimed && (
            <div className="space-y-3 bg-slate-700/30 p-3 rounded-lg">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Initial Time: {timeMinutes}m
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={timeMinutes}
                  onChange={(e) => setTimeMinutes(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Increment: {incrementSeconds}s
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={incrementSeconds}
                  onChange={(e) => setIncrementSeconds(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartGame}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl hover:shadow-blue-500/50 transform hover:scale-[1.02] border border-blue-500/30"
        >
          🎮 Start Game
        </button>
      </div>
    </div>
  );
}
