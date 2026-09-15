import { motion } from "motion/react";
import type { FishingPhase } from "../lib/fishing";

// Original artwork: a shield-headed analyst casting a line into a dark "data
// ocean" at night. Deliberately styled to match the app's own dark gameplay
// theme and brand palette rather than the bright cartoon look common to
// mainstream quiz games.

interface FishingSceneProps {
  phase: FishingPhase;
  reducedMotion: boolean;
}

export function FishingScene({ phase, reducedMotion }: FishingSceneProps) {
  const lineOut = phase === "waiting" || phase === "hooked" || phase === "reeling";
  const bobberX = phase === "reeling" ? 300 : 470;

  return (
    <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 shadow-xl">
      <svg
        viewBox="0 0 800 340"
        className="w-full h-auto block"
        role="img"
        aria-label="A cyber analyst casting a line into a dark data ocean"
      >
        <defs>
          <linearGradient id="nightSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b1220" />
            <stop offset="60%" stopColor="#111f3a" />
            <stop offset="100%" stopColor="#14304f" />
          </linearGradient>
          <linearGradient id="dataSea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0c2740" />
            <stop offset="100%" stopColor="#04101c" />
          </linearGradient>
          <radialGradient id="horizonGlow" cx="0.5" cy="1" r="0.75">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="800" height="340" fill="url(#nightSky)" />
        <rect y="90" width="800" height="150" fill="url(#horizonGlow)" />

        {/* Faint data motes instead of clouds */}
        {[
          [70, 48], [140, 92], [250, 40], [355, 74], [470, 36],
          [560, 88], [640, 52], [720, 96], [780, 44],
        ].map(([x, y], i) => (
          <motion.circle
            key={i}
            cx={x}
            cy={y}
            r={i % 3 === 0 ? 2.2 : 1.5}
            fill="#7dd3fc"
            initial={false}
            animate={reducedMotion ? { opacity: 0.5 } : { opacity: [0.25, 0.8, 0.25] }}
            transition={reducedMotion ? {} : { duration: 3 + (i % 4), repeat: Infinity, ease: "easeInOut" }}
          />
        ))}

        {/* Sea */}
        <rect y="215" width="800" height="125" fill="url(#dataSea)" />

        {/* Network grid beneath the surface */}
        <g stroke="#22d3ee" strokeOpacity="0.14" strokeWidth="1">
          {[245, 275, 305].map((y) => (
            <line key={y} x1="0" y1={y} x2="800" y2={y} />
          ))}
          {Array.from({ length: 11 }).map((_, i) => (
            <line key={i} x1={i * 80} y1="215" x2={i * 80 - 40} y2="340" />
          ))}
        </g>

        {/* Surface crests */}
        {[0, 1].map((row) => (
          <motion.g
            key={row}
            initial={false}
            animate={reducedMotion ? {} : { x: row % 2 === 0 ? [0, 24, 0] : [0, -24, 0] }}
            transition={reducedMotion ? {} : { duration: 7 + row * 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <path
              d={Array.from({ length: 18 })
                .map((_, i) => `M ${i * 48 - 24} ${220 + row * 20} q 12 -8 24 0 q 12 8 24 0`)
                .join(" ")}
              fill="none"
              stroke="#67e8f9"
              strokeOpacity={0.30 - row * 0.12}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </motion.g>
        ))}

        {/* Dock — a sleek platform rather than timber planks */}
        <rect x="0" y="196" width="250" height="18" rx="4" fill="#1e293b" />
        <rect x="0" y="196" width="250" height="3" rx="1.5" fill="#38bdf8" fillOpacity="0.7" />
        <rect x="52" y="214" width="16" height="54" fill="#0f172a" />
        <rect x="168" y="214" width="16" height="54" fill="#0f172a" />

        {/* Analyst — shield head, brand blue */}
        <g transform="translate(150 118)">
          <rect x="6" y="52" width="54" height="46" rx="12" fill="#1e3a8a" />
          <path
            d="M33 2 L62 13 V38 C62 56 48 66 33 72 C18 66 4 56 4 38 V13 Z"
            fill="#1d4ed8"
            stroke="#60a5fa"
            strokeWidth="2.5"
          />
          {/* keyhole emblem */}
          <circle cx="33" cy="32" r="7" fill="#7dd3fc" />
          <rect x="30" y="36" width="6" height="12" rx="3" fill="#7dd3fc" />
          {/* visor eyes */}
          <circle cx="24" cy="23" r="3.2" fill="#0b1220" />
          <circle cx="42" cy="23" r="3.2" fill="#0b1220" />
          <rect x="52" y="62" width="26" height="9" rx="4.5" fill="#1e3a8a" transform="rotate(-24 52 62)" />
        </g>

        {/* Rod + line */}
        <g>
          <line x1="205" y1="166" x2="268" y2="118" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" />
          <circle cx="222" cy="153" r="5.5" fill="#334155" stroke="#64748b" strokeWidth="2" />
          {lineOut && (
            <motion.line
              x1="268"
              y1="118"
              initial={false}
              animate={{ x2: bobberX, y2: 238 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: "easeOut" }}
              stroke="#67e8f9"
              strokeOpacity="0.7"
              strokeWidth="1.5"
            />
          )}
        </g>

        {/* Bobber — a glowing signal buoy */}
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
            <circle cx="470" cy="238" r="14" fill="#22d3ee" fillOpacity="0.18" />
            <circle cx="470" cy="238" r="7" fill="#22d3ee" />
            <circle cx="470" cy="235" r="2.5" fill="#ecfeff" />
          </motion.g>
        )}
      </svg>
    </div>
  );
}
