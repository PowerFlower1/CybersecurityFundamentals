import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { WHEEL } from "../lib/gameshow";
import type { GameShowView } from "../lib/api";

// The host's projector view: designed to be read from the back of a classroom,
// so type is large, contrast is high, and only one thing demands attention at
// a time.

const TEAM_CLASSES: Record<string, { bg: string; text: string; ring: string; solid: string }> = {
  blue: { bg: "bg-blue-500/15", text: "text-blue-300", ring: "ring-blue-400", solid: "bg-blue-500" },
  rose: { bg: "bg-rose-500/15", text: "text-rose-300", ring: "ring-rose-400", solid: "bg-rose-500" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-300", ring: "ring-emerald-400", solid: "bg-emerald-500" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-300", ring: "ring-amber-400", solid: "bg-amber-500" },
};
const teamClass = (color: string) => TEAM_CLASSES[color] ?? TEAM_CLASSES.blue;

/** Wheel segment colours, alternating so slices are distinguishable. */
function segmentFill(index: number, kind: string) {
  if (kind === "bankrupt") return "#0f172a";
  if (kind === "lose_turn") return "#7f1d1d";
  if (kind === "double") return "#a16207";
  return index % 2 === 0 ? "#1d4ed8" : "#1e40af";
}

const SEGMENT_ANGLE = 360 / WHEEL.length;

/** SVG wedge path for one segment of the wheel. */
function wedgePath(index: number, radius: number) {
  const start = (index * SEGMENT_ANGLE - 90) * (Math.PI / 180);
  const end = ((index + 1) * SEGMENT_ANGLE - 90) * (Math.PI / 180);
  const x1 = radius + radius * Math.cos(start);
  const y1 = radius + radius * Math.sin(start);
  const x2 = radius + radius * Math.cos(end);
  const y2 = radius + radius * Math.sin(end);
  return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
}

interface WheelProps {
  /** Index of the landed segment, or null when idle. */
  landedIndex: number | null;
  spinning: boolean;
  reducedMotion: boolean;
}

function Wheel({ landedIndex, spinning, reducedMotion }: WheelProps) {
  const R = 150;
  // Rotate so the landed segment's centre sits under the pointer at top.
  const target =
    landedIndex === null ? 0 : -(landedIndex * SEGMENT_ANGLE + SEGMENT_ANGLE / 2);
  // Extra full turns make it feel like a real spin (skipped for reduced motion).
  const rotation = landedIndex === null ? 0 : target - (reducedMotion ? 0 : 360 * 3);

  return (
    <div className="relative w-[300px] h-[300px] shrink-0">
      {/* Pointer */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-2 z-10 w-0 h-0 border-l-[14px] border-r-[14px] border-t-[26px] border-l-transparent border-r-transparent border-t-amber-400 drop-shadow-lg" />
      <motion.svg
        width={R * 2}
        height={R * 2}
        viewBox={`0 0 ${R * 2} ${R * 2}`}
        animate={{ rotate: rotation }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { duration: spinning ? 2.4 : 0, ease: [0.17, 0.67, 0.2, 1] }
        }
        className="drop-shadow-2xl"
      >
        {WHEEL.map((seg, i) => {
          const mid = i * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 - 90;
          const tx = R + R * 0.65 * Math.cos((mid * Math.PI) / 180);
          const ty = R + R * 0.65 * Math.sin((mid * Math.PI) / 180);
          return (
            <g key={seg.id}>
              <path d={wedgePath(i, R)} fill={segmentFill(i, seg.kind)} stroke="#0b1220" strokeWidth="2" />
              <text
                x={tx}
                y={ty}
                fill="white"
                fontSize={seg.kind === "points" ? 20 : 11}
                fontWeight="700"
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${mid + 90}, ${tx}, ${ty})`}
              >
                {seg.label}
              </text>
            </g>
          );
        })}
        <circle cx={R} cy={R} r="26" fill="#0b1220" stroke="#f59e0b" strokeWidth="3" />
      </motion.svg>
    </div>
  );
}

export interface GameShowHostProps {
  code: string;
  gameshow: GameShowView;
  playerCount: number;
  onSpin: () => void;
  onNextTurn: () => void;
  onEnd: () => void;
  busy?: boolean;
  reducedMotion?: boolean;
}

export function GameShowHost({
  code,
  gameshow,
  playerCount,
  onSpin,
  onNextTurn,
  onEnd,
  busy = false,
  reducedMotion = false,
}: GameShowHostProps) {
  const team = gameshow.teams[gameshow.turnIndex];
  const landedIndex = gameshow.spin ? WHEEL.findIndex((s) => s.id === gameshow.spin!.id) : null;
  const tc = team ? teamClass(team.color) : teamClass("blue");
  const ranked = [...gameshow.teams].sort((a, b) => b.score - a.score);

  return (
    <div className="flex-1 flex flex-col gap-6">
      {/* Header: join code + roster size */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Join at this code
          </p>
          <p className="text-4xl font-black font-mono tracking-tight text-white">{code}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Players</p>
          <p className="text-2xl font-bold text-white">{playerCount}</p>
        </div>
      </div>

      {/* Whose turn */}
      <div className={cn("rounded-3xl p-5 text-center ring-2", tc.bg, tc.ring)}>
        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-300">Now playing</p>
        <p className={cn("text-4xl font-black tracking-tight", tc.text)}>{team?.name ?? "—"}</p>
        {gameshow.doubleNext && (
          <p className="mt-1 text-sm font-bold text-amber-300">Double armed — next question is worth 2×</p>
        )}
      </div>

      <div className="grid lg:grid-cols-[auto_1fr] gap-8 items-start">
        <Wheel
          landedIndex={landedIndex}
          spinning={gameshow.phase !== "idle"}
          reducedMotion={reducedMotion}
        />

        {/* Stage: question, outcome, or prompt to spin */}
        <div className="flex flex-col gap-5 min-h-[300px]">
          {gameshow.phase === "idle" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 rounded-3xl border border-white/10 bg-white/5 p-8">
              <p className="text-2xl font-bold text-white">Ready to spin</p>
              <p className="text-slate-400 max-w-sm">
                {team?.name} is up. Spin the wheel to reveal their question.
              </p>
            </div>
          )}

          {gameshow.phase === "question" && gameshow.question && (
            <div className="flex-1 rounded-3xl border border-white/10 bg-white/5 p-8 space-y-5">
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-amber-400 text-black text-sm font-black">
                  {gameshow.spin?.label}
                  {gameshow.doubleNext ? " ×2" : ""}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  {String(gameshow.question.concept ?? "").replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-3xl font-bold leading-snug text-white">
                {gameshow.question.question}
              </p>
              <ul className="grid sm:grid-cols-2 gap-3">
                {gameshow.question.options?.map((opt, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-lg text-slate-200"
                  >
                    {opt}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-slate-400">
                {team?.name} answers on their devices — the board updates automatically.
              </p>
            </div>
          )}

          {gameshow.phase === "resolved" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 rounded-3xl border border-white/10 bg-white/5 p-8">
              <p className="text-4xl font-black text-white">{gameshow.spin?.label}</p>
              <p className="text-xl text-slate-300">{gameshow.lastOutcome}</p>
            </div>
          )}

          {/* Host controls */}
          <div className="flex flex-wrap gap-3">
            {gameshow.phase === "idle" ? (
              <button
                onClick={onSpin}
                disabled={busy || playerCount === 0}
                className="flex-1 min-w-[180px] py-5 rounded-2xl bg-amber-400 text-black text-xl font-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {playerCount === 0 ? "Waiting for players" : busy ? "Spinning…" : "SPIN THE WHEEL"}
              </button>
            ) : (
              <button
                onClick={onNextTurn}
                disabled={busy || gameshow.phase === "question"}
                title={gameshow.phase === "question" ? "Waiting for the team to answer" : undefined}
                className="flex-1 min-w-[180px] py-5 rounded-2xl bg-white text-black text-xl font-black hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {gameshow.phase === "question" ? "Waiting for an answer…" : "NEXT TEAM"}
              </button>
            )}
            <button
              onClick={onEnd}
              className="px-6 py-5 rounded-2xl bg-rose-500/15 text-rose-300 border border-rose-500/30 font-bold hover:bg-rose-500/25 transition-colors"
            >
              End Game
            </button>
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ranked.map((t, i) => {
          const c = teamClass(t.color);
          const isActive = t.id === team?.id;
          return (
            <div
              key={t.id}
              className={cn(
                "rounded-2xl p-4 border flex items-center justify-between gap-3",
                isActive ? cn(c.bg, "border-white/20 ring-2", c.ring) : "bg-white/5 border-white/10",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={cn("w-3 h-3 rounded-full shrink-0", c.solid)} />
                <span className="font-bold text-white truncate">{t.name}</span>
                {i === 0 && t.score > 0 && <span className="text-amber-400 text-sm">★</span>}
              </div>
              <span className="text-2xl font-black font-mono text-white">{t.score}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
