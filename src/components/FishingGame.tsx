import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import { FishingScene } from "./FishingScene";
import {
  advanceOnInput,
  biteDelay,
  fishForDifficulty,
  isInteractivePhase,
  phaseDuration,
  tileStyle,
  type FishingPhase,
} from "../lib/fishing";
import type { Question } from "../constants";

interface FishingGameProps {
  question: Question;
  /** True once the answer has been submitted and the explanation is showing. */
  showExplanation: boolean;
  isCorrect: boolean | null;
  userAnswer: string;
  onAnswer: (answer: string) => void;
  reducedMotion: boolean;
  /** Called when the question first appears, so the timer starts then and the
   *  cast/reel beats don't eat the learner's clock. */
  onQuestionReady: () => void;
}

/** A small shape per tile so options are distinguishable without colour. */
function TileShape({ shape }: { shape: string }) {
  const common = "w-5 h-5 shrink-0";
  if (shape === "triangle")
    return (
      <svg className={common} viewBox="0 0 20 20" aria-hidden="true">
        <polygon points="10,3 18,17 2,17" fill="currentColor" />
      </svg>
    );
  if (shape === "diamond")
    return (
      <svg className={common} viewBox="0 0 20 20" aria-hidden="true">
        <polygon points="10,2 18,10 10,18 2,10" fill="currentColor" />
      </svg>
    );
  if (shape === "circle")
    return (
      <svg className={common} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="currentColor" />
      </svg>
    );
  return (
    <svg className={common} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}

export function FishingGame({
  question,
  showExplanation,
  isCorrect,
  userAnswer,
  onAnswer,
  reducedMotion,
  onQuestionReady,
}: FishingGameProps) {
  const [phase, setPhase] = useState<FishingPhase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fish = fishForDifficulty(question.difficulty);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // Reset the loop whenever a new question arrives.
  useEffect(() => {
    clearTimers();
    setPhase("idle");
    return clearTimers;
  }, [question.id]);

  // Drive the automatic phases.
  useEffect(() => {
    if (phase === "casting") {
      later(() => setPhase("waiting"), phaseDuration("casting", reducedMotion));
    } else if (phase === "waiting") {
      later(() => setPhase("hooked"), biteDelay(reducedMotion));
    } else if (phase === "reeling") {
      later(() => {
        setPhase("question");
        onQuestionReady();
      }, phaseDuration("reeling", reducedMotion));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reducedMotion]);

  const handleInput = useCallback(() => {
    const next = advanceOnInput(phase);
    if (next) setPhase(next);
  }, [phase]);

  // Keyboard equivalent for "click anywhere" — the scene must not be mouse-only.
  useEffect(() => {
    if (!isInteractivePhase(phase)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleInput();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleInput]);

  const prompt =
    phase === "idle"
      ? "Click anywhere to cast your line"
      : phase === "hooked"
        ? "Signal on the line — click anywhere to reel in"
        : phase === "casting"
          ? "Casting…"
          : phase === "waiting"
            ? "Scanning the depths…"
            : "Reeling in…";

  if (phase !== "question") {
    return (
      <div className="flex-1 flex flex-col justify-center gap-6">
        <button
          type="button"
          onClick={handleInput}
          aria-label={isInteractivePhase(phase) ? prompt : undefined}
          aria-disabled={!isInteractivePhase(phase)}
          className={cn(
            "relative block w-full text-left rounded-3xl",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70",
            isInteractivePhase(phase) ? "cursor-pointer" : "cursor-default",
          )}
        >
          <FishingScene phase={phase} reducedMotion={reducedMotion} />

          {phase === "hooked" && (
            <motion.div
              initial={reducedMotion ? false : { y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="absolute top-5 right-5 flex items-center gap-3 bg-slate-900/85 backdrop-blur-sm border border-cyan-400/50 px-5 py-3 rounded-xl shadow-lg"
            >
              <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                {!reducedMotion && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                )}
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
              </span>
              <div>
                <p className="text-sm font-bold tracking-[0.18em] uppercase text-cyan-300 leading-none">
                  Signal on the line
                </p>
                <p className="text-[11px] text-slate-400 mt-1">Click anywhere to reel in</p>
              </div>
            </motion.div>
          )}
        </button>

        <p className="text-center text-lg font-bold text-slate-200" role="status" aria-live="polite">
          {prompt}
        </p>
      </div>
    );
  }

  // --- Question phase: large colour + shape tiles -------------------------
  const options = question.options ?? [];

  return (
    <div className="flex-1 flex flex-col justify-center gap-6">
      <div className="text-center space-y-3 max-w-3xl mx-auto">
        <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-mono uppercase text-emerald-400">
          {fish.emoji} {fish.name} on the line · {question.difficulty}
        </span>
        <h2 className="text-2xl lg:text-4xl font-bold leading-tight tracking-tight text-white">
          {question.question}
        </h2>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {options.map((option, idx) => {
          const style = tileStyle(idx);
          const isRight = option === question.correctAnswer;
          const isPicked = userAnswer === option;
          const dim = showExplanation && !isRight && !isPicked;

          return (
            <motion.button
              key={idx}
              type="button"
              disabled={showExplanation}
              onClick={() => onAnswer(option)}
              whileHover={!showExplanation && !reducedMotion ? { scale: 1.02 } : {}}
              whileTap={!showExplanation && !reducedMotion ? { scale: 0.98 } : {}}
              className={cn(
                "relative flex items-center gap-4 p-5 md:p-6 rounded-2xl border text-left text-white font-semibold text-base md:text-lg backdrop-blur-sm transition-all",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
                style.bg,
                !showExplanation && style.hover,
                style.ring,
                showExplanation && isRight && "border-emerald-400 bg-emerald-500/20 ring-2 ring-emerald-400",
                showExplanation && isPicked && !isRight && "border-rose-400 bg-rose-500/20 ring-2 ring-rose-400",
                dim && "opacity-35",
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-1.5 shrink-0 w-14 h-10 rounded-lg bg-white/10 border border-white/10",
                  style.ring,
                )}
              >
                <TileShape shape={style.shape} />
                <span className="font-mono text-xs font-bold">{style.letter}</span>
              </span>
              <span className="flex-1 text-slate-100">{option}</span>
              {showExplanation && isRight && (
                <span className="sr-only"> — correct answer</span>
              )}
              {showExplanation && isPicked && !isRight && (
                <span className="sr-only"> — your answer, incorrect</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {showExplanation && (
        <p
          className={cn(
            "text-center text-lg font-bold",
            isCorrect ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {isCorrect
            ? `Landed it! ${fish.emoji} You caught the ${fish.name}.`
            : `${fish.emoji} The ${fish.name} got away — check the explanation below.`}
        </p>
      )}
    </div>
  );
}
