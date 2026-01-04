export default function ClockView({ timeMs, label }) {
    const seconds = Math.max(0, Math.ceil(timeMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const dataTest = `clock-${(label || 'unknown').toString().toLowerCase()}`;
    const isLow = seconds < 60; // Show warning when under 1 minute

    return (
        <div
            data-test={dataTest}
            className={`rounded-xl border shadow-lg px-3 md:px-4 py-3 md:py-4 flex flex-col gap-1 font-mono transition-all ${
                isLow 
                    ? 'bg-red-900/50 border-red-500/50 shadow-red-500/20' 
                    : 'bg-slate-800 border-slate-700'
            }`}
        >
            <span className={`uppercase tracking-wider font-semibold text-xs ${isLow ? 'text-red-300' : 'text-slate-400'}`}>
                {label}
            </span>
            <span className={`text-2xl md:text-3xl font-bold tabular-nums ${isLow ? 'text-red-300' : 'text-white'}`}>
                {minutes}:{displaySeconds.toString().padStart(2, "0")}
            </span>
        </div>
    );
}