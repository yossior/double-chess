/**
 * Modern controls UI for game modes - simplified to mode buttons only
 * Settings are now in modals (PlayBot, PlayFriend)
 */
export default function Controls({ 
  onSelectMode,
  onShowRules,
  disabled = false
}) {

  return (
    <div className="controls flex-col gap-2 md:gap-3 items-center mb-2 md:mb-4">
      {/* Mode Selection */}
      <div className="w-full space-y-3">
        <button
          onClick={() => onSelectMode && onSelectMode('local')}
          disabled={disabled}
          className="w-full p-4 rounded-xl font-semibold text-base transition-all bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl hover:shadow-blue-500/50 transform hover:scale-[1.02] active:scale-[0.98] border border-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
        >
          🤖 Play Bot
        </button>
        <button
          onClick={() => onSelectMode && onSelectMode('friend')}
          disabled={disabled}
          className="w-full p-4 rounded-xl font-semibold text-base transition-all bg-gradient-to-r from-purple-600 to-purple-700 text-white hover:from-purple-700 hover:to-purple-800 shadow-lg hover:shadow-xl hover:shadow-purple-500/50 transform hover:scale-[1.02] active:scale-[0.98] border border-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-lg"
        >
          👥 Play a Friend
        </button>
      </div>

      {/* Utility Buttons */}
      <div className="w-full flex gap-2 mt-4">
        <button
          onClick={() => onShowRules?.()}
          className="flex-1 p-3 rounded-lg font-semibold text-sm transition-all bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl hover:shadow-green-500/50 transform hover:scale-[1.02] active:scale-[0.98] border border-green-500/20"
          title="View game rules"
        >
          📖 Rules
        </button>
      </div>
    </div>
  );
}