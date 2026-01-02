type Props = { progress: number; label: string; size?: number };
export function CircleTimer({ progress, label, size = 26 }: Props) {
  const p = Math.min(1, Math.max(0, progress));
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - p);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label}>
      <circle cx={size/2} cy={size/2} r={r} stroke="#444" strokeWidth="3" fill="none" opacity="0.25" />
      <circle cx={size/2} cy={size/2} r={r} stroke="#a78bfa" strokeWidth="3" fill="none"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={off} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
    </svg>
  );
}

