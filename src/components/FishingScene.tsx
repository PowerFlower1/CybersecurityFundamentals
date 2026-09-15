import { motion } from "motion/react";
import type { FishingPhase } from "../lib/fishing";

// Original artwork — a friendly shield-headed "cyber angler" on a dock.
// Deliberately not modelled on any existing game's character or assets.

interface FishingSceneProps {
  phase: FishingPhase;
  reducedMotion: boolean;
}

export function FishingScene({ phase, reducedMotion }: FishingSceneProps) {
  const lineOut = phase === "waiting" || phase === "hooked" || phase === "reeling";
  const bobberX = phase === "reeling" ? 300 : 470;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-sky-200 shadow-sm">
      <svg
        viewBox="0 0 800 340"
        className="w-full h-auto block"
        role="img"
        aria-label="A cyber angler fishing from a dock"
      >
        {/* Sky */}
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="100%" stopColor="#bae6fd" />
          </linearGradient>
          <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
        </defs>
        <rect width="800" height="340" fill="url(#sky)" />

        {/* Clouds */}
        {[
          { x: 90, y: 55, s: 1 },
          { x: 430, y: 40, s: 0.8 },
          { x: 650, y: 70, s: 1.1 },
        ].map((c, i) => (
          <motion.g
            key={i}
            initial={false}
            animate={reducedMotion ? {} : { x: [0, 14, 0] }}
            transition={reducedMotion ? {} : { duration: 12 + i * 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <g transform={`translate(${c.x} ${c.y}) scale(${c.s})`} fill="#ffffff" opacity="0.9">
              <circle cx="0" cy="0" r="18" />
              <circle cx="22" cy="4" r="14" />
              <circle cx="-20" cy="5" r="13" />
              <rect x="-20" y="0" width="44" height="14" rx="7" />
            </g>
          </motion.g>
        ))}

        {/* Sea */}
        <rect y="215" width="800" height="125" fill="url(#sea)" />
        {/* Wave crests */}
        {[0, 1, 2].map((row) => (
          <motion.g
            key={row}
            initial={false}
            animate={reducedMotion ? {} : { x: row % 2 === 0 ? [0, 28, 0] : [0, -28, 0] }}
            transition={reducedMotion ? {} : { duration: 6 + row, repeat: Infinity, ease: "easeInOut" }}
          >
            <path
              d={Array.from({ length: 18 })
                .map((_, i) => `M ${i * 48 - 24} ${222 + row * 22} q 12 -10 24 0 q 12 10 24 0`)
                .join(" ")}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.22 - row * 0.05}
              strokeWidth="5"
              strokeLinecap="round"
            />
          </motion.g>
        ))}

        {/* Dock */}
        <rect x="0" y="196" width="250" height="22" rx="4" fill="#c2703a" />
        <rect x="0" y="196" width="250" height="7" rx="3" fill="#d98650" />
        <rect x="52" y="218" width="20" height="52" fill="#a85c2c" />
        <rect x="168" y="218" width="20" height="52" fill="#a85c2c" />

        {/* Angler — shield head, original design */}
        <g transform="translate(150 120)">
          {/* body */}
          <rect x="6" y="52" width="54" height="46" rx="12" fill="#1d4ed8" />
          {/* shield head */}
          <path
            d="M33 2 L62 13 V38 C62 56 48 66 33 72 C18 66 4 56 4 38 V13 Z"
            fill="#2563eb"
            stroke="#1e40af"
            strokeWidth="3"
          />
          {/* keyhole emblem */}
          <circle cx="33" cy="32" r="7" fill="#bfdbfe" />
          <rect x="30" y="36" width="6" height="12" rx="3" fill="#bfdbfe" />
          {/* eyes */}
          <circle cx="24" cy="24" r="3.4" fill="#0f172a" />
          <circle cx="42" cy="24" r="3.4" fill="#0f172a" />
          {/* arm holding rod */}
          <rect x="52" y="62" width="26" height="9" rx="4.5" fill="#1d4ed8" transform="rotate(-24 52 62)" />
        </g>

        {/* Rod + line */}
        <g>
          <line x1="205" y1="168" x2="268" y2="120" stroke="#f59e0b" strokeWidth="6" strokeLinecap="round" />
          <circle cx="222" cy="155" r="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2" />
          {lineOut && (
            <motion.line
              x1="268"
              y1="120"
              initial={false}
              animate={{ x2: bobberX, y2: 238 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
              stroke="#e2e8f0"
              strokeWidth="2"
            />
          )}
        </g>

        {/* Bobber */}
        {lineOut && (
          <motion.g
            initial={false}
            animate={{ x: bobberX - 470, y: phase === "hooked" && !reducedMotion ? [0, 7, 0] : 0 }}
            transition={
              reducedMotion
                ? { duration: 0 }
                : phase === "hooked"
                  ? { y: { duration: 0.4, repeat: Infinity }, x: { duration: 0.45 } }
                  : { duration: 0.45, ease: "easeOut" }
            }
          >
            <circle cx="470" cy="238" r="9" fill="#ef4444" />
            <path d="M461 238 a9 9 0 0 1 18 0 Z" fill="#f8fafc" />
          </motion.g>
        )}
      </svg>
    </div>
  );
}
