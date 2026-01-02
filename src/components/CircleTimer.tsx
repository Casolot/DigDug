type Props = { progress: number; label: string; size?: number };
export function CircleTimer({ progress, label, size = 26 }: Props) {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clampedProgress);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="#444" strokeWidth="3" fill="none" opacity="0.25" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="#a78bfa"
        strokeWidth="3"
        fill="none"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

