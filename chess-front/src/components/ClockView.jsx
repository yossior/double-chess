export default function ClockView({ timeMs, label }) {
    const seconds = Math.max(0, Math.ceil(timeMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const dataTest = `clock-${(label || 'unknown').toString().toLowerCase()}`;
    const isLow = seconds < 60; // Show warning when under 1 minute

    return (
        <div
            data-test={dataTest}
            className={`rounded-2xl border shadow-lg px-3 md:px-4 py-3 md:py-4 flex flex-col gap-1 font-mono transition-all backdrop-blur-sm ${
                isLow 
                    ? 'bg-gradient-to-br from-red-900/60 to-red-800/60 border-red-600/50 shadow-red-500/30 ring-2 ring-red-500/40' 
                    : 'bg-gradient-to-br from-slate-800/80 to-slate-700/80 border-slate-600/50 shadow-slate-900/30'
            }`}
        >
            <span className={`uppercase tracking-wider font-semibold text-xs ${isLow ? 'text-red-300' : 'text-slate-300'}`}>
                {label}
            </span>
            <span className={`text-2xl md:text-3xl font-bold tabular-nums ${isLow ? 'text-red-200' : 'text-slate-100'}`}>
                {minutes}:{displaySeconds.toString().padStart(2, "0")}
            </span>
        </div>
    );
}