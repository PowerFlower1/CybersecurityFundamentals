import { useState, useEffect, useRef, useMemo, type ReactNode } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Trophy,
  RotateCcw,
  Brain,
  Terminal,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Lock,
  Users,
  LogOut,
  Play,
  UserPlus,
  Trash2,
  Award,
  Zap,
  Target,
  Star,
  Map as MapIcon,
  FileCheck,
  Activity,
  KeyRound,
  Copy,
  Crown,
} from "lucide-react";
import confetti from "canvas-confetti";
import { CYBER_QUESTIONS, type Question } from "./constants";
import { cn } from "./lib/utils";
import { audio } from "./lib/audio";
import { SoloMap, CONCEPTS } from "./components/SoloMap";
import {
  api,
  getInstructorToken,
  setInstructorToken,
  clearInstructorToken,
  type RoomState,
} from "./lib/api";

// Local identity (no Firebase). Instructors hold a server-issued token; students
// hold a server-issued player id + token for the session they joined.
interface SessionUser {
  uid: string;
  displayName: string | null;
  isAnonymous: boolean;
}

type GameState = "login" | "lobby" | "waiting" | "hosting" | "playing" | "results" | "admin_dashboard" | "campaign";

// Per-session student identity, returned by the server on join.
const PLAYER_KEY = "rfc_player";

const CONCEPT_ICONS: Record<string, ReactNode> = {
  art_of_defending: <ShieldCheck className="w-5 h-5" />,
  confidentiality: <Lock className="w-5 h-5" />,
  integrity: <FileCheck className="w-5 h-5" />,
  availability: <Activity className="w-5 h-5" />,
  authentication: <KeyRound className="w-5 h-5" />,
};

interface PlayerData {
  uid: string;
  name: string;
  score: number;
  history?: { question: Question; correct: boolean; timeTaken: number }[];
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const playerInfoRef = useRef<{ code: string; id: string; token: string; name: string } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [gameState, setGameState] = useState<GameState>("login");
  const [roomId, setRoomId] = useState("");
  const [roomData, setRoomData] = useState<any>(null);
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [bankQuestions, setBankQuestions] = useState<Question[]>(CYBER_QUESTIONS);
  const [adminTab, setAdminTab] = useState<"sessions" | "questions" | "metrics">("sessions");
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [aiSuggestions, setAiSuggestions] = useState<{title: string, description: string}[] | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [userAnswer, setUserAnswer] = useState("");
  const [showExplanation, setShowExplanation] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [gameHistory, setGameHistory] = useState<
    { question: Question; correct: boolean; timeTaken: number }[]
  >([]);
  const [guestName, setGuestName] = useState("");
  const [guestRoomId, setGuestRoomId] = useState("");
  const [instructorPassword, setInstructorPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);
  const [allRooms, setAllRooms] = useState<any[]>([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Campaign State
  const [unlockedConcepts, setUnlockedConcepts] = useState<string[]>(() => {
    const saved = localStorage.getItem("rfc_unlocked_concepts");
    return saved ? JSON.parse(saved) : ['art_of_defending'];
  });
  const [completedConcepts, setCompletedConcepts] = useState<string[]>(() => {
    const saved = localStorage.getItem("rfc_completed_concepts");
    return saved ? JSON.parse(saved) : [];
  });
  const [activeCampaignConcept, setActiveCampaignConcept] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("rfc_unlocked_concepts", JSON.stringify(unlockedConcepts));
    localStorage.setItem("rfc_completed_concepts", JSON.stringify(completedConcepts));
  }, [unlockedConcepts, completedConcepts]);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [difficultyFilter, setDifficultyFilter] = useState<
    "all" | "easy" | "medium" | "hard"
  >("all");
  const [sessionDurationMinutes, setSessionDurationMinutes] =
    useState<number>(5);
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(10);
  const [timePerQuestion, setTimePerQuestion] = useState<number>(20);

  const filteredQuestions = useMemo(() => {
    if ((gameState === "campaign" || activeCampaignConcept) && bankQuestions.length > 0) {
      const conceptIdx = CONCEPTS.findIndex((c) => c.id === activeCampaignConcept);
      if (conceptIdx !== -1) {
         // Because each concept has exactly 3 questions sequentially
         const startIndex = conceptIdx * 3;
         return bankQuestions.slice(startIndex, startIndex + 3);
      }
    }

    const questions =
      difficultyFilter === "all"
        ? [...bankQuestions]
        : bankQuestions.filter((q) => q.difficulty === difficultyFilter);

    if (roomId) {
      let seed = 0;
      for (let i = 0; i < roomId.length; i++) {
        seed += roomId.charCodeAt(i);
      }
      const random = () => {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      };

      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    } else {
      // Basic random shuffle for local/no room yet
      for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
      }
    }

    // Use room's question count if available, otherwise local config
    const targetCount = roomData?.questionCount || numberOfQuestions;
    return questions.slice(0, targetCount);
  }, [difficultyFilter, roomId, roomData?.questionCount, numberOfQuestions, bankQuestions]);

  const currentQuestion = filteredQuestions[currentQuestionIndex];

  // Restore an instructor session (if the token is still in sessionStorage).
  useEffect(() => {
    if (getInstructorToken()) {
      setIsAdmin(true);
      setUser({ uid: "instructor", displayName: "Instructor", isAnonymous: false });
      setGameState("lobby");
    }
  }, []);

  // Room polling — replaces the Firestore room + players listeners. Both the
  // host and students poll the same server endpoint for live state.
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const data: RoomState = await api.getRoom(roomId);
        if (cancelled) return;
        setRoomData(data);
        setPlayers(
          data.players.map((p) => ({ uid: p.id, name: p.name, score: p.score })) as PlayerData[],
        );
        if (data.difficulty) {
          setDifficultyFilter(data.difficulty as "all" | "easy" | "medium" | "hard");
        }
        // Host ended the session before a waiting student started — release them.
        if (data.status === "finished" && gameState === "waiting") {
          setGameState("results");
        }
      } catch (err: any) {
        if (cancelled) return;
        // 404 → room was deleted/expired. Send everyone but the host home.
        if (err?.status === 404 && gameState !== "lobby" && gameState !== "login" && gameState !== "hosting") {
          setRoomId("");
          setGameState(user?.isAnonymous ? "login" : "lobby");
        }
      }
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, gameState, user?.isAnonymous]);

  // Question bank — fetched from the server (seeded from the built-in set).
  useEffect(() => {
    let cancelled = false;
    api
      .getQuestions()
      .then((data) => {
        if (cancelled) return;
        setBankQuestions(data.questions?.length ? (data.questions as Question[]) : CYBER_QUESTIONS);
      })
      .catch(() => {
        if (!cancelled) setBankQuestions(CYBER_QUESTIONS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Admin dashboard — poll the list of active sessions.
  useEffect(() => {
    if (gameState !== "admin_dashboard" || !isAdmin) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await api.listSessions();
        if (!cancelled) setAllRooms(data.sessions.map((s: any) => ({ id: s.code, ...s })));
      } catch (e) {
        console.error("Error fetching sessions:", e);
      }
    };
    poll();
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [gameState, isAdmin]);

  useEffect(() => {
    if (
      gameState === "waiting" &&
      roomData?.status === "started" &&
      countdown === null
    ) {
      setCountdown(3);
      audio.playStart();
      let count = 3;
      const interval = setInterval(() => {
        count -= 1;
        if (count > 0) {
          setCountdown(count);
          audio.playTick();
        } else {
          clearInterval(interval);
          setCountdown(null);
          startGameLocally();
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [roomData?.status, gameState]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if ((gameState === "playing" || gameState === "hosting") && roomData?.endTime) {
      interval = setInterval(() => {
        const remaining = Math.max(
          0,
          Math.floor((roomData.endTime - Date.now()) / 1000),
        );
        setSessionTimeLeft(remaining);

        if (remaining === 0) {
          // Students advance to their results; the host stays on the monitor
          // to review the final leaderboard.
          if (gameState === "playing") {
            setGameState("results");
            audio.playEnd();
          }
          clearInterval(interval);
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState, roomData?.endTime]);

  const handleLogin = async (e: any) => {
    e.preventDefault();
    if (!instructorPassword) return;
    setIsAuthenticating(true);
    setLoginError("");
    try {
      const { token } = await api.login(instructorPassword);
      setInstructorToken(token);
      setInstructorPassword("");
      setIsAdmin(true);
      setUser({ uid: "instructor", displayName: "Instructor", isAnonymous: false });
      setGameState("lobby");
    } catch (error: any) {
      if (error?.status === 429) {
        setLoginError("Too many attempts. Please wait a moment and try again.");
      } else if (error?.status === 401) {
        setLoginError("Incorrect password. Please try again.");
      } else {
        setLoginError("Could not reach the server. Please try again.");
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = () => {
    clearInstructorToken();
    sessionStorage.removeItem(PLAYER_KEY);
    playerInfoRef.current = null;
    setIsAdmin(false);
    setUser(null);
    setRoomId("");
    setRoomData(null);
    setGameState("login");
  };

  const handleGuestJoin = async (e: any) => {
    e.preventDefault();
    if (!guestName || !guestRoomId) return;
    setIsAuthenticating(true);
    setJoinError("");
    try {
      const code = guestRoomId.toUpperCase();
      const { playerId, playerToken } = await api.joinSession(code, guestName);
      const info = { code, id: playerId, token: playerToken, name: guestName };
      playerInfoRef.current = info;
      sessionStorage.setItem(PLAYER_KEY, JSON.stringify(info));
      setUser({ uid: playerId, displayName: guestName, isAnonymous: true });
      setRoomId(code);
      setGameState("waiting");
    } catch (error: any) {
      setJoinError(error?.message || "Could not join. Check the code and try again.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const createRoom = async () => {
    if (!isAdmin) return;
    try {
      const { code } = await api.createSession({
        difficulty: difficultyFilter,
        questionCount: numberOfQuestions,
        timePerQuestion,
        hostName: user?.displayName || "Instructor",
      });
      // The host monitors the session; they do not join as a player.
      setRoomId(code);
      setRoomData(null);
      setPlayers([]);
      setSessionTimeLeft(null);
      setGameState("hosting");
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const startRoomGame = async () => {
    if (!roomId) return;
    try {
      await api.startSession(roomId, sessionDurationMinutes);
    } catch (error) {
      console.error("Failed to start session:", error);
    }
  };

  // Host ends the live session early; this also ends it for every student.
  const endRoomGame = async () => {
    if (!roomId) return;
    try {
      await api.endSession(roomId);
    } catch (error) {
      console.error("Failed to end session:", error);
    }
  };

  // Host leaves the monitor and returns to the lobby. The session keeps running
  // on the server and can be cleaned up from the admin dashboard.
  const leaveHosting = () => {
    setRoomId("");
    setRoomData(null);
    setPlayers([]);
    setSessionTimeLeft(null);
    setGameState("lobby");
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; the code is shown on screen regardless.
    }
  };

  const handleSeedQuestions = async () => {
    if (!isAdmin) return;
    try {
      const reset = CYBER_QUESTIONS.map((q) => ({ ...q }));
      await api.saveQuestions(reset);
      setBankQuestions(reset);
    } catch (e) {
      console.error("Error resetting questions:", e);
    }
  };

  const fetchMetricsAndAI = async () => {
    setMetricsLoading(true);
    try {
      const computedMetrics = await api.getMetrics();
      setMetricsData(computedMetrics);
      try {
        const aiData = await api.analyzeMetrics(computedMetrics);
        if (aiData.suggestions) setAiSuggestions(aiData.suggestions);
      } catch (e) {
        console.error("Failed to fetch AI suggestions:", e);
      }
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setMetricsLoading(false);
    }
  };

  const handleSaveQuestion = async (q: Question) => {
    if (!isAdmin) return;
    try {
      if (!q.id) {
        q.id = Math.random().toString(36).substring(2, 9);
      }
      const exists = bankQuestions.some((b) => b.id === q.id);
      const next = exists
        ? bankQuestions.map((b) => (b.id === q.id ? q : b))
        : [...bankQuestions, q];
      await api.saveQuestions(next);
      setBankQuestions(next);
      setEditingQuestion(null);
    } catch (e) {
      console.error("Error saving question:", e);
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!isAdmin) return;
    try {
      const next = bankQuestions.filter((b) => b.id !== id);
      await api.saveQuestions(next);
      setBankQuestions(next);
    } catch (e) {
      console.error("Error deleting question:", e);
    }
  };

  useEffect(() => {
    if (adminTab === 'metrics' && !metricsData) {
       fetchMetricsAndAI();
    }
  }, [adminTab]);

  const handleDeleteRoom = async (roomIdToDelete: string) => {
    if (!isAdmin) return;
    try {
      await api.deleteSession(roomIdToDelete);
      setAllRooms(prev => prev.filter(r => r.id !== roomIdToDelete));
    } catch (error) {
       console.error("Failed to delete session:", error);
    }
  };

  const startGameLocally = () => {
    setGameState("playing");
    setConfirmExit(false);
    setCurrentQuestionIndex(0);
    setScore(0);
    setGameHistory([]);
    resetQuestionState();
    audio.playStart();
  };

  const handleStartCampaignConcept = (conceptId: string) => {
    setActiveCampaignConcept(conceptId);
    setGameState("playing");
    setConfirmExit(false);
    setCurrentQuestionIndex(0);
    setScore(0);
    setGameHistory([]);
    resetQuestionState();
    audio.playStart();
  };

  const handleExitGame = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const wasCampaign = !!activeCampaignConcept;
    setConfirmExit(false);
    setActiveCampaignConcept(null);
    setCurrentQuestionIndex(0);
    setScore(0);
    setGameHistory([]);
    setSessionTimeLeft(null);
    setCountdown(null);
    resetQuestionState();

    if (wasCampaign) {
      // Solo mission: back to the skill map
      setGameState("campaign");
      return;
    }

    // Live session: leave the room
    setRoomId("");
    setRoomData(null);
    if (user?.isAnonymous) {
      // Guests have nowhere else to go — drop them back to the home page
      sessionStorage.removeItem(PLAYER_KEY);
      playerInfoRef.current = null;
      setUser(null);
      setGameState("login");
    } else {
      setGameState(user ? "lobby" : "login");
    }
  };

  const resetQuestionState = () => {
    setTimeLeft(roomData?.timePerQuestion || timePerQuestion);
    setUserAnswer("");
    setShowExplanation(false);
    setIsCorrect(null);
  };

  const syncScoreAndHistory = async (newScore: number, history: any) => {
    const info = playerInfoRef.current;
    if (!info || !roomId) return;
    try {
      await api.submitScore(roomId, info.id, info.token, newScore, history);
    } catch (error) {
      console.error("Failed to sync score:", error);
    }
  };

  useEffect(() => {
    if (gameState === "playing" && !showExplanation) {
      if (timeLeft > 0) {
        timerRef.current = setTimeout(() => {
          if (timeLeft <= 6) {
            // will tick continuously for 5, 4, 3, 2, 1
            audio.playTick();
          }
          setTimeLeft((prev) => prev - 1);
        }, 1000);
      } else {
        handleAnswerSubmit("");
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, gameState, showExplanation]);

  const handleAnswerSubmit = (answer: string) => {
    if (showExplanation) return;
    const correct =
      answer.toLowerCase() === currentQuestion.correctAnswer.toLowerCase();
    setIsCorrect(correct);
    let newScore = score;
    if (correct) {
      audio.playCorrect();
      newScore = score + 100 + timeLeft * 5;
      setScore(newScore);
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#22c55e", "#ffffff"],
      });
    } else {
      audio.playIncorrect();
    }
    const maxTime = roomData?.timePerQuestion || timePerQuestion;
    const newHistoryEntry = {
      question: currentQuestion,
      correct,
      timeTaken: maxTime - Math.max(0, timeLeft),
    };
    const newHistory = [...gameHistory, newHistoryEntry];
    setGameHistory(newHistory);
    syncScoreAndHistory(newScore, newHistory);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < filteredQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      resetQuestionState();
    } else {
      setGameState("results");
      audio.playEnd();
      confetti({
        particleCount: 150,
        spread: 120,
        origin: { y: 0.5 },
      });
    }
  };

  const accuracy =
    gameHistory.length > 0
      ? Math.round(
          (gameHistory.filter((h) => h.correct).length / gameHistory.length) *
            100,
        )
      : 0;
  const correctAnswersList = gameHistory.filter((h) => h.correct);
  const fastestTime =
    correctAnswersList.length > 0
      ? Math.min(...correctAnswersList.map((h) => h.timeTaken))
      : "-";

  const getPlayerBadges = (playerHistory: { question: Question; correct: boolean; timeTaken: number }[] | undefined) => {
    if (!playerHistory || playerHistory.length === 0) return [];
    const badges = [];
    
    const pAccuracy = Math.round((playerHistory.filter(h => h.correct).length / playerHistory.length) * 100);
    const pCorrect = playerHistory.filter(h => h.correct);
    const pFastest = pCorrect.length > 0 ? Math.min(...pCorrect.map(h => h.timeTaken)) : null;

    if (pAccuracy === 100) {
        badges.push({ name: 'Perfect Operator', icon: Target, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' });
    } else if (pAccuracy >= 80) {
        badges.push({ name: 'Elite Hacker', icon: Star, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' });
    }

    if (pFastest !== null && pFastest <= 5) {
        badges.push({ name: 'Speed Demon', icon: Zap, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' });
    }

    if (pCorrect.length >= 5) {
         badges.push({ name: 'Streak Master', icon: Award, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' });
    }

    return badges;
  };

  useEffect(() => {
    if (gameState === "results" && activeCampaignConcept) {
      if (accuracy === 100) {
        const idx = CONCEPTS.findIndex(c => c.id === activeCampaignConcept);
        setCompletedConcepts(prev => Array.from(new Set([...prev, activeCampaignConcept])));
        if (idx < CONCEPTS.length - 1) {
           setUnlockedConcepts(prev => Array.from(new Set([...prev, CONCEPTS[idx + 1].id])));
        }
      }
    }
  }, [gameState, accuracy, activeCampaignConcept]);

  return (
    <div
      className={cn(
        "min-h-[100dvh] w-full font-sans relative flex flex-col",
        (gameState === "login" || gameState === "lobby" || gameState === "admin_dashboard" || gameState === "waiting" || gameState === "hosting")
          ? "bg-slate-50 text-slate-900 overflow-y-auto"
          : "bg-[#050505] text-slate-100 selection:bg-blue-500/30 overflow-hidden",
      )}
    >
      {/* Animated Background */}
      {gameState !== "login" && gameState !== "lobby" && gameState !== "admin_dashboard" && gameState !== "waiting" && gameState !== "hosting" && (
        <div className="fixed inset-0 z-0 pointer-events-none">
          {/* Animated Grid */}
          <div className="absolute inset-0 [mask-image:linear-gradient(to_bottom,white,transparent)]">
            <motion.div
              animate={{ backgroundPosition: ["0px 0px", "0px 40px"] }}
              transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"
            />
          </div>

          {/* Ambient Orbs */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              x: [0, 50, 0],
              y: [0, -30, 0],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-0 left-[20%] w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] mix-blend-screen"
          />
          <motion.div
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.2, 0.4, 0.2],
              x: [0, -50, 0],
              y: [0, 50, 0],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
            className="absolute bottom-[-10%] right-[10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] mix-blend-screen"
          />

          {/* Cyber Scanning Line */}
          <motion.div
            animate={{ y: ["-10vh", "110vh"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent shadow-[0_0_10px_rgba(16,185,129,0.5)]"
          />

          {/* Data Stream Code Rain effect elements */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={`stream-${i}`}
              className="absolute w-[1px] bg-gradient-to-b from-transparent via-emerald-500/40 to-transparent h-64"
              initial={{ y: "-30vh", left: `${15 + i * 14}%` }}
              animate={{ y: "120vh" }}
              transition={{
                duration: 3 + (i % 3) * 1.5,
                repeat: Infinity,
                delay: i * 0.7,
                ease: "linear",
              }}
            />
          ))}
        </div>
      )}

      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 py-8 lg:py-12 flex flex-col flex-1">
        <AnimatePresence mode="wait">
          {gameState === "campaign" && (
            <motion.div 
              key="campaign" 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex flex-col flex-1"
            >
              <SoloMap
                 unlockedConcepts={unlockedConcepts}
                 completedConcepts={completedConcepts}
                 onSelectConcept={handleStartCampaignConcept}
                 onBack={() => {
                   setGameState("login");
                   setActiveCampaignConcept(null);
                 }}
              />
            </motion.div>
          )}

          {gameState === "login" && (
            <motion.div
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex-1 flex flex-col items-center w-full"
            >
              <div className="max-w-5xl mx-auto w-full space-y-14 py-10">
                {/* Hero */}
                <div className="text-center space-y-6">
                  <motion.img
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                    src="/rfc-logo.svg"
                    alt="Ready Force Cyber logo"
                    className="w-28 h-28 md:w-36 md:h-36 mx-auto"
                  />
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs tracking-widest uppercase">
                    <Shield className="w-3.5 h-3.5" />
                    Ready Force Labs · Project AIDE
                  </div>
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 px-4">
                    Learn Cybersecurity{" "}
                    <span className="text-blue-600">by Playing</span>
                  </h1>
                  <p className="text-slate-600 text-base md:text-xl max-w-2xl mx-auto px-4 leading-relaxed">
                    Short, game-style missions that teach the five core concepts
                    every digital citizen should know. Answer questions, beat the
                    clock, and learn from instant feedback — no experience needed.
                  </p>

                  {/* What you'll learn */}
                  <div className="pt-6 space-y-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">
                      The Five Core Concepts
                    </p>
                    <div className="max-w-4xl mx-auto px-4">
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {CONCEPTS.map((c, i) => (
                          <motion.div
                            key={c.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + i * 0.08 }}
                            className="flex flex-col items-center gap-3 px-4 py-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-200 hover:shadow-md transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 text-blue-600 flex items-center justify-center">
                              {CONCEPT_ICONS[c.id]}
                            </div>
                            <div className="space-y-1 text-center">
                              <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em]">
                                {String(i + 1).padStart(2, "0")}
                              </p>
                              <p className="text-[13px] font-semibold text-slate-800 leading-tight">
                                {c.name}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Two ways to play */}
                <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl mx-auto text-left items-stretch px-4 md:px-0">
                  {/* Students: join a class */}
                  <div className="relative p-8 md:p-10 bg-white border-2 border-blue-200 rounded-3xl space-y-6 shadow-xl shadow-blue-100/60">
                    <div className="absolute -top-3.5 left-8 px-3 py-1 bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest rounded-full">
                      In class right now?
                    </div>
                    <div className="space-y-2">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                        <Users className="w-6 h-6" />
                      </div>
                      <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
                        Join Your Class Session
                      </h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Your teacher will share a 6-letter session code. Type it
                        in with your name and you're ready to play together.
                      </p>
                    </div>

                    <form onSubmit={handleGuestJoin} className="space-y-5">
                      <div className="space-y-2">
                        <label
                          htmlFor="student-name"
                          className="block text-xs font-semibold text-slate-700 uppercase tracking-wider ml-1"
                        >
                          Your Name
                        </label>
                        <input
                          id="student-name"
                          type="text"
                          placeholder="First & Last Name"
                          required
                          maxLength={20}
                          value={guestName}
                          onChange={(e) => setGuestName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        />
                      </div>
                      <div className="space-y-2">
                        <label
                          htmlFor="session-code"
                          className="block text-xs font-semibold text-slate-700 uppercase tracking-wider ml-1"
                        >
                          Session Code
                        </label>
                        <input
                          id="session-code"
                          type="text"
                          placeholder="e.g. AB3X9K"
                          required
                          maxLength={6}
                          autoComplete="off"
                          value={guestRoomId}
                          onChange={(e) => {
                            setGuestRoomId(e.target.value.toUpperCase());
                            if (joinError) setJoinError("");
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-slate-900 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono font-medium tracking-[0.3em]"
                        />
                      </div>
                      {joinError && (
                        <p className="text-sm font-medium text-rose-600 text-center">
                          {joinError}
                        </p>
                      )}
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 text-lg"
                      >
                        {isAuthenticating ? "Connecting..." : "Join Session"}{" "}
                        <ChevronRight className="w-5 h-5" />
                      </motion.button>
                    </form>
                  </div>

                  {/* Solo practice */}
                  <div className="p-8 md:p-10 bg-slate-900 text-white rounded-3xl space-y-6 shadow-xl shadow-slate-900/20 flex flex-col">
                    <div className="space-y-2">
                      <div className="w-12 h-12 bg-white/10 border border-white/10 rounded-xl flex items-center justify-center mb-4">
                        <MapIcon className="w-6 h-6 text-blue-300" />
                      </div>
                      <div className="text-blue-300 font-bold uppercase tracking-widest text-xs flex items-center gap-2">
                        <Star className="w-3 h-3" /> Learn at your own pace
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight">
                        Practice Solo
                      </h3>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        No class? No problem. Work through the five concepts one
                        mission at a time on your personal skill map.
                      </p>
                    </div>

                    <ul className="space-y-3 flex-1">
                      {[
                        "No account or sign-in needed",
                        "Unlock each concept as you master the last",
                        "Every answer comes with a clear explanation",
                      ].map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-3 text-sm text-slate-300"
                        >
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>

                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setGameState("campaign")}
                      className="w-full bg-white text-slate-900 font-bold py-4 rounded-2xl hover:bg-blue-50 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 text-lg"
                    >
                      Start Training <ChevronRight className="w-5 h-5" />
                    </motion.button>
                  </div>
                </div>

                {/* How it works */}
                <div className="w-full max-w-4xl mx-auto space-y-6 px-4 md:px-0">
                  <h2 className="text-center text-2xl font-extrabold tracking-tight text-slate-900">
                    How it works
                  </h2>
                  <div className="grid sm:grid-cols-3 gap-4">
                    {[
                      {
                        step: "1",
                        icon: <Play className="w-5 h-5" />,
                        title: "Jump in",
                        text: "Join your class with a code, or start a solo mission — it takes seconds.",
                      },
                      {
                        step: "2",
                        icon: <Timer className="w-5 h-5" />,
                        title: "Answer & race the clock",
                        text: "Quick multiple-choice challenges. Faster correct answers earn more points.",
                      },
                      {
                        step: "3",
                        icon: <Brain className="w-5 h-5" />,
                        title: "Learn from every answer",
                        text: "Right or wrong, each question ends with a plain-language explanation.",
                      },
                    ].map((s) => (
                      <div
                        key={s.step}
                        className="p-6 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-sm"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                            {s.icon}
                          </div>
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Step {s.step}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900">{s.title}</h3>
                        <p className="text-sm text-slate-500 leading-relaxed">
                          {s.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Teacher access */}
                <div className="w-full max-w-4xl mx-auto px-4 md:px-0">
                  <div className="flex flex-col md:flex-row items-center gap-6 p-8 bg-emerald-50/70 border border-emerald-200 rounded-3xl">
                    <div className="w-12 h-12 bg-white text-emerald-600 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-center md:text-left space-y-1">
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                        Teaching a class?
                      </h3>
                      <p className="text-sm text-slate-600">
                        Enter the instructor password to host live sessions,
                        manage the question bank, and see how your class is doing.
                      </p>
                    </div>
                    <form onSubmit={handleLogin} className="shrink-0 text-center w-full md:w-auto">
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <label htmlFor="instructor-password" className="sr-only">
                          Instructor password
                        </label>
                        <input
                          id="instructor-password"
                          type="password"
                          placeholder="Instructor password"
                          required
                          autoComplete="current-password"
                          value={instructorPassword}
                          onChange={(e) => {
                            setInstructorPassword(e.target.value);
                            if (loginError) setLoginError("");
                          }}
                          className="w-full sm:w-56 bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium"
                        />
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          type="submit"
                          disabled={isAuthenticating}
                          className="px-6 py-3.5 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                        >
                          {isAuthenticating ? "Checking..." : "Sign In"}
                        </motion.button>
                      </div>
                      <p
                        className={cn(
                          "text-[11px] font-medium mt-2",
                          loginError ? "text-rose-600" : "text-slate-500",
                        )}
                      >
                        {loginError || "Authorized instructors only"}
                      </p>
                    </form>
                  </div>
                </div>
              </div>

              <div className="text-center text-slate-400 text-sm mt-4 opacity-70 mb-4 font-medium flex items-center justify-center gap-2">
                <img src="/rfc-logo.svg" alt="" className="w-6 h-6" />
                <span>Created by</span>
                <span className="font-bold text-slate-600">Ready Force Cyber Labs</span>
              </div>
            </motion.div>
          )}

          {gameState === "lobby" && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col items-center justify-center py-12 space-y-12 w-full max-w-5xl mx-auto"
            >
              <div className="flex items-center gap-4 fixed top-6 right-6 z-20">
                {isAdmin && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setGameState("admin_dashboard")}
                    className="px-4 py-2 bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold text-xs uppercase tracking-widest hidden sm:block shadow-sm hover:bg-blue-200 transition-colors"
                  >
                    Admin Dashboard
                  </motion.button>
                )}
                <div className="hidden sm:block text-right">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    Instructor
                  </p>
                  <p className="text-xs font-bold text-slate-900">
                    {user?.displayName || "Instructor"}
                  </p>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSignOut}
                  className="p-2.5 bg-white hover:bg-rose-50 rounded-full text-slate-500 hover:text-rose-500 transition-all border border-slate-200 shadow-sm"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </motion.button>
              </div>

              <div className="text-center space-y-4 max-w-2xl px-4">
                 <div className="inline-block px-4 py-1.5 rounded-full bg-blue-100 text-blue-700 font-semibold text-xs tracking-widest uppercase mb-2">
                    Project AIDE: Learning Operations
                  </div>
                <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
                  Assessment Control
                </h2>
                <p className="text-slate-600 text-base md:text-lg">
                  Configure assessment parameters, select the difficulty level, and launch a new live session for your students.
                </p>
              </div>

              {/* Difficulty Selection */}
              {isAdmin && (
                <div className="flex flex-col space-y-3 w-full max-w-4xl px-4 items-center">
                  <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Security Clearance Level</p>
                  <div className="flex flex-wrap justify-center gap-4">
                    {["all", "easy", "medium", "hard"].map((diff) => (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        key={diff}
                        onClick={() => setDifficultyFilter(diff as any)}
                        className={cn(
                          "px-6 py-3 rounded-2xl font-semibold text-sm transition-all shadow-sm",
                          difficultyFilter === diff
                            ? "bg-blue-600 text-white shadow-md border border-blue-700"
                            : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900",
                        )}
                      >
                        {diff === "all" ? "Mixed" : diff.charAt(0).toUpperCase() + diff.slice(1)} Clearance
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Advanced Settings */}
              {isAdmin && (
                <div className="flex flex-col md:flex-row items-center gap-6 px-4 w-full max-w-4xl">
                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider pl-2">
                      Question Count
                    </p>
                    <div className="flex bg-slate-100 rounded-2xl p-1.5 border border-slate-200">
                      {[5, 10, 15, 20].map((num) => (
                        <button
                          key={num}
                          onClick={() => setNumberOfQuestions(num)}
                          className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                            numberOfQuestions === num
                              ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                              : "text-slate-500 hover:text-slate-800",
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider pl-2">
                      Time per Question
                    </p>
                    <div className="flex bg-slate-100 rounded-2xl p-1.5 border border-slate-200">
                      {[10, 20, 30, 60].map((time) => (
                        <button
                          key={time}
                          onClick={() => setTimePerQuestion(time)}
                          className={cn(
                            "px-5 py-2.5 rounded-xl text-sm font-bold transition-all",
                            timePerQuestion === time
                              ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                              : "text-slate-500 hover:text-slate-800",
                          )}
                        >
                          {time}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Host Action */}
              <div className="w-full max-w-2xl px-4 mt-4">
                <motion.button
                  whileHover={{ scale: 1.01, translateY: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={createRoom}
                  className="group relative w-full flex flex-col md:flex-row items-center gap-6 p-8 md:p-10 bg-white border border-slate-200 rounded-3xl text-center md:text-left hover:shadow-xl hover:border-blue-200 transition-all shadow-md shadow-slate-200/50"
                >
                  <div className="p-5 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 group-hover:bg-blue-100 transition-all duration-300 shrink-0">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-slate-900 mb-1">
                      Host New Session
                    </h3>
                    <p className="text-sm text-slate-500">
                      Generate a join code, share it with your students, and
                      monitor the leaderboard live as they play.
                    </p>
                  </div>
                  <div className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl flex items-center gap-2 shrink-0 group-hover:bg-blue-700 transition-colors">
                    <Play className="w-5 h-5 fill-current" /> Start
                  </div>
                </motion.button>
                <p className="text-center text-xs text-slate-400 mt-4 font-medium">
                  Students join from the home page using your session code.
                </p>
              </div>

              {/* Concept Info Footer Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl px-4 pb-8">
                {[
                  {
                    label: "Confidentiality",
                    icon: <Lock className="w-5 h-5" />,
                  },
                  { label: "Integrity", icon: <Shield className="w-5 h-5" /> },
                  {
                    label: "Availability",
                    icon: <Timer className="w-5 h-5" />,
                  },
                  {
                    label: "Authentication",
                    icon: <UserPlus className="w-5 h-5" />,
                  },
                ].map((concept, i) => (
                  <motion.div
                    whileHover={{ scale: 1.02, translateY: -2 }}
                    whileTap={{ scale: 0.98 }}
                    key={concept.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="p-4 bg-white border border-slate-200 rounded-2xl flex flex-col items-center gap-3 text-center group hover:border-blue-200 hover:shadow-md hover:shadow-blue-900/5 transition-all cursor-pointer"
                  >
                    <div className="p-2.5 bg-slate-50 rounded-xl text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      {concept.icon}
                    </div>
                    <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-900 transition-colors">
                      {concept.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {gameState === "waiting" && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col space-y-8 relative max-w-4xl mx-auto w-full py-8 px-4"
            >
              {countdown !== null && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/90 backdrop-blur-sm rounded-3xl flex-col">
                  <motion.div
                    key={countdown}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: [1.5, 1], opacity: 1 }}
                    exit={{ opacity: 0, scale: 2 }}
                    className="text-9xl font-black font-mono text-blue-600 drop-shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                  >
                    {countdown}
                  </motion.div>
                  <p className="text-blue-600/70 mt-6 font-semibold uppercase tracking-widest animate-pulse">
                    Initializing Assessment...
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 p-8 rounded-3xl text-center space-y-4 shadow-sm shadow-blue-900/5">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                  You're in! Session Code
                </p>
                <h2 className="text-5xl md:text-7xl font-black font-mono tracking-tighter text-blue-700">
                  {roomId}
                </h2>
                <div className="flex justify-center mt-6">
                  <span
                    className={cn(
                      "px-5 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm",
                      difficultyFilter === "easy"
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : difficultyFilter === "medium"
                          ? "bg-yellow-100 text-yellow-700 border border-yellow-200"
                          : difficultyFilter === "hard"
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-blue-100 text-blue-700 border border-blue-200",
                    )}
                  >
                    Difficulty:{" "}
                    {difficultyFilter === "all" ? "MIXED" : difficultyFilter}
                  </span>
                </div>
                <p className="text-slate-500 text-base mt-6 font-medium flex items-center justify-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
                  </span>
                  Waiting for your instructor to start the session...
                </p>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="flex items-center gap-2 font-bold text-lg text-slate-900">
                    <Users className="w-5 h-5 text-blue-600" />
                    In the Session
                  </h3>
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    {players.length} Joined
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 gap-4 overflow-y-auto pr-2 custom-scrollbar max-h-[40vh]">
                  {players.map((p) => (
                    <motion.div
                      layout
                      key={p.uid}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center font-bold text-xl text-blue-600">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 truncate">
                        <p className="font-bold text-slate-900 truncate text-lg">{p.name}</p>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                          Status: Connected
                        </p>
                      </div>
                    </motion.div>
                  ))}
                  
                  {players.length === 0 && (
                    <div className="col-span-1 sm:col-span-2 p-10 text-center text-slate-500 border border-dashed border-slate-300 rounded-3xl bg-slate-50 mt-2">
                       <p className="font-medium text-slate-600">Waiting for classmates to join...</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {gameState === "hosting" && (
            <motion.div
              key="hosting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col space-y-8 relative max-w-4xl mx-auto w-full py-8 px-4"
            >
              {(() => {
                const started = roomData?.status === "started";
                const ended =
                  roomData?.status === "finished" || sessionTimeLeft === 0;
                const live = started && !ended;

                return (
                  <>
                    {/* Header: code + controls */}
                    <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row md:items-center gap-6">
                      <div className="flex-1 text-center md:text-left">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center justify-center md:justify-start gap-2">
                          <Crown className="w-4 h-4" /> Hosting · Session Code
                        </p>
                        <div className="flex items-center justify-center md:justify-start gap-3 mt-2">
                          <h2 className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-slate-900">
                            {roomId}
                          </h2>
                          <button
                            onClick={copyRoomCode}
                            title="Copy code"
                            className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 transition-all"
                          >
                            {codeCopied ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                        <p className="text-slate-500 text-sm mt-2 font-medium">
                          {ended
                            ? "Session ended — final results below."
                            : live
                              ? "Session live. Students are playing now."
                              : "Share this code so students can join from the home page."}
                        </p>
                      </div>

                      {live && sessionTimeLeft !== null && (
                        <div className="flex flex-col items-center bg-slate-900 text-white rounded-2xl px-6 py-4 shrink-0">
                          <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                            Time Left
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Timer className="w-5 h-5 text-emerald-400" />
                            <span className="text-3xl font-bold font-mono">
                              {Math.floor(sessionTimeLeft / 60)
                                .toString()
                                .padStart(2, "0")}
                              :
                              {(sessionTimeLeft % 60).toString().padStart(2, "0")}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Pre-start: duration picker */}
                    {!started && !ended && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-sm">
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-widest shrink-0">
                          Session Time Limit
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                          {[1, 3, 5, 10, 15].map((min) => (
                            <button
                              key={min}
                              onClick={() => setSessionDurationMinutes(min)}
                              className={cn(
                                "px-6 py-2.5 rounded-xl border text-sm font-bold transition-all shadow-sm",
                                sessionDurationMinutes === min
                                  ? "bg-blue-600 text-white border-blue-700 hover:bg-blue-700"
                                  : "bg-white text-slate-600 border-slate-200 hover:bg-blue-50",
                              )}
                            >
                              {min} min
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Roster / live leaderboard */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <h3 className="flex items-center gap-2 font-bold text-lg text-slate-900">
                          {live || ended ? (
                            <Trophy className="w-5 h-5 text-amber-500" />
                          ) : (
                            <Users className="w-5 h-5 text-blue-600" />
                          )}
                          {live || ended ? "Live Leaderboard" : "Students Joined"}
                        </h3>
                        <span className="text-xs font-semibold uppercase text-slate-500">
                          {players.length}{" "}
                          {live || ended ? "Playing" : "Joined"}
                        </span>
                      </div>

                      {!started ? (
                        <div className="grid sm:grid-cols-2 gap-4 overflow-y-auto pr-2 custom-scrollbar max-h-[40vh]">
                          {players.map((p) => (
                            <motion.div
                              layout
                              key={p.uid}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm"
                            >
                              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center font-bold text-xl text-blue-600">
                                {p.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 truncate">
                                <p className="font-bold text-slate-900 truncate text-lg">
                                  {p.name}
                                </p>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                                  Connected
                                </p>
                              </div>
                            </motion.div>
                          ))}
                          {players.length === 0 && (
                            <div className="col-span-1 sm:col-span-2 p-10 text-center text-slate-500 border border-dashed border-slate-300 rounded-3xl bg-slate-50 mt-2">
                              <p className="font-medium text-slate-600">
                                Awaiting student connections...
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar max-h-[45vh]">
                          {players.map((p, idx) => (
                            <motion.div
                              layout
                              key={p.uid}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={cn(
                                "flex items-center gap-4 p-4 rounded-2xl border shadow-sm",
                                idx === 0
                                  ? "bg-amber-50 border-amber-200"
                                  : "bg-white border-slate-200",
                              )}
                            >
                              <div
                                className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shrink-0",
                                  idx === 0
                                    ? "bg-amber-400 text-white"
                                    : "bg-slate-100 text-slate-500",
                                )}
                              >
                                {idx + 1}
                              </div>
                              <p className="flex-1 font-bold text-slate-900 truncate text-lg">
                                {p.name}
                              </p>
                              <p className="font-mono font-bold text-xl text-slate-900">
                                {p.score.toLocaleString()}
                              </p>
                            </motion.div>
                          ))}
                          {players.length === 0 && (
                            <div className="p-10 text-center text-slate-500 border border-dashed border-slate-300 rounded-3xl bg-slate-50">
                              <p className="font-medium text-slate-600">
                                No students are playing this session.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="space-y-3 pt-2">
                      {!started && !ended && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={startRoomGame}
                          disabled={players.length === 0}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center justify-center gap-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Play className="w-5 h-5 fill-current" />
                          {players.length === 0
                            ? "Waiting for students to join"
                            : `Begin Session (${players.length} ready)`}
                        </motion.button>
                      )}

                      {live && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={endRoomGame}
                          className="w-full py-4 bg-rose-50 text-rose-600 border border-rose-200 font-bold rounded-2xl hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                        >
                          End Session Now
                        </motion.button>
                      )}

                      {ended && (
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={leaveHosting}
                          className="w-full py-5 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 text-lg"
                        >
                          Back to Lobby <ChevronRight className="w-5 h-5" />
                        </motion.button>
                      )}

                      {!ended && (
                        <button
                          onClick={leaveHosting}
                          className="w-full py-3 text-slate-500 hover:text-slate-800 font-semibold text-sm transition-colors"
                        >
                          {live ? "Leave monitor (session keeps running)" : "Cancel session"}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          )}

          {gameState === "playing" && (
            <motion.div
              key="playing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col space-y-6"
            >
              <div className="flex gap-2 overflow-x-auto pb-2 mb-2 no-scrollbar">
                {(roomId
                  ? players
                  : [
                      {
                        uid: user?.uid || "solo",
                        name: user?.displayName || guestName || "Solo Agent",
                        score,
                      },
                    ]
                )
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 5)
                  .map((p, idx) => (
                    <div
                      key={p.uid}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-xl border min-w-[80px]",
                        p.uid === user?.uid
                          ? "bg-emerald-500/20 border-emerald-500/50"
                          : "bg-white/5 border-white/10",
                      )}
                    >
                      <p className="text-[8px] font-mono text-slate-500 uppercase truncate w-14 text-center">
                        {p.name}
                      </p>
                      <p className="text-xs font-bold font-mono">{p.score}</p>
                    </div>
                  ))}
              </div>

              <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-500/20 rounded-lg">
                    <Trophy className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                      Score
                    </p>
                    <p className="text-xl font-bold font-mono">
                      {score.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {sessionTimeLeft !== null && (
                    <div className="flex flex-col items-center">
                      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                        Session End
                      </p>
                      <div className="flex items-center gap-2">
                        <Timer className="w-4 h-4 text-emerald-500" />
                        <span className="text-xl font-bold font-mono">
                          {Math.floor(sessionTimeLeft / 60)
                            .toString()
                            .padStart(2, "0")}
                          :{(sessionTimeLeft % 60).toString().padStart(2, "0")}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="relative w-12 h-12 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90">
                      <circle
                        cx="24"
                        cy="24"
                        r="20"
                        className="stroke-white/5"
                        strokeWidth="4"
                        fill="none"
                      />
                      <motion.circle
                        cx="24"
                        cy="24"
                        r="20"
                        className={
                          timeLeft > 10
                            ? "stroke-emerald-500"
                            : timeLeft > 5
                              ? "stroke-amber-500"
                              : "stroke-rose-500"
                        }
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray="125.6"
                        animate={{
                          strokeDashoffset:
                            125.6 *
                            (1 -
                              Math.max(0, timeLeft) /
                                (roomData?.timePerQuestion || timePerQuestion)),
                        }}
                      />
                    </svg>
                    <span
                      className={cn(
                        "absolute text-sm font-bold font-mono transition-colors",
                        timeLeft > 10
                          ? "text-white"
                          : timeLeft > 5
                            ? "text-amber-500"
                            : "text-rose-500 animate-pulse",
                      )}
                    >
                      {timeLeft}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                    Question
                  </p>
                  <p className="text-xl font-bold font-mono">
                    {currentQuestionIndex + 1}/{filteredQuestions.length}
                  </p>
                </div>

                <div className="flex items-center pl-4 border-l border-white/10">
                  {confirmExit ? (
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest hidden sm:block">
                        Leave game?
                      </p>
                      <button
                        onClick={handleExitGame}
                        className="px-3 py-2 bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-rose-500/30 transition-all"
                      >
                        Leave
                      </button>
                      <button
                        onClick={() => setConfirmExit(false)}
                        className="px-3 py-2 bg-white/5 text-slate-300 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
                      >
                        Stay
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmExit(true)}
                      title="Exit game"
                      aria-label="Exit game"
                      className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-all"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <motion.div
                  key={currentQuestion.id}
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  className="space-y-8"
                >
                  <div className="space-y-4 text-center max-w-2xl mx-auto">
                    <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-mono uppercase text-emerald-500">
                      SEC-LEVEL: {currentQuestion.difficulty}
                    </span>

                    {currentQuestion.imageUrl && (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-xl mx-auto mt-6 mb-4 bg-black/40">
                        <img
                          src={currentQuestion.imageUrl}
                          alt="Mission intel visual"
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}

                    <h2 className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white">
                      {currentQuestion.question}
                    </h2>
                  </div>

                  <div className="grid gap-4 max-w-xl mx-auto w-full">
                    {currentQuestion.type === "mcq" &&
                      currentQuestion.options?.map((option, idx) => (
                        <motion.button
                          key={idx}
                          disabled={showExplanation}
                          onClick={() => handleAnswerSubmit(option)}
                          whileHover={!showExplanation ? { scale: 1.02 } : {}}
                          whileTap={!showExplanation ? { scale: 0.98 } : {}}
                          animate={
                            showExplanation &&
                            option === currentQuestion.correctAnswer
                              ? {
                                  scale: [1, 1.05, 1],
                                  transition: { duration: 0.3 },
                                }
                              : showExplanation &&
                                  isCorrect === false &&
                                  userAnswer === option
                                ? {
                                    x: [-10, 10, -10, 10, 0],
                                    transition: { duration: 0.4 },
                                  }
                                : {}
                          }
                          className={cn(
                            "group relative p-5 bg-white/5 border border-white/10 text-left rounded-2xl transition-colors",
                            !showExplanation
                              ? "hover:border-emerald-500/50 hover:bg-emerald-500/5"
                              : option === currentQuestion.correctAnswer
                                ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] z-10"
                                : isCorrect === false && userAnswer === option
                                  ? "border-rose-500 bg-rose-500/10 text-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.2)] z-10"
                                  : "opacity-50",
                          )}
                        >
                          <span className="font-medium">{option}</span>
                        </motion.button>
                      ))}
                  </div>
                </motion.div>
              </div>

              <AnimatePresence>
                {showExplanation && (
                  <motion.div
                    initial={{ y: 20, opacity: 0, scale: 0.95 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    className={cn(
                      "p-6 border rounded-2xl space-y-4 shadow-xl backdrop-blur-md relative overflow-hidden",
                      isCorrect
                        ? "bg-emerald-950/40 border-emerald-500/30"
                        : "bg-rose-950/40 border-rose-500/30",
                    )}
                  >
                    <div className="flex gap-4 relative z-10">
                      {isCorrect ? (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1, rotate: [0, 15, -15, 0] }}
                          transition={{
                            type: "tween",
                            duration: 0.5,
                            delay: 0.1,
                          }}
                          className="p-3 bg-emerald-500/20 rounded-xl shrink-0 h-fit"
                        >
                          <ShieldCheck className="w-8 h-8 text-emerald-500" />
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1, x: [-5, 5, -5, 5, 0] }}
                          transition={{
                            type: "tween",
                            duration: 0.5,
                            delay: 0.1,
                          }}
                          className="p-3 bg-rose-500/20 rounded-xl shrink-0 h-fit"
                        >
                          <ShieldAlert className="w-8 h-8 text-rose-500" />
                        </motion.div>
                      )}
                      <div>
                        <motion.h3
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className={cn(
                            "font-bold text-lg mb-1",
                            isCorrect ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {isCorrect ? "ACCESS GRANTED" : "ACCESS DENIED"}
                        </motion.h3>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.3 }}
                          className="text-sm text-slate-300 leading-relaxed"
                        >
                          {currentQuestion.explanation}
                        </motion.p>
                      </div>
                    </div>
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      onClick={nextQuestion}
                      className={cn(
                        "w-full py-4 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-opacity-90 transition-all relative z-10",
                        isCorrect
                          ? "bg-emerald-500 text-black hover:bg-emerald-400"
                          : "bg-rose-500 text-white hover:bg-rose-400 hover:text-white",
                      )}
                    >
                      CONTINUE MISSION <ChevronRight className="w-5 h-5" />
                    </motion.button>
                    {/* Background glow decoration */}
                    <div
                      className={cn(
                        "absolute top-0 right-0 w-32 h-32 blur-3xl -z-0 rounded-full",
                        isCorrect ? "bg-emerald-500/20" : "bg-rose-500/20",
                      )}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {gameState === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col space-y-10 py-4"
            >
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold tracking-tight">
                  OPERATIONAL DEBRIEF
                </h2>
                <p className="text-slate-500 uppercase text-xs font-mono tracking-widest">
                  Real-time Session Leaderboard
                </p>
              </div>

              <div className="grid lg:grid-cols-2 gap-8">
                {/* Personal Stats Overview */}
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 flex flex-col gap-6">
                  <h3 className="text-xl font-bold text-slate-300">
                    Agent Performance Data
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-6 bg-black/40 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                      <p className="text-slate-500 uppercase text-[10px] font-mono tracking-widest mb-1">
                        Accuracy
                      </p>
                      <p className="text-3xl font-bold text-white">
                        {accuracy}%
                      </p>
                    </div>
                    <div className="p-6 bg-black/40 rounded-3xl border border-white/5 flex flex-col items-center justify-center text-center">
                      <p className="text-slate-500 uppercase text-[10px] font-mono tracking-widest mb-1">
                        Fastest Hack
                      </p>
                      <p className="text-3xl font-bold text-white">
                        {fastestTime}s
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 mt-4">
                    <p className="text-slate-500 uppercase text-[10px] font-mono tracking-widest mb-4">
                      Clearance Breakdown
                    </p>
                    <div className="space-y-3">
                      {["easy", "medium", "hard", "boss"].map((diff) => {
                        const items = gameHistory.filter(
                          (h) => h.question.difficulty === diff,
                        );
                        if (items.length === 0) return null;
                        const correctCount = items.filter(
                          (h) => h.correct,
                        ).length;
                        return (
                          <div
                            key={diff}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="font-mono uppercase text-slate-400 min-w-[60px]">
                              {diff}
                            </span>
                            <div className="flex items-center gap-3 w-2/3">
                              <div className="flex-1 bg-black/40 h-2 rounded-full overflow-hidden border border-white/5 relative">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{
                                    width: `${(correctCount / items.length) * 100}%`,
                                  }}
                                  transition={{ duration: 1, delay: 0.5 }}
                                  className="absolute top-0 left-0 bg-emerald-500 h-full"
                                />
                              </div>
                              <span className="font-mono text-emerald-500 font-bold min-w-[30px] text-right">
                                {correctCount}/{items.length}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col max-h-[60vh]">
                  <div className="p-6 border-b border-white/10 bg-white/5">
                    <div className="grid grid-cols-12 gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                      <div className="col-span-1">Pos</div>
                      <div className="col-span-7">Agent</div>
                      <div className="col-span-4 text-right">Combat Score</div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-3">
                    {(roomId
                      ? players
                      : [
                          {
                            uid: user?.uid || "solo",
                            name: user?.displayName || guestName || "Solo Agent",
                            score,
                          },
                        ]
                    )
                      .sort((a, b) => b.score - a.score)
                      .map((p, idx) => {
                        const badges = getPlayerBadges(p.history || (p.uid === user?.uid ? gameHistory : []));
                        return (
                        <motion.div
                          layout
                          key={p.uid}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                          className={cn(
                            "flex flex-col gap-2 p-4 rounded-2xl border transition-all",
                            p.uid === user?.uid
                              ? "bg-emerald-500/10 border-emerald-500/30 scale-[1.02] shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                              : "bg-white/5 border-white/5",
                          )}
                        >
                          <div className="grid grid-cols-12 gap-4 items-center">
                            <div className="col-span-1 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </div>
                            <div className="col-span-7 font-bold flex items-center gap-3">
                              <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-[10px]">
                                {p.name.charAt(0)}
                              </div>
                              <span className="truncate">
                                {p.name} {p.uid === user?.uid && "(YOU)"}
                              </span>
                            </div>
                            <div className="col-span-4 text-right font-mono font-bold text-emerald-500 flex items-center justify-end gap-2">
                              {p.score}
                            </div>
                          </div>
                          {badges.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-1 ml-10">
                              {badges.map((b, i) => {
                                const Icon = b.icon;
                                return (
                                  <div key={i} className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[9px] uppercase font-bold tracking-widest", b.color)}>
                                    <Icon className="w-3 h-3" />
                                    {b.name}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </motion.div>
                      )})}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setGameState(activeCampaignConcept ? "campaign" : "lobby")}
                  className="flex-1 py-5 bg-white text-black font-bold rounded-2xl hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  {activeCampaignConcept ? <MapIcon className="w-5 h-5" /> : <Users className="w-5 h-5" />} 
                  {activeCampaignConcept ? "RETURN TO CAMPAIGN" : "OPERATIONS CENTER"}
                </motion.button>
              </div>
            </motion.div>
          )}

          {gameState === "admin_dashboard" && (
            <motion.div
              key="admin_dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col w-full py-12 space-y-8 max-w-5xl mx-auto px-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">ADMIN DASHBOARD</h2>
                  <p className="text-slate-500 uppercase text-xs font-semibold tracking-widest mt-2">Manage Sessions and Question Bank</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                     <button 
                        onClick={() => setAdminTab("sessions")}
                        className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", adminTab === "sessions" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                     >
                       Sessions
                     </button>
                     <button 
                        onClick={() => setAdminTab("questions")}
                        className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", adminTab === "questions" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                     >
                       Question Bank
                     </button>
                     <button 
                        onClick={() => setAdminTab("metrics")}
                        className={cn("px-4 py-2 text-sm font-bold rounded-lg transition-all", adminTab === "metrics" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                     >
                       Metrics
                     </button>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setGameState("lobby")}
                    className="px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold transition-all shadow-sm hover:bg-slate-50 flex items-center gap-2"
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" /> Back to Lobby
                  </motion.button>
                </div>
              </div>

              {adminTab === "sessions" ? (
              <div className="flex flex-col gap-4">
                {allRooms.map(room => (
                  <div key={room.id} className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col md:flex-row gap-4 md:gap-0 items-start md:items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap md:flex-nowrap items-center gap-4 md:gap-6 w-full md:w-auto">
                      <div className="space-y-1 w-1/2 md:w-auto">
                        <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">Session ID</p>
                        <p className="text-2xl font-bold font-mono text-blue-600">{room.id}</p>
                      </div>
                      <div className="hidden md:block w-px h-10 bg-slate-200" />
                      <div className="space-y-1 w-1/2 md:w-auto">
                        <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">Host</p>
                        <p className="text-lg font-semibold text-slate-800 truncate max-w-[150px] md:max-w-none">{room.hostName || room.hostId}</p>
                      </div>
                      <div className="hidden md:block w-px h-10 bg-slate-200" />
                      <div className="space-y-1 w-1/2 md:w-auto">
                        <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">Difficulty</p>
                        <p className="text-base font-bold uppercase text-slate-700">{room.difficulty === 'all' ? 'Mixed' : room.difficulty}</p>
                      </div>
                      <div className="hidden md:block w-px h-10 bg-slate-200" />
                      <div className="space-y-1 w-1/2 md:w-auto">
                        <p className="text-[10px] uppercase font-semibold text-slate-500 tracking-widest">Created At</p>
                        <p className="text-sm text-slate-500 font-medium">
                          {room.createdAt?.toDate ? room.createdAt.toDate().toLocaleString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end w-full md:w-auto gap-4 mt-4 md:mt-0">
                      <div className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border",
                        room.status === 'started' ? "bg-amber-100 text-amber-700 border-amber-200" : 
                        room.status === 'finished' ? "bg-slate-100 text-slate-600 border-slate-200" :
                        "bg-emerald-100 text-emerald-700 border-emerald-200"
                      )}>
                        {room.status}
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleDeleteRoom(room.id)}
                        className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-xl transition-all"
                        title="Delete Session"
                      >
                        <Trash2 className="w-5 h-5" />
                      </motion.button>
                    </div>
                  </div>
                ))}

                {allRooms.length === 0 && (
                  <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 bg-slate-50/50 rounded-3xl mt-8">
                    <p className="text-lg font-medium">No sessions found in the database.</p>
                  </div>
                )}
              </div>
              ) : adminTab === "questions" ? (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between">
                     <p className="text-slate-600 font-medium">Total Questions: {bankQuestions.length}</p>
                     <div className="flex gap-2">
                       <button onClick={() => setEditingQuestion({ id: '', type: 'mcq', question: '', options: ['', '', '', ''], correctAnswer: '', explanation: '', difficulty: 'medium' })} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors text-sm">
                          New Question
                       </button>
                       <button onClick={handleSeedQuestions} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors text-sm">
                          Seed Defaults
                       </button>
                     </div>
                  </div>

                  {editingQuestion && (
                    <div className="p-6 bg-slate-50 border border-blue-200 rounded-3xl shadow-sm space-y-4 mb-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-bold text-slate-800">{editingQuestion.id ? 'Edit Question' : 'Create Question'}</h3>
                        <div className="flex bg-slate-200 p-1 rounded-xl">
                           <button 
                              onClick={() => setPreviewQuestion(false)}
                              className={cn("px-4 py-1 flex items-center gap-2 text-sm font-bold rounded-lg transition-all", !previewQuestion ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                           >
                              Edit
                           </button>
                           <button 
                              onClick={() => setPreviewQuestion(true)}
                              className={cn("px-4 py-1 flex items-center gap-2 text-sm font-bold rounded-lg transition-all", previewQuestion ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}
                           >
                              Preview
                           </button>
                        </div>
                      </div>
                      
                      {!previewQuestion ? (
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Question Text</label>
                            <textarea value={editingQuestion.question} onChange={e => setEditingQuestion({...editingQuestion, question: e.target.value})} className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 min-h-[80px]"></textarea>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Image URL (Optional)</label>
                            <input type="url" value={editingQuestion.imageUrl || ''} onChange={e => setEditingQuestion({...editingQuestion, imageUrl: e.target.value})} placeholder="https://example.com/image.png" className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">Difficulty</label>
                               <select value={editingQuestion.difficulty} onChange={e => setEditingQuestion({...editingQuestion, difficulty: e.target.value as any})} className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500">
                                 <option value="easy">Easy</option>
                                 <option value="medium">Medium</option>
                                 <option value="hard">Hard</option>
                               </select>
                            </div>
                            <div>
                               <label className="text-xs font-bold text-slate-500 uppercase">Correct Answer (Must match an option exactly)</label>
                               <input type="text" value={editingQuestion.correctAnswer} onChange={e => setEditingQuestion({...editingQuestion, correctAnswer: e.target.value})} className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Options (MCQ)</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                              {editingQuestion.options?.map((opt, i) => (
                                <input key={i} type="text" placeholder={`Option ${i+1}`} value={opt} onChange={e => {
                                  const newOpts = [...(editingQuestion.options || [])];
                                  newOpts[i] = e.target.value;
                                  setEditingQuestion({...editingQuestion, options: newOpts});
                                }} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500" />
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase">Explanation</label>
                            <textarea value={editingQuestion.explanation} onChange={e => setEditingQuestion({...editingQuestion, explanation: e.target.value})} className="w-full mt-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 min-h-[80px]"></textarea>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-[#050505] text-slate-100 p-8 rounded-2xl relative overflow-hidden font-sans">
                           <div className="absolute inset-0 z-0 pointer-events-none opacity-20 [mask-image:linear-gradient(to_bottom,white,transparent)]">
                             <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]"></div>
                           </div>
                           <div className="relative z-10 space-y-8">
                             <div className="space-y-4 text-center max-w-2xl mx-auto">
                                <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-mono uppercase text-emerald-500">
                                   SEC-LEVEL: {editingQuestion.difficulty}
                                </span>
                                
                                {editingQuestion.imageUrl && (
                                  <div className="relative w-full aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-xl mx-auto mt-6 mb-4 bg-black/40">
                                    <img
                                      src={editingQuestion.imageUrl}
                                      alt="Mission intel visual"
                                      className="w-full h-full object-contain"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}

                                <h2 className="text-2xl lg:text-3xl font-bold leading-tight tracking-tight text-white mt-4">
                                   {editingQuestion.question || "No question text provided..."}
                                </h2>
                             </div>
                             
                             <div className="grid gap-4 max-w-xl mx-auto w-full">
                                {editingQuestion.type === "mcq" && editingQuestion.options?.map((option, idx) => (
                                   <div
                                      key={idx}
                                      className={cn(
                                         "p-5 bg-white/5 border text-left rounded-2xl transition-colors",
                                         option === editingQuestion.correctAnswer
                                           ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                                           : "border-white/10 text-white"
                                      )}
                                   >
                                      <span className="font-medium">{option || `Option ${idx + 1}`}</span>
                                   </div>
                                ))}
                             </div>
                           </div>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 pt-2">
                        <button onClick={() => handleSaveQuestion(editingQuestion)} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Save</button>
                        <button onClick={() => { setEditingQuestion(null); setPreviewQuestion(false); }} className="px-4 py-2 bg-white text-slate-600 font-bold border border-slate-200 rounded-xl hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                     {bankQuestions.map((q, idx) => (
                        <div key={q.id} className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                           <div className="flex items-start justify-between">
                             <div className="space-y-1">
                                <span className="px-3 py-1 bg-blue-100 text-blue-700 font-bold text-[10px] uppercase rounded-full tracking-widest">{q.difficulty}</span>
                                <h4 className="text-xl font-bold text-slate-900 mt-2">{q.question}</h4>
                             </div>
                             <div className="flex gap-2">
                               <button onClick={() => setEditingQuestion(q)} className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                               </button>
                               <button onClick={() => handleDeleteQuestion(q.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                                  <Trash2 className="w-5 h-5" />
                               </button>
                             </div>
                           </div>
                           <div className="grid grid-cols-2 gap-2 mt-4">
                              {q.options?.map((opt, i) => (
                                <div key={i} className={cn("px-4 py-2 text-sm rounded-lg border", opt === q.correctAnswer ? "bg-green-50 border-green-200 text-green-700 font-bold" : "bg-slate-50 border-slate-200 text-slate-600")}>
                                   {opt}
                                </div>
                              ))}
                           </div>
                           <p className="text-sm text-slate-500"><span className="font-bold text-slate-700">Explanation:</span> {q.explanation}</p>
                        </div>
                     ))}
                     {bankQuestions.length === 0 && (
                       <div className="p-12 text-center text-slate-500 border border-dashed border-slate-300 bg-slate-50/50 rounded-3xl mt-8">
                         <p className="text-lg font-medium">No questions found in the database. Click "Seed Questions" to load defaults.</p>
                       </div>
                     )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {metricsLoading ? (
                    <div className="p-12 text-center text-slate-500">Loading metrics...</div>
                  ) : metricsData ? (
                    <div className="space-y-8">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                             <p className="text-xs font-bold text-slate-500 uppercase">Total Students</p>
                             <p className="text-3xl font-bold text-blue-600 mt-2">{metricsData.totalStudents}</p>
                          </div>
                          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                             <p className="text-xs font-bold text-slate-500 uppercase">Avg Score</p>
                             <p className="text-3xl font-bold text-emerald-600 mt-2">{metricsData.averageScore}</p>
                          </div>
                          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                             <p className="text-xs font-bold text-slate-500 uppercase">Total Attempts</p>
                             <p className="text-3xl font-bold text-indigo-600 mt-2">{metricsData.totalQuestionsAttempted}</p>
                          </div>
                          <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm">
                             <p className="text-xs font-bold text-slate-500 uppercase">Global Accuracy</p>
                             <p className="text-3xl font-bold text-amber-600 mt-2">{metricsData.accuracy}%</p>
                          </div>
                       </div>
                       
                       <div className="grid md:grid-cols-2 gap-6">
                         <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                           <h3 className="text-lg font-bold text-slate-800">Skill Breakdown</h3>
                           <div className="h-64 mt-4 w-full">
                             <ResponsiveContainer width="100%" height="100%">
                               <BarChart data={Object.entries(metricsData.skillBreakdown || {}).map(([name, stats]: any) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), Accuracy: Math.round((stats.correct/stats.attempted)*100) }))}>
                                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} dy={10} />
                                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748B', fontSize: 12}} dx={-10} domain={[0, 100]} />
                                 <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} cursor={{fill: '#F1F5F9'}} />
                                 <Bar dataKey="Accuracy" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={50} />
                               </BarChart>
                             </ResponsiveContainer>
                           </div>
                         </div>
                         <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                               AI Analyst Suggestions
                            </h3>
                            {aiSuggestions ? (
                              <div className="space-y-4">
                                 {aiSuggestions.map((s, i) => (
                                    <div key={i} className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                       <h4 className="font-bold text-blue-900 mb-1">{s.title}</h4>
                                       <p className="text-sm text-blue-800">{s.description}</p>
                                    </div>
                                 ))}
                              </div>
                            ) : (
                              <div className="text-slate-500 text-sm">Consulting AI Analyst...</div>
                            )}
                         </div>
                       </div>
                       
                       <div className="p-6 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4">
                          <h3 className="text-lg font-bold text-slate-800">Student Profiles & Assessment Logs</h3>
                          <div className="grid gap-4">
                            {metricsData.students?.map((s: any) => (
                              <div key={s.uid} className="p-4 bg-slate-50 rounded-2xl flex flex-col md:flex-row gap-6 border border-slate-200">
                                 <div className="w-full md:w-1/3 space-y-2">
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{s.name}</p>
                                    <div className="flex gap-4">
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Score</p>
                                        <p className="text-xl font-bold text-blue-600">{s.score}</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] text-slate-500 uppercase font-bold">Total Time</p>
                                        <p className="text-xl font-bold text-slate-700">{s.completionTime}s</p>
                                      </div>
                                    </div>
                                 </div>
                                 <div className="w-full md:w-2/3">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Needs Improvement ({s.wrongQuestions.length})</p>
                                    {s.wrongQuestions.length > 0 ? (
                                      <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                                        {s.wrongQuestions.map((wq: string, idx: number) => (
                                          <li key={idx} className="truncate">{wq}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                       <p className="text-sm text-emerald-600 font-bold">Perfect accuracy!</p>
                                    )}
                                 </div>
                              </div>
                            ))}
                            {(!metricsData.students || metricsData.students.length === 0) && (
                               <p className="text-slate-500 text-sm">No student data available yet.</p>
                            )}
                          </div>
                       </div>
                    </div>
                  ) : null}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="py-6 text-center text-slate-700 text-[10px] font-mono uppercase tracking-[0.2em] border-t border-white/5">
        SESSION ID: {roomId || "SECURE"} // ENCRYPTION: AES-256
      </footer>
    </div>
  );
}
