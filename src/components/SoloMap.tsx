import { motion } from "motion/react";
import { Lock, Unlock, CheckCircle, ChevronRight, Map } from "lucide-react";
import { cn } from "../lib/utils";

export const CONCEPTS = [
  { id: "art_of_defending", name: "Art of Defending", icon: "🛡️" },
  { id: "confidentiality", name: "Confidentiality", icon: "🤫" },
  { id: "integrity", name: "Integrity", icon: "✓" },
  { id: "availability", name: "Availability", icon: "⚡" },
  { id: "authentication", name: "Authentication", icon: "🔑" }
];

interface SoloMapProps {
  unlockedConcepts: string[];
  completedConcepts: string[];
  onSelectConcept: (conceptId: string) => void;
  onBack: () => void;
}

export function SoloMap({ unlockedConcepts, completedConcepts, onSelectConcept, onBack }: SoloMapProps) {
  return (
    <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <Map className="w-8 h-8 text-blue-600" /> Training Campaign
          </h2>
          <p className="text-slate-600 font-medium">Complete missions to unlock new sectors.</p>
        </div>
        <button onClick={onBack} className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-100 font-bold transition-all text-sm">
          Disconnect
        </button>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-[2.5rem] p-12 overflow-hidden relative shadow-sm">
         <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900 via-transparent to-transparent" />
         
         <div className="relative flex flex-col items-center justify-between h-full max-h-[600px] max-w-xl mx-auto gap-8">
           {CONCEPTS.map((concept, idx) => {
             const isUnlocked = unlockedConcepts.includes(concept.id);
             const isCompleted = completedConcepts.includes(concept.id);
             
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
                   whileHover={isUnlocked ? { scale: 1.05 } : {}}
                   whileTap={isUnlocked ? { scale: 0.95 } : {}}
                   onClick={() => isUnlocked && onSelectConcept(concept.id)}
                   className={cn(
                     "group relative w-full flex items-center gap-6 p-6 rounded-3xl border transition-all text-left",
                     isUnlocked
                       ? isCompleted
                         ? "bg-emerald-50 border-emerald-200 shadow-sm"
                         : "bg-white border-blue-200 shadow-md hover:shadow-lg hover:border-blue-400"
                       : "bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed"
                   )}
                 >
                   <div className={cn(
                     "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0 transition-transform",
                     isUnlocked ? (isCompleted ? "bg-emerald-100" : "bg-blue-100 group-hover:scale-110") : "bg-slate-200 grayscale"
                   )}>
                     {concept.icon}
                   </div>
                   
                   <div className="flex-1">
                     <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Sector 0{idx + 1}</p>
                     <h3 className={cn("text-xl font-bold", isUnlocked ? "text-slate-900" : "text-slate-500")}>
                        {concept.name}
                     </h3>
                   </div>

                   <div className="pr-4">
                     {isUnlocked ? (
                       isCompleted ? (
                         <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-sm">
                           <CheckCircle className="w-5 h-5" />
                         </div>
                       ) : (
                         <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                           <ChevronRight className="w-5 h-5" />
                         </div>
                       )
                     ) : (
                       <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-400 flex items-center justify-center">
                         <Lock className="w-5 h-5 flex-shrink-0" />
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
