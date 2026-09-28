import { motion } from "motion/react";
import { CheckCircle2, AlertCircle, Users } from "lucide-react";
import { cn } from "../lib/utils";
import type { GameShowView } from "../lib/api";

// The student's phone/laptop view during a game show. The projector carries the
// spectacle; this screen answers one question at a time: "is it my turn, and
// what do I tap?"

const TEAM_CLASSES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-400/40", dot: "bg-blue-500" },
  rose: { bg: "bg-rose-500/15", text: "text-rose-300", border: "border-rose-400/40", dot: "bg-rose-500" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-400/40", dot: "bg-emerald-500" },
  amber: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-400/40", dot: "bg-amber-500" },
};
const teamClass = (color?: string) => TEAM_CLASSES[color ?? "blue"] ?? TEAM_CLASSES.blue;

export interface GameShowPlayerProps {
  gameshow: GameShowView;
  /** The team this student plays for. */
  myTeamId?: string;
  playerName?: string;
  /** Result of this student's last answer, cleared when the turn moves on. */
  lastResult: { correct: boolean; correctAnswer: string } | null;
  /** True while an answer is in flight. */
  submitting: boolean;
  /** Set once anyone on the team has answered this question. */
  answered: boolean;
  onAnswer: (option: string) => void;
}

export function GameShowPlayer({
  gameshow,
  myTeamId,
  playerName,
  lastResult,
  submitting,
  answered,
  onAnswer,
}: GameShowPlayerProps) {
  const activeTeam = gameshow.teams[gameshow.turnIndex];
  const myTeam = gameshow.teams.find((t) => t.id === myTeamId);
  const myTurn = !!myTeamId && activeTeam?.id === myTeamId;
  const tc = teamClass(myTeam?.color);
  const question = gameshow.question;
  const canAnswer = myTurn && gameshow.phase === "question" && !!question && !answered;

  return (
    <div className="flex-1 flex flex-col gap-5 max-w-2xl mx-auto w-full py-4">
      {/* Who am I, and whose turn is it */}
      <div className={cn("rounded-2xl border p-4 flex items-center justify-between gap-3", tc.bg, tc.border)}>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Your team</p>
          <p className={cn("text-xl font-black truncate", tc.text)}>{myTeam?.name ?? "—"}</p>
          {playerName && <p className="text-xs text-slate-400 truncate">Playing as {playerName}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Score</p>
          <p className="text-2xl font-black font-mono text-white">{myTeam?.score ?? 0}</p>
        </div>
      </div>

      {/* Turn banner */}
      <div
        className={cn(
          "rounded-2xl p-3 text-center font-bold",
          myTurn ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/40" : "bg-white/5 text-slate-400 border border-white/10",
        )}
        role="status"
        aria-live="polite"
      >
        {myTurn ? "Your team's turn" : `${activeTeam?.name ?? "Another team"}'s turn — watch the board`}
      </div>

      {/* Main stage */}
      {gameshow.phase === "question" && question ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-black text-sm font-black">
              {gameshow.spin?.label}
              {gameshow.doubleNext ? " ×2" : ""}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              {String(question.concept ?? "").replace(/_/g, " ")}
            </span>
          </div>

          <h2 className="text-xl font-bold leading-snug text-white">{question.question}</h2>

          <div className="grid gap-3">
            {question.options?.map((opt, i) => {
              const isChosenWrong = lastResult && !lastResult.correct && answered;
              const isTheAnswer = lastResult && opt === lastResult.correctAnswer;
              return (
                <button
                  key={i}
                  onClick={() => onAnswer(opt)}
                  disabled={!canAnswer || submitting}
                  className={cn(
                    "text-left p-4 rounded-2xl border transition-colors",
                    "focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]",
                    canAnswer
                      ? "bg-white/5 border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-white"
                      : "bg-white/5 border-white/10 text-slate-400 cursor-not-allowed",
                    lastResult && isTheAnswer && "border-emerald-500 bg-emerald-500/10 text-emerald-300",
                    isChosenWrong && !isTheAnswer && "opacity-50",
                  )}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {!myTurn && (
            <p className="text-sm text-slate-500 text-center">
              Only {activeTeam?.name} can answer this one.
            </p>
          )}
          {myTurn && answered && !lastResult && (
            <p className="text-sm text-slate-400 text-center">
              A teammate already answered — check the board.
            </p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-8 min-h-[200px]">
          <Users className="w-8 h-8 text-slate-500" />
          <p className="text-lg font-bold text-white">
            {gameshow.phase === "idle" ? "Waiting for the wheel" : "Between turns"}
          </p>
          <p className="text-sm text-slate-400 max-w-xs">
            {gameshow.lastOutcome ?? "Watch the board — your host is spinning."}
          </p>
        </div>
      )}

      {/* Answer feedback */}
      {lastResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "rounded-2xl border p-4 flex items-start gap-3",
            lastResult.correct
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-rose-500/10 border-rose-500/30",
          )}
          role="status"
          aria-live="polite"
        >
          {lastResult.correct ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className={cn("font-bold", lastResult.correct ? "text-emerald-300" : "text-rose-300")}>
              {lastResult.correct ? "Correct!" : "Not quite"}
            </p>
            {!lastResult.correct && (
              <p className="text-sm text-slate-300">Answer: {lastResult.correctAnswer}</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Standings */}
      <div className="grid grid-cols-2 gap-2">
        {[...gameshow.teams]
          .sort((a, b) => b.score - a.score)
          .map((t) => {
            const c = teamClass(t.color);
            return (
              <div
                key={t.id}
                className={cn(
                  "rounded-xl px-3 py-2 flex items-center justify-between gap-2 border",
                  t.id === myTeamId ? cn(c.bg, c.border) : "bg-white/5 border-white/10",
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", c.dot)} />
                  <span className="text-sm font-bold text-white truncate">{t.name}</span>
                </span>
                <span className="font-mono font-bold text-white">{t.score}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
