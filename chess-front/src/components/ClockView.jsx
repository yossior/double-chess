export default function ClockView({ timeMs, label }) {
    const seconds = Math.ceil(timeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const displaySeconds = seconds % 60;
    const dataTest = `clock-${(label || 'unknown').toString().toLowerCase()}`;
    return (
        <div data-test={dataTest}>
            {minutes}:{displaySeconds.toString().padStart(2, "0")}
        </div>
    );
}