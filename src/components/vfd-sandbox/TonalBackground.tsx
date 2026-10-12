import { cn } from "@/lib/utils";

/** Soft leaf-like shapes derived from the V mark, tone-on-tone over navy. */
const LEAF = "M0,-100 C55,-60 70,10 0,100 C-70,10 -55,-60 0,-100 Z";

type Shape = { x: number; y: number; s: number; r: number; tone: "light" | "dark" | "teal" };

const LAYOUTS: Record<"splash" | "signin" | "pin", Shape[]> = {
  splash: [
    { x: 30, y: 60, s: 2.2, r: -25, tone: "light" },
    { x: 370, y: 120, s: 1.6, r: 30, tone: "dark" },
    { x: 340, y: 700, s: 2.6, r: 160, tone: "teal" },
    { x: 60, y: 760, s: 1.4, r: 200, tone: "light" },
    { x: 200, y: 420, s: 3.2, r: 10, tone: "dark" },
    { x: 410, y: 420, s: 1.1, r: 75, tone: "light" },
  ],
  signin: [
    { x: 20, y: 40, s: 1.8, r: -35, tone: "light" },
    { x: 380, y: 30, s: 2.1, r: 40, tone: "teal" },
    { x: 220, y: 300, s: 2.4, r: 175, tone: "dark" },
    { x: -10, y: 280, s: 1.2, r: 120, tone: "light" },
    { x: 420, y: 260, s: 1.3, r: -60, tone: "dark" },
  ],
  pin: [
    { x: -20, y: 120, s: 2.4, r: -20, tone: "light" },
    { x: 400, y: 80, s: 1.5, r: 35, tone: "dark" },
    { x: 380, y: 560, s: 2.8, r: 150, tone: "teal" },
    { x: 40, y: 820, s: 2.0, r: 210, tone: "light" },
    { x: 220, y: 380, s: 3.4, r: -8, tone: "dark" },
    { x: 430, y: 860, s: 1.2, r: 90, tone: "light" },
    { x: 120, y: 520, s: 0.9, r: 60, tone: "light" },
  ],
};

const FILL = {
  light: "hsl(var(--ink-foreground) / 0.04)",
  dark: "hsl(var(--ink-deep) / 0.6)",
  teal: "url(#tonal-teal)",
};

export function TonalBackground({ variant, className }: { variant: keyof typeof LAYOUTS; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden bg-gradient-ink", className)}>
      <svg className="tonal-drift absolute inset-0 h-full w-full" viewBox="0 0 400 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="tonal-teal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--ink-foreground))" stopOpacity="0.035" />
            <stop offset="100%" stopColor="hsl(var(--tonal-teal))" stopOpacity="0.06" />
          </linearGradient>
          <filter id="tonal-blur"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <g filter="url(#tonal-blur)">
          {LAYOUTS[variant].map((sh, i) => (
            <path key={i} d={LEAF} fill={FILL[sh.tone]} transform={`translate(${sh.x} ${sh.y}) rotate(${sh.r}) scale(${sh.s})`} />
          ))}
        </g>
      </svg>
    </div>
  );
}
