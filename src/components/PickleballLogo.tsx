interface PickleballLogoProps {
  size?: number;
  className?: string;
}

// Simple pickleball-ball mark: a blue-to-green sphere (tying the two brand
// colours together in one icon) with the small round holes a pickleball is
// known for. Deliberately plain — a handful of circles, no gradients-within
// gradients or fine detail — so it stays crisp at small sizes.
export function PickleballLogo({ size = 32, className }: PickleballLogoProps) {
  const holes: Array<[number, number]> = [
    [24, 9],
    [35.5, 15.5],
    [37, 28.5],
    [28.5, 37.5],
    [16.5, 37.5],
    [8.5, 28],
    [10, 15.5],
    [19, 8.5],
    [24, 24],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="PickleRounds logo"
    >
      <defs>
        <linearGradient id="pickleball-logo-gradient" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--brand-blue)" />
          <stop offset="100%" stopColor="var(--brand-green)" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="url(#pickleball-logo-gradient)" stroke="var(--brand-blue-dark)" strokeWidth="1.5" />
      {holes.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.3" fill="#fff" fillOpacity="0.92" />
      ))}
    </svg>
  );
}
