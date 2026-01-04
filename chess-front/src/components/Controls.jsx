/**
 * Modern controls UI for game modes - simplified to mode buttons only
 * Settings are now in modals (PlayBot, PlayFriend)
 */
export default function Controls({ 
  onSelectMode
}) {

  return (
    <div className="controls flex-col gap-2 md:gap-3 items-center mb-2 md:mb-4">
      {/* Mode Selection */}
      <div className="w-full space-y-2">
        <button
          onClick={() => onSelectMode && onSelectMode('local')}
          className="w-full p-3 md:p-4 rounded-lg font-medium text-sm transition-all bg-slate-700 text-slate-200 hover:bg-slate-600"
        >
          Play Bot
        </button>
        <button
          onClick={() => onSelectMode && onSelectMode('friend')}
          className="w-full p-3 md:p-4 rounded-lg font-medium text-sm transition-all bg-slate-700 text-slate-200 hover:bg-slate-600"
        >
          Play a Friend
        </button>
      </div>
    </div>
  );
}