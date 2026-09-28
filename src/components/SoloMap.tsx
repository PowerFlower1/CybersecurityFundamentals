import { motion } from "motion/react";
import { Lock, CheckCircle, ChevronRight, Route, Shuffle } from "lucide-react";
import { cn } from "../lib/utils";
import {
  SOLO_DIFFICULTIES,
  type SoloDifficulty,
} from "../lib/questions";

export const CONCEPTS = [
  { id: "art_of_defending", name: "Art of Defending", icon: "🛡️" },
  { id: "confidentiality", name: "Confidentiality", icon: "🤫" },
  { id: "integrity", name: "Integrity", icon: "✓" },
  { id: "availability", name: "Availability", icon: "⚡" },
  { id: "authentication", name: "Authentication", icon: "🔑" }
];

const DIFFICULTY_LABELS: Record<SoloDifficulty, string> = {
  all: "Mixed",
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

interface SoloMapProps {
  unlockedConcepts: string[];
  completedConcepts: string[];
  onSelectConcept: (conceptId: string) => void;
  onSelectAllTopics: () => void;
  onBack: () => void;
  difficulty: SoloDifficulty;
  onDifficultyChange: (difficulty: SoloDifficulty) => void;
  /** Questions available per difficulty for the whole bank (all topics). */
  availability: Record<SoloDifficulty, number>;
  /** Questions available for each concept at the current difficulty. */
  conceptCounts: Record<string, number>;
}

export function SoloMap({
  unlockedConcepts,
  completedConcepts,
  onSelectConcept,
  onSelectAllTopics,
  onBack,
  difficulty,
  onDifficultyChange,
  availability,
  conceptCounts,
}: SoloMapProps) {
  const allTopicsCount = availability[difficulty] ?? 0;

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Route className="w-8 h-8 text-blue-600" /> Your Cyber Skills Path
          </h2>
          <p className="text-slate-600 font-medium">
            Build the five core skills one at a time, or test yourself across all of them.
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 font-bold transition-all text-sm"
        >
          Back
        </button>
      </div>

      {/* Difficulty selector */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest shrink-0">
          Difficulty
        </p>
        <div className="flex flex-wrap gap-2">
          {SOLO_DIFFICULTIES.map((level) => {
            const count = availability[level] ?? 0;
            const disabled = count === 0;
            return (
              <button
                key={level}
                onClick={() => !disabled && onDifficultyChange(level)}
                disabled={disabled}
                title={disabled ? "No questions at this level yet" : `${count} questions available`}
                className={cn(
                  "px-4 py-2 rounded-xl border text-sm font-bold transition-all",
                  difficulty === level
                    ? "bg-blue-600 text-white border-blue-700"
                    : disabled
                      ? "bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50",
                )}
              >
                {DIFFICULTY_LABELS[level]}
                <span className="ml-1.5 font-mono text-[11px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* All-topics challenge */}
      <motion.button
        whileHover={allTopicsCount > 0 ? { scale: 1.01 } : {}}
        whileTap={allTopicsCount > 0 ? { scale: 0.99 } : {}}
        onClick={() => allTopicsCount > 0 && onSelectAllTopics()}
        disabled={allTopicsCount === 0}
        className={cn(
          "mb-6 w-full flex items-center gap-5 p-6 rounded-3xl border text-left transition-all",
          allTopicsCount > 0
            ? "bg-slate-900 border-slate-700 text-white shadow-md hover:shadow-lg"
            : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed",
        )}
      >
        <div
          className={cn(
            "w-14 h-14 rounded-2xl flex items-center justify-center shrink-0",
            allTopicsCount > 0 ? "bg-white/10 border border-white/10" : "bg-slate-200",
          )}
        >
          <Shuffle className={cn("w-7 h-7", allTopicsCount > 0 ? "text-blue-300" : "text-slate-400")} />
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">
            Mixed practice
          </p>
          <h3 className="text-xl font-bold">All Topics Challenge</h3>
          <p className={cn("text-sm mt-1", allTopicsCount > 0 ? "text-slate-400" : "text-slate-400")}>
            {allTopicsCount > 0
              ? `Questions drawn from all five skills · ${allTopicsCount} available at ${DIFFICULTY_LABELS[difficulty]}`
              : "No questions at this difficulty yet"}
          </p>
        </div>
        {allTopicsCount > 0 && (
          <div className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center shrink-0">
            <ChevronRight className="w-5 h-5" />
          </div>
        )}
      </motion.button>

      <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] p-8 md:p-12 overflow-hidden relative shadow-sm">
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900 via-transparent to-transparent" />

         <div className="relative flex flex-col items-center justify-between h-full max-h-[600px] max-w-xl mx-auto gap-8">
           {CONCEPTS.map((concept, idx) => {
             const isUnlocked = unlockedConcepts.includes(concept.id);
             const isCompleted = completedConcepts.includes(concept.id);
             const count = conceptCounts[concept.id] ?? 0;
             const isEmpty = count === 0;
             const canStart = isUnlocked && !isEmpty;

             return (
               <div key={concept.id} className="relative flex flex-col items-center w-full z-10">
                 {/* Connection Line */}
                 {idx < CONCEPTS.length - 1 && (
                   <div className="absolute top-[100%] left-1/2 -translate-x-1/2 h-16 w-1 border-l-2 border-dashed border-slate-200 -z-10" />
                 )}
                 {idx < CONCEPTS.length - 1 && isCompleted && (
                   <div className="absolute top-[100%] left-1/2 -translate-x-1/2 h-16 w-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] -z-10" />
                 )}

                 <motion.button
                   whileHover={canStart ? { scale: 1.05 } : {}}
                   whileTap={canStart ? { scale: 0.95 } : {}}
                   onClick={() => canStart && onSelectConcept(concept.id)}
                   disabled={!canStart}
                   className={cn(
                     "group relative w-full flex items-center gap-6 p-6 rounded-3xl border transition-all text-left",
                     "focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/50",
                     canStart
                       ? isCompleted
                         ? "bg-emerald-50 border-emerald-200 shadow-sm"
                         : "bg-white border-blue-200 shadow-md hover:shadow-lg hover:border-blue-400"
                       : "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                   )}
                 >
                   <div className={cn(
                     "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 transition-transform",
                     canStart ? (isCompleted ? "bg-emerald-100" : "bg-blue-100 group-hover:scale-110") : "bg-slate-200 grayscale"
                   )}>
                     {concept.icon}
                   </div>

                   <div className="flex-1">
                     <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">
                       Skill 0{idx + 1}
                     </p>
                     <h3 className={cn("text-xl font-bold", canStart ? "text-slate-900" : "text-slate-500")}>
                        {concept.name}
                     </h3>
                     <p className="text-xs text-slate-500 mt-1">
                       {!isUnlocked
                         ? "Complete the previous skill to unlock"
                         : isEmpty
                           ? `No ${DIFFICULTY_LABELS[difficulty]} questions yet`
                           : `${count} question${count === 1 ? "" : "s"} at ${DIFFICULTY_LABELS[difficulty]}`}
                     </p>
                   </div>

                   <div className="pr-4">
                     {isUnlocked ? (
                       isCompleted ? (
                         <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                           <CheckCircle className="w-5 h-5" />
                         </div>
                       ) : (
                         <div className={cn(
                           "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                           isEmpty
                             ? "bg-slate-200 text-slate-400"
                             : "bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
                         )}>
                           <ChevronRight className="w-5 h-5" />
                         </div>
                       )
                     ) : (
                       <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center">
                         <Lock className="w-5 h-5 flex-shrink-0" aria-label="Locked" />
                       </div>
                     )}
                   </div>
                 </motion.button>
               </div>
             )
           })}
         </div>
      </div>
    </div>
  )
}
