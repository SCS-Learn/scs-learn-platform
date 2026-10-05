export default function ProgressRing({
  percent,
  size = 56,
  stroke = 6,
  className = "",
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  className?: string;
  /** Text inside the ring; defaults to the percentage. Pass "" for none. */
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-label={`${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#16a34a"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      {label !== "" && (
        <span className="absolute text-xs font-bold tabular-nums text-gray-800">{label ?? `${clamped}%`}</span>
      )}
    </div>
  );
}
