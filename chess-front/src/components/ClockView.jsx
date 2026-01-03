export default function ClockView({ timeMs, label }) {
    const seconds = Math.max(0, Math.ceil(timeMs / 1000));
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const dataTest = `clock-${(label || 'unknown').toString().toLowerCase()}`;

    return (
        <div
            data-test={dataTest}
            className="rounded-md border border-gray-200 bg-white shadow-sm px-4 py-3 flex flex-col gap-2 text-sm font-mono"
        >
            <span className="uppercase tracking-wide text-gray-500 font-semibold text-xs">{label}</span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
                {minutes}:{displaySeconds.toString().padStart(2, "0")}
            </span>
        </div>
    );
}