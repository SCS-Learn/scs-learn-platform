// Courses have no cover images yet, so each gets a generated banner: a color
// from CMU's secondary palette (brand.cmu.edu) picked deterministically from
// the course code, overlaid with a soft geometric pattern - the same course
// always looks the same everywhere it appears.

const PALETTE = [
  { bg: "#1f4c4c", accent: "#719f94" }, // Hornbostel Teal / Palladian Green
  { bg: "#182c4b", accent: "#007bc0" }, // Weaver Blue / Sky Blue
  { bg: "#941120", accent: "#ef3a47" }, // Skibo Red / Scots Rose
  { bg: "#043673", accent: "#008f91" }, // Blue Thread / Teal Thread
  { bg: "#008f91", accent: "#fdb515" }, // Teal Thread / Gold Thread
  { bg: "#c41230", accent: "#fdb515" }, // Carnegie Red / Gold Thread
  { bg: "#2d5a3d", accent: "#009647" }, // deep green / Green Thread
];

function hashCode(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return h;
}

export function courseColor(code: string) {
  return PALETTE[hashCode(code) % PALETTE.length];
}

export default function CourseBanner({
  code,
  className = "",
  showCode = true,
}: {
  code: string;
  className?: string;
  showCode?: boolean;
}) {
  const { bg, accent } = courseColor(code);
  const variant = hashCode(code + "pattern") % 3;
  return (
    <div aria-hidden className={`relative isolate overflow-hidden ${className}`} style={{ backgroundColor: bg }}>
      <svg className="absolute inset-0 -z-10 h-full w-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 200">
        {variant === 0 && (
          <>
            <circle cx="340" cy="20" r="120" fill={accent} opacity="0.55" />
            <circle cx="380" cy="190" r="70" fill="#fff" opacity="0.08" />
          </>
        )}
        {variant === 1 && (
          <>
            {Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x={180 + i * 26} y="-40" width="12" height="320" fill={accent} opacity="0.35" transform="rotate(28 300 100)" />
            ))}
          </>
        )}
        {variant === 2 && (
          <>
            <path d="M260 0 L400 0 L400 200 L170 200 Z" fill={accent} opacity="0.45" />
            <path d="M330 0 L400 0 L400 120 Z" fill="#fff" opacity="0.1" />
          </>
        )}
      </svg>
      {showCode && (
        <span className="absolute bottom-3 left-4 font-serif text-2xl font-semibold text-white/95 drop-shadow-sm">
          {code}
        </span>
      )}
    </div>
  );
}
