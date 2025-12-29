/**
 * Simple controls UI. IMPORTANT: Controls never imports or uses the online hook.
 * It only asks the parent to switch to online mode (so the OnlineBoard can mount).
 */
export default function Controls({ mode, onFindOnline, onExitOnline, skillLevel, setSkillLevel, resetGame }) {

  return (
    <div className="controls flex-col gap-3 items-center mb-4">
      <ul className="grid w-full gap-6 md:grid-cols-2">
        <li onClick={() => onExitOnline && onExitOnline()}>
          <input type="radio" id="hosting-small" name="hosting" value="hosting-small" className="hidden peer" required defaultChecked />
          <label className="inline-flex items-center justify-between w-full p-5 text-gray-500 bg-white border border-gray-200 rounded-lg cursor-pointer dark:hover:text-gray-300 dark:border-gray-700 dark:peer-checked:text-blue-500 peer-checked:border-blue-600 dark:peer-checked:border-blue-600 peer-checked:text-blue-600 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700">
            <div className="block">
              <div className="w-full text-lg font-semibold">Play Bot</div>
            </div>
            
          </label>
        </li>
        <li onClick={() => onFindOnline && onFindOnline()}>
          <input type="radio" id="hosting-big" name="hosting" value="hosting-big" className="hidden peer" required />
          <label className="text-center inline-flex items-center justify-between w-full p-5 text-gray-500 bg-white border border-gray-200 rounded-lg cursor-pointer dark:hover:text-gray-300 dark:border-gray-700 dark:peer-checked:text-blue-500 peer-checked:border-blue-600 dark:peer-checked:border-blue-600 peer-checked:text-blue-600 hover:text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:bg-gray-800 dark:hover:bg-gray-700">
            <div className="block">
              <div className="w-full text-lg font-semibold">Play Online</div>
            </div>
            
          </label>
        </li>
      </ul>
      {mode === "local" && (
        <div className="flex gap-1 items-center m-3">
          <label className="flex gap-0.5 items-center">
            Bot Strength ({skillLevel})
            <input
              type="range"
              min={0}
              max={10}
              value={skillLevel}
              onChange={(e) => setSkillLevel(Number(e.target.value))}
            />
          </label>
          <button onClick={resetGame}>Reset</button>
        </div>
      )}
    </div>
  );
}