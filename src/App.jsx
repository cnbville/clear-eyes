import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Dumbbell,
  RotateCcw,
  Shield,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import AppShell from './components/layout/AppShell'
import Breadcrumb from './components/shared/Breadcrumb.jsx'
import FooterBar from './components/shared/FooterBar.jsx'
import Kbd from './components/shared/Kbd.jsx'
import { useToast } from './components/shared/ToastProvider.jsx'
import { useCommandRegistry } from './hooks/useCommandRegistry.js'
import {
  loadProgramStructure,
  useProgramRuntime,
  useProgramSummary,
} from './hooks/useProgram.js'
import { useProgress } from './hooks/useProgress.js'
import { useWorkoutSession } from './hooks/useWorkoutSession.js'
import { calculateRestDiscipline, calculateVolume } from './lib/calculations.js'
import { buildProgressionSuggestion } from './lib/adaptiveProgram.js'
import { getTargetReps, parseReps } from './lib/repParser.js'
import { recordRuntimeEvent } from './lib/runtimeDiagnostics.js'
import { matchesWorkoutRequest } from './lib/workoutRecovery.js'
import {
  clearActiveWorkoutPointer,
  clearWorkoutDraft,
  getRecoverableWorkouts,
  markWorkoutSessionAbandoned,
  persistActiveWorkoutPointer,
  prepareCustomSession,
} from './services/activeWorkoutService.js'
import {
  createSkippedProgramSession,
  getProgramAdaptiveContext,
  getRecentSlotExposureHistory,
  prepareProgramSession,
  saveProgramLoadGuidance,
  updateProgramSlotState,
} from './services/programSessionService.js'
// Page components are loaded on demand so the initial bundle stays lean.
// Each page becomes its own chunk and only downloads when the user navigates
// to it (or, for ActiveWorkoutPage, when they start a workout).
const ActiveWorkoutPage = lazy(() => import('./pages/ActiveWorkoutPage.jsx'))
const CustomWorkoutsPage = lazy(() => import('./pages/CustomWorkoutsPage.jsx'))
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'))
const DesktopSidebar = lazy(() => import('./components/layout/DesktopSidebar.jsx'))
const ExercisesPage = lazy(() => import('./pages/ExercisesPage.jsx'))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage.jsx'))
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx'))
const ModesPage = lazy(() => import('./pages/ModesPage.jsx'))
const BottomNav = lazy(() => import('./components/layout/BottomNav.jsx'))
const ProgramsPage = lazy(() => import('./pages/ProgramsPage.jsx'))
const ProgressPage = lazy(() => import('./pages/ProgressPage.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const TemplateDetailPage = lazy(() => import('./pages/TemplateDetailPage.jsx'))
const WorkoutBuilderPage = lazy(() => import('./pages/WorkoutBuilderPage.jsx'))

// One-shot components that only render in specific flows. Keeping them out of
// the initial bundle trims startup work significantly.
const SessionSummary = lazy(() => import('./components/workout/SessionSummary.jsx'))
const PhaseCompletionReport = lazy(() =>
  import('./components/workout/PhaseCompletionReport.jsx'),
)
const CommandBar = lazy(() => import('./components/shared/CommandBar.jsx'))

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-[11px] uppercase tracking-[0.28em] text-zinc-600">
        Loading…
      </div>
    </div>
  )
}

function getCurrentPhase(program, progress) {
  if (!program?.phases?.length) {
    return null
  }

  return (
    program.phases.find((phase) => phase.phase_number === (progress?.current_phase ?? 1)) ??
    program.phases[0]
  )
}

function getCurrentDay(program, progress) {
  const currentPhase = getCurrentPhase(program, progress)

  if (!currentPhase?.days?.length) {
    return null
  }

  return (
    currentPhase.days.find((day) => day.day_number === (progress?.current_day ?? 1)) ??
    currentPhase.days[0]
  )
}

function getExerciseKey(exercise, index = 0) {
  return (
    exercise?.exercise_slot_key ??
    exercise?.id ??
    exercise?.exercise_id ??
    `${exercise?.name ?? 'exercise'}-${exercise?.display_order ?? index + 1}`
  )
}

function getWorkingSetsForExercise(loggedSets = [], exercise, index = 0) {
  const exerciseKey = getExerciseKey(exercise, index)

  return loggedSets.filter(
    (set) =>
      set?.exercise_key === exerciseKey &&
      (set?.set_type ?? 'working') === 'working',
  )
}

function getRepThresholds(repNotation, setCount) {
  const parsed = parseReps(repNotation)

  return Array.from({ length: setCount }, (_, index) => {
    if (!parsed) {
      return { floor: null }
    }

    if (parsed.type === 'range') {
      return {
        floor: parsed.min,
      }
    }

    return {
      floor: getTargetReps(parsed, index + 1),
    }
  })
}

function countPreviousUnderperformances(exercise, exposures = []) {
  return (exposures ?? []).reduce((count, exposure) => {
    const workingSets = (exposure?.logged_sets ?? []).filter(
      (set) => (set?.set_type ?? 'working') === 'working',
    )

    if (!workingSets.length) {
      return count
    }

    const thresholds = getRepThresholds(exercise?.rep_notation, workingSets.length)
    const underperformed = workingSets.some((set, index) => {
      const floor = thresholds[index]?.floor
      return floor !== null && floor !== undefined && (Number(set?.reps) || 0) < floor
    })

    return underperformed ? count + 1 : count
  }, 0)
}

function getContextId({ activeWorkout, page, phaseCompletionReport, program, programLoading, sessionSummary }) {
  if (activeWorkout) {
    return 'active-workout'
  }

  if (sessionSummary) {
    return 'session-summary'
  }

  if (phaseCompletionReport) {
    return 'phase-report'
  }

  if (programLoading && !program) {
    return 'loading'
  }

  if (!program && page === 'home') {
    return 'home'
  }

  if (!program) {
    return 'empty'
  }

  return page
}

function getFallbackBreadcrumbSegments(contextId, page) {
  switch (contextId) {
    case 'empty':
      return ['IRON', 'Onboarding']
    case 'loading':
      return ['IRON', 'Initializing Deck']
    case 'history':
      return ['IRON', 'Archive']
    case 'library':
      return ['IRON', 'Library']
    case 'program':
      return ['IRON', 'Program Mode']
    case 'glossary':
      return ['IRON', 'Glossary']
    case 'settings':
      return ['IRON', 'Settings']
    case 'custom':
      return ['IRON', 'My Workouts']
    case 'custom-builder':
      return ['IRON', 'My Workouts', 'Builder']
    case 'custom-detail':
      return ['IRON', 'My Workouts', 'Detail']
    case 'phase-report':
      return ['IRON', 'Phase Completion']
    case 'session-summary':
      return ['IRON', 'Session Summary']
    default:
      return ['IRON', page === 'home' ? 'Training Modes' : page]
  }
}

function getNavigationPage(page) {
  if (page === 'custom-builder' || page === 'custom-detail') {
    return 'custom'
  }

  return page
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName?.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function getInitialLargeViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia('(min-width: 1024px)').matches
}

function useIsLargeViewport() {
  const [isLargeViewport, setIsLargeViewport] = useState(getInitialLargeViewport)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = () => {
      setIsLargeViewport(mediaQuery.matches)
    }

    handleChange()
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return isLargeViewport
}

function LoadingState() {
  return (
    <section className="flex min-h-[72vh] items-center justify-center py-10">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(20,20,22,0.95),rgba(10,10,11,0.92))] p-10 text-center shadow-[0_30px_80px_rgba(0,0,0,0.38)]">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-gold/20 border-t-gold" />
        <p className="mt-6 text-[12px] font-semibold uppercase tracking-[0.28em] text-zinc-500">
          Initializing Deck
        </p>
        <p className="mt-3 text-[15px] font-medium text-zinc-300">
          Loading your training cockpit...
        </p>
      </div>
    </section>
  )
}

function EmptyState({ page, onUploadClick, errorMessage }) {
  return (
    <section className="grid min-h-[72vh] gap-5 py-6 xl:grid-cols-[1.3fr_0.8fr]">
      <div className="relative overflow-hidden rounded-[30px] border border-white/[0.06] bg-[linear-gradient(145deg,rgba(20,20,22,0.96),rgba(10,10,11,0.92))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.42)] sm:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,162,39,0.16),transparent_42%)]" />
        <p className="relative text-[11px] font-semibold uppercase tracking-[0.36em] text-gold">
          IRON
        </p>
        <h1 className="relative mt-5 max-w-[14ch] text-[34px] font-black leading-[0.95] tracking-[-0.06em] text-zinc-50 sm:text-[48px]">
          Build your own workout wallhalla.
        </h1>
        <p className="relative mt-5 max-w-2xl text-[14px] leading-7 text-zinc-400">
          The shell is live. What is missing is an active program in the engine. Import a plan and
          the command deck wakes up with dashboards, demos, progress, and workout flow.
        </p>

        <div className="relative mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-gold px-6 py-3.5 text-[13px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light"
            onClick={onUploadClick}
          >
            <span>Load Program</span>
            <Kbd className="hidden border-black/10 bg-black/10 text-iron-900 lg:inline-flex">↵</Kbd>
          </button>
          <div className="rounded-2xl border border-white/[0.08] bg-iron-900/70 px-4 py-3 text-[12px] text-zinc-500">
            Current page: {page}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="rounded-[28px] border border-white/[0.06] bg-iron-900/70 p-6">
          <Dumbbell size={44} className="text-zinc-600" />
          <p className="mt-5 text-[18px] font-bold text-zinc-200">No program loaded</p>
          <p className="mt-3 text-[13px] leading-6 text-zinc-500">
            The {page} space will populate automatically once an active program has been imported.
          </p>
        </div>

        <div className="rounded-[28px] border border-white/[0.06] bg-iron-900/70 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
            System Status
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.05] bg-iron-950/70 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Program</p>
              <p className="mt-2 text-[18px] font-bold text-zinc-50">0</p>
            </div>
            <div className="rounded-2xl border border-white/[0.05] bg-iron-950/70 px-4 py-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">State</p>
              <p className="mt-2 text-[18px] font-bold text-zinc-50">Idle</p>
            </div>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-[28px] border border-accent-red/20 bg-accent-red/[0.08] p-6 text-[13px] leading-6 text-zinc-300">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ProgressView({ progress }) {
  const items = [
    {
      label: 'Session Streak',
      value: progress?.session_streak ?? 0,
      icon: Target,
    },
    {
      label: 'Longest Streak',
      value: progress?.longest_streak ?? 0,
      icon: Shield,
    },
    {
      label: 'Total Sessions',
      value: progress?.total_sessions ?? 0,
      icon: CalendarDays,
    },
    {
      label: 'Lifetime Volume',
      value: progress?.total_volume_lifetime ?? 0,
      icon: Dumbbell,
    },
  ]

  return (
    <section className="space-y-4 py-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.36em] text-zinc-500">Progress</p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-zinc-50">
          Your numbers
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-iron-600/60 bg-iron-800 p-4"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">{item.label}</p>
              <item.icon className="h-4 w-4 text-zinc-700" />
            </div>
            <p className="mt-4 text-2xl font-bold text-zinc-100">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-iron-600/60 bg-iron-800 p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Weekly rhythm</p>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-iron-700">
          <div
            className="h-full rounded-full bg-gold transition-[width]"
            style={{
              width: `${
                Math.min(
                  100,
                  ((progress?.weekly_completed ?? 0) /
                    Math.max(progress?.weekly_target ?? 1, 1)) *
                    100,
                ) || 0
              }%`,
            }}
          />
        </div>
        <p className="mt-3 text-sm text-zinc-500">
          {progress?.weekly_completed ?? 0} of {progress?.weekly_target ?? 0} sessions completed
          this week.
        </p>
      </div>
    </section>
  )
}

function HistoryView({ progress }) {
  return (
    <section className="space-y-4 py-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.36em] text-zinc-500">History</p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-zinc-50">
          Training log
        </h1>
      </header>

      <div className="rounded-2xl border border-iron-600/60 bg-iron-800 p-5">
        <p className="text-sm font-semibold text-zinc-200">Most recent milestone</p>
        <p className="mt-3 text-sm leading-6 text-zinc-500">
          {progress?.last_workout_date
            ? `Last recorded workout on ${progress.last_workout_date}. Full session history can now be layered on top of the saved schema.`
            : 'No completed sessions have been logged yet. Once workouts are recorded, this page can surface session history, notes, and trends.'}
        </p>
      </div>

      <div className="rounded-2xl border border-iron-600/60 bg-iron-800 p-5">
        <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Archive status</p>
        <div className="mt-4 space-y-3 text-sm text-zinc-400">
          <div className="rounded-xl border border-white/[0.04] bg-iron-900 px-4 py-3">
            Completed sessions: {progress?.total_sessions ?? 0}
          </div>
          <div className="rounded-xl border border-white/[0.04] bg-iron-900 px-4 py-3">
            PRs logged: {progress?.total_prs ?? 0}
          </div>
        </div>
      </div>
    </section>
  )
}

function SettingsView({ program }) {
  return (
    <section className="space-y-4 py-6">
      <header>
        <p className="font-mono text-xs uppercase tracking-[0.36em] text-zinc-500">Settings</p>
        <h1 className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-zinc-50">
          System panel
        </h1>
      </header>

      <div className="rounded-2xl border border-iron-600/60 bg-iron-800 p-5">
        <p className="text-sm font-semibold text-zinc-200">Active program</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          {program
            ? `${program.name}${program.author ? ` by ${program.author}` : ''}`
            : 'No active program loaded.'}
        </p>
      </div>

      <div className="rounded-2xl border border-iron-600/60 bg-iron-800 p-5">
        <p className="text-sm font-semibold text-zinc-200">Next controls</p>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          This space is ready for account settings, import preferences, and device options.
        </p>
      </div>
    </section>
  )
}

function formatRecoveryTimestamp(value) {
  if (!value) {
    return 'recently'
  }

  return new Date(value).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SessionRecoveryOverlay({
  sessions = [],
  pendingLaunchLabel = null,
  onResume,
  onDiscard,
  onClose,
}) {
  if (!sessions.length) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 px-4 pb-4 pt-16 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="w-full max-w-2xl rounded-[28px] border border-white/[0.06] bg-[linear-gradient(180deg,rgba(18,18,20,0.98),rgba(10,10,11,0.98))] p-5 shadow-[0_40px_100px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold">
              Active Session
            </p>
            <h2 className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-zinc-50">
              Resume the current workout or discard it before starting another one.
            </h2>
            <p className="mt-3 text-[13px] leading-7 text-zinc-400">
              {pendingLaunchLabel
                ? `${pendingLaunchLabel} is waiting. Choose which in-progress session we should keep.`
                : 'We found more than one in-progress session. Pick the one to keep moving with.'}
            </p>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.06] bg-iron-900 text-zinc-500 transition hover:border-white/[0.14] hover:text-zinc-100"
            onClick={onClose}
            aria-label="Close active session chooser"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-6 space-y-3">
          {sessions.map((session) => (
            <article
              key={session.sessionId}
              className="rounded-[24px] border border-white/[0.05] bg-iron-950/70 px-4 py-4"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                    {(session.source ?? 'program') === 'program' ? 'Program workout' : 'Custom workout'}
                  </p>
                  <p className="mt-2 text-[16px] font-semibold text-zinc-100">
                    {session.templateName ?? session.day?.name ?? 'Workout'}
                  </p>
                  <p className="mt-2 text-[12px] text-zinc-500">
                    Updated {formatRecoveryTimestamp(session.draftUpdatedAt ?? session.updatedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-white/[0.06] bg-iron-900 px-4 py-3 text-[12px] font-semibold text-zinc-200 transition hover:border-gold/30 hover:text-zinc-50"
                    onClick={() => onResume?.(session)}
                  >
                    <RotateCcw className="h-4 w-4" strokeWidth={1.8} />
                    Resume
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-[12px] font-semibold text-coral transition hover:border-coral/40"
                    onClick={() => onDiscard?.(session)}
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                    Discard
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}

function App() {
  const [page, setPage] = useState('home')
  const [customDetailTemplateId, setCustomDetailTemplateId] = useState(null)
  const [customBuilderTemplateId, setCustomBuilderTemplateId] = useState(null)
  const [activeWorkout, setActiveWorkout] = useState(null)
  const [sessionRecoveryPrompt, setSessionRecoveryPrompt] = useState(null)
  const [sessionSummary, setSessionSummary] = useState(null)
  const [phaseCompletionReport, setPhaseCompletionReport] = useState(null)
  const [isPersistingSession, setIsPersistingSession] = useState(false)
  const { showToast } = useToast()
  const {
    openCommandBar,
    registerFooterActions,
    registerItems,
    setBreadcrumbSegments,
    setCurrentContext,
    isCommandBarOpen,
  } = useCommandRegistry()
  const isLargeViewport = useIsLargeViewport()
  const {
    program: summaryProgram,
    loading: summaryProgramLoading,
    error: summaryProgramError,
    refetch: refetchProgramSummary,
  } = useProgramSummary()
  const shouldLoadProgramRuntime = Boolean(
    sessionSummary?.source === 'program' ||
      phaseCompletionReport ||
      ['home', 'program', 'progress', 'programs'].includes(page),
  )
  const {
    program: runtimeProgram,
    loading: runtimeProgramLoading,
    error: runtimeProgramError,
    refetch: refetchProgramRuntime,
    currentSlot,
    activeSession,
    overdueSlots,
    recoveryRecommendation,
    weeklyQuota,
    slotStates,
  } = useProgramRuntime(summaryProgram?.id ?? null, {
    enabled: shouldLoadProgramRuntime,
  })
  const program = runtimeProgram ?? summaryProgram
  const programLoading =
    summaryProgramLoading ||
    (shouldLoadProgramRuntime && Boolean(summaryProgram?.id) && runtimeProgramLoading)
  const programError = runtimeProgramError ?? summaryProgramError
  const refetch = useCallback(() => {
    refetchProgramSummary()
    refetchProgramRuntime()
  }, [refetchProgramRuntime, refetchProgramSummary])
  const {
    progress,
    updateProgress,
    refetch: refetchProgress,
  } = useProgress(program)
  const {
    startSession,
    logSet,
    completeSession,
    advanceProgress,
    createPhaseSnapshot,
  } = useWorkoutSession({
    program,
    progress,
    updateProgress,
  })
  const showAppChrome = !activeWorkout && !sessionSummary && !phaseCompletionReport
  const currentPhase = useMemo(() => getCurrentPhase(program, progress), [program, progress])
  const currentDay = useMemo(
    () => currentSlot?.day ?? getCurrentDay(program, progress),
    [currentSlot, program, progress],
  )
  const currentContextId = getContextId({
    activeWorkout,
    page,
    phaseCompletionReport,
    program,
    programLoading,
    sessionSummary,
  })
  const previousProgramIdRef = useRef(null)
  const previousPhaseRef = useRef(null)
  const previousStreakRef = useRef(null)
  const lastPrToastSessionRef = useRef(null)
  const hasRestoredSessionRef = useRef(false)

  const navigateToPage = useCallback((nextPage) => {
    setPage(nextPage)

    if (nextPage !== 'custom-detail') {
      setCustomDetailTemplateId(null)
    }

    if (nextPage !== 'custom-builder') {
      setCustomBuilderTemplateId(null)
    }
  }, [])

  const openCustomTemplate = useCallback((templateId) => {
    setCustomDetailTemplateId(templateId)
    setPage('custom-detail')
  }, [])

  const openWorkoutBuilder = useCallback((templateId = null) => {
    setCustomBuilderTemplateId(templateId)
    setPage('custom-builder')
  }, [])

  const applyActiveWorkout = useCallback((nextWorkout) => {
    setActiveWorkout(nextWorkout)

    if (nextWorkout) {
      persistActiveWorkoutPointer(nextWorkout)
    } else {
      clearActiveWorkoutPointer()
    }
  }, [])

  const resolveRecoveryPrompt = useCallback(() => {
    setSessionRecoveryPrompt(null)
  }, [])

  const handleStartWorkout = useCallback(async (day, phaseInfo, options = {}) => {
    if (!day) {
      return
    }

    const source = options.source ?? 'program'
    const resolvedSlot =
      source === 'program'
        ? options.slot ??
          slotStates.find(
            (slot) =>
              slot.program_day_id === day.id &&
              slot.phase_number === (phaseInfo?.phase_number ?? currentSlot?.phase_number) &&
              slot.week_number === (phaseInfo?.week ?? currentSlot?.week_number),
          ) ??
          currentSlot
        : null

    if (source === 'program' && !resolvedSlot?.program_day_id) {
      showToast('Unable to resolve the active program slot.', 'error')
      return
    }

    const requestedWorkout = {
      source,
      day: resolvedSlot?.day ?? day,
      phaseInfo:
        source === 'program'
          ? {
              phase_number: resolvedSlot?.phase_number ?? phaseInfo?.phase_number ?? 1,
              week: resolvedSlot?.week_number ?? phaseInfo?.week ?? 1,
              name: resolvedSlot?.phase_name ?? phaseInfo?.name ?? 'Current Phase',
              phaseColor: phaseInfo?.phaseColor ?? '#c9a227',
            }
          : null,
      slot: resolvedSlot,
      templateId: options.templateId ?? null,
      templateName:
        options.templateName ??
        resolvedSlot?.day?.name ??
        day?.name ??
        'Workout',
    }

    const recovery = await getRecoverableWorkouts()

    if (recovery.kind === 'multiple') {
      setSessionRecoveryPrompt({
        sessions: recovery.candidates,
        pendingLaunch: requestedWorkout,
      })
      return
    }

    if (recovery.kind === 'single') {
      if (matchesWorkoutRequest(recovery.workout, requestedWorkout)) {
        applyActiveWorkout(recovery.workout)
        return
      }

      setSessionRecoveryPrompt({
        sessions: recovery.candidates,
        pendingLaunch: requestedWorkout,
      })
      return
    }

    if (source === 'custom') {
      const preparation = await prepareCustomSession({
        templateId: options.templateId ?? null,
        templateName: requestedWorkout.templateName,
        day,
      })

      if (!preparation.success) {
        showToast(preparation.error ?? 'Unable to open the custom session.', 'error')
        return
      }

      applyActiveWorkout({
        day,
        phaseInfo: null,
        source: 'custom',
        programId: null,
        templateId: options.templateId ?? null,
        templateName: requestedWorkout.templateName,
        sessionId: preparation.sessionId,
        sessionStartedAt:
          preparation.session?.started_at
            ? new Date(preparation.session.started_at).getTime()
            : Date.now(),
        initialDraft: preparation.draft ?? null,
        initialReadiness: null,
        remoteDraftDetected: preparation.remoteDraftDetected,
        slotStateId: null,
        slotStatus: 'pending',
        slotDayNumber: day?.day_number ?? null,
      })
      return
    }

    const preparation = await prepareProgramSession({
      program,
      slot: resolvedSlot,
    })

    if (!preparation.success) {
      showToast(preparation.error ?? 'Unable to open the program session.', 'error')
      return
    }

    applyActiveWorkout({
      day: resolvedSlot.day ?? day,
      phaseInfo: requestedWorkout.phaseInfo,
      source,
      programId: program?.id ?? null,
      templateId: null,
      templateName: requestedWorkout.templateName,
      sessionId: preparation.sessionId,
      sessionStartedAt:
        preparation.session?.started_at
          ? new Date(preparation.session.started_at).getTime()
          : Date.now(),
      initialDraft: preparation.draft ?? null,
      initialReadiness: preparation.readiness ?? null,
      remoteDraftDetected: preparation.remoteDraftDetected,
      slotStateId: resolvedSlot.id ?? null,
      slotStatus: resolvedSlot.status ?? 'pending',
      slotDayNumber: resolvedSlot.day_number ?? day?.day_number ?? null,
    })
  }, [applyActiveWorkout, currentSlot, program, showToast, slotStates])

  const handleSkipOverdueSlot = useCallback(async () => {
    if (!program?.id) {
      return
    }

    const targetSlot = overdueSlots[0] ?? currentSlot

    if (!targetSlot?.id) {
      showToast('No carried-forward slot is ready to skip.', 'error')
      return
    }

    const skippedSessionResult = await createSkippedProgramSession({
      slot: targetSlot,
    })

    if (!skippedSessionResult.success) {
      showToast(skippedSessionResult.error ?? 'Unable to skip this slot.', 'error')
      return
    }

    const slotStateResult = await updateProgramSlotState({
      slotStateId: targetSlot.id,
      status: 'skipped',
      sessionId: skippedSessionResult.data?.id ?? null,
    })

    if (!slotStateResult.success) {
      showToast(slotStateResult.error ?? 'Skipped session was created, but slot state did not update.', 'error')
      return
    }

    const adaptiveContext = await getProgramAdaptiveContext(program, progress)
    const progressResult = await advanceProgress({
      slotStates: adaptiveContext.slotStates ?? [],
      phaseNumber: targetSlot.phase_number,
      wasSkipped: true,
    })

    if (!progressResult.success) {
      showToast(progressResult.error ?? 'Slot was skipped, but progress did not refresh cleanly.', 'error')
    } else {
      showToast('Carried-forward slot skipped. Program queue updated.', 'default')
    }

    refetch()
    refetchProgress()
  }, [advanceProgress, currentSlot, overdueSlots, program, progress, refetch, refetchProgress, showToast])

  const resumeRecoverableWorkout = useCallback((workout) => {
    applyActiveWorkout(workout)
    setSessionRecoveryPrompt(null)
  }, [applyActiveWorkout])

  const discardRecoverableWorkout = useCallback(async (workout) => {
    if (!workout?.sessionId) {
      return
    }

    const discardResult = await markWorkoutSessionAbandoned(workout.sessionId)

    if (!discardResult.success) {
      showToast(discardResult.error ?? 'Unable to discard the in-progress workout.', 'error')
      return
    }

    const nextRecovery = await getRecoverableWorkouts()

    if (nextRecovery.kind === 'single' && !sessionRecoveryPrompt?.pendingLaunch) {
      applyActiveWorkout(nextRecovery.workout)
      setSessionRecoveryPrompt(null)
      return
    }

    if (nextRecovery.kind === 'none' && sessionRecoveryPrompt?.pendingLaunch) {
      const pendingLaunch = sessionRecoveryPrompt.pendingLaunch
      setSessionRecoveryPrompt(null)
      await handleStartWorkout(
        pendingLaunch.day,
        pendingLaunch.phaseInfo,
        {
          source: pendingLaunch.source,
          slot: pendingLaunch.slot ?? null,
          templateId: pendingLaunch.templateId ?? null,
          templateName: pendingLaunch.templateName ?? null,
        },
      )
      return
    }

    setSessionRecoveryPrompt((currentPrompt) =>
      currentPrompt
        ? {
            ...currentPrompt,
            sessions: nextRecovery.candidates ?? [],
          }
        : null,
    )
  }, [applyActiveWorkout, handleStartWorkout, sessionRecoveryPrompt, showToast])

  const footerBottomOffsetClassName = activeWorkout
    ? 'bottom-[4.75rem] xl:bottom-0'
    : 'bottom-[5.75rem] lg:bottom-0'

  useEffect(() => {
    setCurrentContext(currentContextId)
  }, [currentContextId, setCurrentContext])

  useEffect(() => {
    function handleGlobalCommandShortcut(event) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return
      }

      if (isTypingTarget(event.target)) {
        event.preventDefault()
        openCommandBar()
        return
      }

      event.preventDefault()
      openCommandBar()
    }

    window.addEventListener('keydown', handleGlobalCommandShortcut)

    return () => {
      window.removeEventListener('keydown', handleGlobalCommandShortcut)
    }
  }, [openCommandBar])

  useEffect(() => {
    recordRuntimeEvent('route-state', {
      context: currentContextId,
      hasActiveWorkout: Boolean(activeWorkout),
      hasPhaseReport: Boolean(phaseCompletionReport),
      hasSessionSummary: Boolean(sessionSummary),
      page,
    })
  }, [activeWorkout, currentContextId, page, phaseCompletionReport, sessionSummary])

  useEffect(() => {
    if (activeWorkout) {
      persistActiveWorkoutPointer(activeWorkout)
      return
    }

    clearActiveWorkoutPointer()
  }, [activeWorkout])

  useEffect(() => {
    if (hasRestoredSessionRef.current) {
      return
    }

    hasRestoredSessionRef.current = true

    void (async () => {
      const recovery = await getRecoverableWorkouts()

      if (recovery.kind === 'single') {
        applyActiveWorkout(recovery.workout)
        return
      }

      if (recovery.kind === 'multiple') {
        setSessionRecoveryPrompt({
          sessions: recovery.candidates,
          pendingLaunch: null,
        })
      }
    })()
  }, [applyActiveWorkout])

  useEffect(() => {
    if (
      [
        'home',
        'progress',
        'programs',
        'custom',
        'custom-builder',
        'custom-detail',
        'active-workout',
      ].includes(currentContextId)
    ) {
      return
    }

    setBreadcrumbSegments(getFallbackBreadcrumbSegments(currentContextId, page))
  }, [currentContextId, page, setBreadcrumbSegments])

  useEffect(() => {
    const cleanup = registerFooterActions('empty', [
      {
        action: () => setPage('programs'),
        displayShortcut: '↵',
        id: 'empty-load-program',
        label: 'Load Program',
        shortcut: 'Enter',
      },
      {
        action: openCommandBar,
        displayShortcut: '⌘K',
        id: 'empty-search',
        label: 'Search',
        shortcut: 'Mod+K',
      },
    ])

    return cleanup
  }, [openCommandBar, registerFooterActions])

  useEffect(() => {
    const cleanups = [
      registerFooterActions('history', [
        {
          action: openCommandBar,
          displayShortcut: '⌘K',
          id: 'history-search',
          label: 'Search',
          shortcut: 'Mod+K',
        },
        {
          action: () => setPage('home'),
          displayShortcut: '←',
          id: 'history-dashboard',
          label: 'Dashboard',
          shortcut: 'ArrowLeft',
        },
      ]),
      registerFooterActions('library', [
        {
          action: openCommandBar,
          displayShortcut: '⌘K',
          id: 'library-search',
          label: 'Search',
          shortcut: 'Mod+K',
        },
        {
          action: () => setPage('home'),
          displayShortcut: '←',
          id: 'library-dashboard',
          label: 'Dashboard',
          shortcut: 'ArrowLeft',
        },
      ]),
      registerFooterActions('glossary', [
        {
          action: openCommandBar,
          displayShortcut: '⌘K',
          id: 'glossary-search',
          label: 'Search',
          shortcut: 'Mod+K',
        },
        {
          action: () => setPage('home'),
          displayShortcut: '←',
          id: 'glossary-dashboard',
          label: 'Dashboard',
          shortcut: 'ArrowLeft',
        },
      ]),
      registerFooterActions('settings', [
        {
          action: openCommandBar,
          displayShortcut: '⌘K',
          id: 'settings-search',
          label: 'Search',
          shortcut: 'Mod+K',
        },
        {
          action: () => setPage('home'),
          displayShortcut: '←',
          id: 'settings-dashboard',
          label: 'Dashboard',
          shortcut: 'ArrowLeft',
        },
      ]),
      registerFooterActions('phase-report', [
        {
          action: () => setPhaseCompletionReport(null),
          displayShortcut: '↵',
          id: 'phase-report-continue',
          label: 'Continue',
          shortcut: 'Enter',
        },
      ]),
      registerFooterActions('session-summary', [
        {
          action: () => setSessionSummary(null),
          displayShortcut: 'Esc',
          id: 'session-summary-close',
          label: 'Close',
          shortcut: 'Escape',
        },
      ]),
    ]

    return () => {
      cleanups.forEach((cleanup) => cleanup?.())
    }
  }, [openCommandBar, registerFooterActions])

  useEffect(() => {
    const currentProgramId = program?.id ?? null

    if (previousProgramIdRef.current && currentProgramId && currentProgramId !== previousProgramIdRef.current) {
      showToast(`Program state changed to ${program?.name}.`, 'default')
    }

    if (!previousProgramIdRef.current && currentProgramId) {
      showToast(`Program ready: ${program?.name}.`, 'default')
    }

    previousProgramIdRef.current = currentProgramId
  }, [program?.id, program?.name, showToast])

  useEffect(() => {
    const currentPhaseNumber = progress?.current_phase ?? null

    if (
      previousPhaseRef.current !== null &&
      currentPhaseNumber !== null &&
      currentPhaseNumber !== previousPhaseRef.current
    ) {
      showToast(`Phase advanced to Phase ${currentPhaseNumber}.`, 'default')
    }

    previousPhaseRef.current = currentPhaseNumber
  }, [progress?.current_phase, showToast])

  useEffect(() => {
    const currentStreak = progress?.session_streak ?? null

    if (
      previousStreakRef.current !== null &&
      currentStreak !== null &&
      currentStreak !== previousStreakRef.current &&
      currentStreak > 0 &&
      currentStreak % 5 === 0
    ) {
      showToast(`Streak milestone hit: ${currentStreak} sessions in a row.`, 'gold')
    }

    previousStreakRef.current = currentStreak
  }, [progress?.session_streak, showToast])

  useEffect(() => {
    if (!sessionSummary?.sessionId || lastPrToastSessionRef.current === sessionSummary.sessionId) {
      return
    }

    if (sessionSummary?.prs?.length) {
      showToast(
        `${sessionSummary.prs.length} new PR${sessionSummary.prs.length > 1 ? 's' : ''} detected.`,
        'green',
      )
    }

    lastPrToastSessionRef.current = sessionSummary.sessionId
  }, [sessionSummary, showToast])

  // Stable list of "view" navigation commands — no volatile deps so this
  // allocates exactly once for the lifetime of the component.
  const viewItems = useMemo(
    () => [
      {
        action: () => navigateToPage('home'),
        category: 'Views',
        id: 'view-home',
        label: 'Training Modes',
        shortcut: 'H',
        subtitle: 'Program mode and custom mode hub',
      },
      {
        action: () => navigateToPage('program'),
        category: 'Views',
        id: 'view-program',
        label: 'Program Mode',
        shortcut: 'G',
        subtitle: 'Structured phased training',
      },
      {
        action: () => navigateToPage('progress'),
        category: 'Views',
        id: 'view-progress',
        label: 'Progress Report',
        shortcut: 'P',
        subtitle: 'Projection grid and trends',
      },
      {
        action: () => navigateToPage('custom'),
        category: 'Views',
        id: 'view-custom',
        label: 'My Workouts',
        shortcut: 'W',
        subtitle: 'Custom templates and builder',
      },
      {
        action: () => navigateToPage('history'),
        category: 'Views',
        id: 'view-history',
        label: 'Archive',
        shortcut: 'A',
        subtitle: 'Session history and notes',
      },
      {
        action: () => navigateToPage('programs'),
        category: 'Views',
        id: 'view-programs',
        label: 'Program Vault',
        shortcut: 'V',
        subtitle: 'Program state and roadmap',
      },
      {
        action: () => navigateToPage('library'),
        category: 'Views',
        id: 'view-library',
        label: 'Library',
        shortcut: 'L',
        subtitle: 'Exercise index',
      },
      {
        action: () => navigateToPage('settings'),
        category: 'Views',
        id: 'view-settings',
        label: 'Settings',
        shortcut: 'S',
        subtitle: 'System panel',
      },
      {
        action: openCommandBar,
        category: 'Actions',
        id: 'action-search',
        label: 'Open Command Bar',
        shortcut: '⌘K',
        subtitle: 'Search views and actions',
      },
      {
        action: () => openWorkoutBuilder(),
        category: 'Actions',
        id: 'action-create-custom-workout',
        label: 'Create Custom Workout',
        shortcut: '⌘E',
        subtitle: 'Open the workout builder',
      },
    ],
    [navigateToPage, openCommandBar, openWorkoutBuilder],
  )

  useEffect(() => {
    const globalItems = [...viewItems]

    const launchableDay = activeSession?.day ?? currentDay
    const launchableSlot = activeSession?.slot ?? currentSlot

    if (launchableDay && !activeWorkout) {
      globalItems.push({
        action: () =>
          handleStartWorkout(
            launchableDay,
            {
              phase_number:
                launchableSlot?.phase_number ??
                currentPhase?.phase_number ??
                progress?.current_phase ??
                1,
              name: launchableSlot?.phase_name ?? currentPhase?.name ?? 'Current Phase',
              phaseColor: '#c9a227',
              week: launchableSlot?.week_number ?? progress?.current_week ?? 1,
            },
            launchableSlot ? { slot: launchableSlot } : {},
          ),
        category: 'Actions',
        id: 'action-start-workout',
        label: activeSession?.id ? 'Resume Workout' : 'Start Workout',
        shortcut: '↵',
        subtitle: launchableDay.name ?? 'Today',
      })
    }

    const cleanup = registerItems('app-global', globalItems)
    return cleanup
  }, [
    activeWorkout,
    activeSession?.day,
    activeSession?.id,
    activeSession?.slot,
    currentDay,
    currentPhase,
    handleStartWorkout,
    progress?.current_phase,
    progress?.current_week,
    currentSlot,
    registerItems,
    viewItems,
  ])

  function renderCurrentPage() {
    if (activeWorkout) {
      return (
        <ActiveWorkoutPage
          key={activeWorkout.sessionId ?? `${activeWorkout.source ?? 'program'}-${activeWorkout.templateId ?? activeWorkout.day?.id ?? 'session'}`}
          day={activeWorkout.day}
          phaseInfo={activeWorkout.phaseInfo}
          source={activeWorkout.source}
          templateId={activeWorkout.templateId}
          templateName={activeWorkout.templateName}
          sessionId={activeWorkout.sessionId ?? null}
          sessionStartedAt={activeWorkout.sessionStartedAt ?? null}
          initialDraft={activeWorkout.initialDraft ?? null}
          initialReadiness={activeWorkout.initialReadiness ?? null}
          remoteDraftDetected={Boolean(activeWorkout.remoteDraftDetected)}
          programId={activeWorkout.programId ?? program?.id ?? null}
          onFinish={async (result) => {
            if (isPersistingSession) {
              return
            }

            setIsPersistingSession(true)

            const sessionSets = result?.loggedSets ?? []
            const uniqueLoggedExerciseCount = new Set(
              sessionSets.map(
                (set) => set.prescribed_exercise_id ?? set.exercise_id ?? set.exercise_key,
              ),
            ).size
            const totalVolume = calculateVolume(sessionSets)
            const totalSets = sessionSets.length
            const restDisciplineScore = calculateRestDiscipline(sessionSets)
            const durationMinutes = Math.max(
              Math.round((Number(result?.completedAt) - Number(result?.startedAt)) / 1000 / 60),
              0,
            )
            const isProgramWorkout = (activeWorkout.source ?? 'program') === 'program'
            const resolvedProgram =
              isProgramWorkout && !(program?.phases?.length)
                ? await loadProgramStructure(activeWorkout.programId ?? program?.id ?? null)
                : program

            let sessionId = null
            let sessionError = null
            let persistedLoggedSets = []
            let prCards = []
            let phaseReportData = null
            let progressionSuggestions = []

            if (!sessionSets.length) {
              if (activeWorkout.sessionId) {
                const abandonedResult = await markWorkoutSessionAbandoned(activeWorkout.sessionId)

                if (!abandonedResult.success) {
                  showToast(abandonedResult.error ?? 'Unable to discard the in-progress session cleanly.', 'error')
                }
              }

              applyActiveWorkout(null)
              setIsPersistingSession(false)
              refetch()
              refetchProgress()
              return
            }

            if (activeWorkout.sessionId) {
              sessionId = activeWorkout.sessionId
            } else if (!isProgramWorkout) {
              const startResult = await startSession({
                programDayId: null,
                phaseNumber: null,
                weekNumber: null,
                startedAt: result?.startedAt,
                source: activeWorkout.source ?? 'custom',
                templateId: activeWorkout.templateId ?? null,
              })

              if (!startResult.success) {
                sessionError = startResult.error
              } else {
                sessionId = startResult.sessionId
              }
            } else {
              sessionError = 'Program session is unavailable.'
            }

            if (sessionId) {
              for (const setData of sessionSets) {
                const logResult = await logSet(sessionId, setData)

                if (!logResult.success) {
                  sessionError = sessionError ?? logResult.error
                  continue
                }

                persistedLoggedSets.push({
                  ...setData,
                  ...logResult.data,
                  exercise_id: logResult.exerciseId,
                })
                prCards = [...prCards, ...(logResult.prs ?? [])]
              }

              prCards = Array.from(
                new Map(prCards.map((prCard) => [prCard.id, prCard])).values(),
              )

              const completeResult = await completeSession(sessionId, {
                startedAt: result?.startedAt,
                completedAt: result?.completedAt,
                totalVolume,
                totalSets,
                durationMinutes,
                restDisciplineScore,
                prsHit: prCards.length,
                loggedSets: sessionSets,
                source: activeWorkout.source ?? 'program',
              })

              if (!completeResult.success) {
                sessionError = sessionError ?? completeResult.error
              } else if (isProgramWorkout) {
                prCards = Array.from(
                  new Map(
                    [...prCards, ...(completeResult.prs ?? [])].map((prCard) => [prCard.id, prCard]),
                  ).values(),
                )

                const clearDraftResult = await clearWorkoutDraft(sessionId)

                if (!clearDraftResult.success) {
                  sessionError = sessionError ?? clearDraftResult.error
                }

                if (activeWorkout.slotStateId) {
                  const slotStateResult = await updateProgramSlotState({
                    slotStateId: activeWorkout.slotStateId,
                    status:
                      activeWorkout.slotStatus === 'carried_forward'
                        ? 'completed_late'
                        : 'completed_on_time',
                    sessionId,
                  })

                  if (!slotStateResult.success) {
                    sessionError = sessionError ?? slotStateResult.error
                  }
                }

                const adaptiveContext = await getProgramAdaptiveContext(resolvedProgram, progress)
                const progressResult = await advanceProgress({
                  slotStates: adaptiveContext.slotStates ?? [],
                  phaseNumber: activeWorkout.phaseInfo?.phase_number ?? null,
                  totalVolume,
                  prsHit: completeResult.prsHit ?? prCards.length,
                  totalSets,
                })

                if (!progressResult.success) {
                  sessionError = sessionError ?? progressResult.error
                } else if (progressResult.phaseCompleted && progressResult.completedPhase) {
                  const snapshotResult = await createPhaseSnapshot({
                    phase: progressResult.completedPhase,
                    xpEarned: progressResult.xpEarned,
                    streakAtCompletion: progressResult.nextFields?.session_streak ?? 0,
                  })

                  if (snapshotResult.success) {
                    phaseReportData = {
                      phaseData: snapshotResult.data,
                      nextPhase: progressResult.nextPhase,
                      phaseColor: activeWorkout.phaseInfo?.phaseColor ?? '#c9a227',
                    }
                  } else {
                    sessionError = sessionError ?? snapshotResult.error
                  }
                }

                for (const [exerciseIndex, exercise] of (result?.day?.exercises ?? []).entries()) {
                  const workingSets = getWorkingSetsForExercise(
                    persistedLoggedSets.length ? persistedLoggedSets : sessionSets,
                    exercise,
                    exerciseIndex,
                  )

                  if (!workingSets.length || !exercise?.display_order || !exercise?.exercise_id) {
                    continue
                  }

                  const exposures = await getRecentSlotExposureHistory(resolvedProgram, {
                    phaseNumber: activeWorkout.phaseInfo?.phase_number ?? null,
                    dayNumber: activeWorkout.slotDayNumber ?? exercise?.day_number ?? null,
                    exerciseId: exercise.exercise_id,
                  })

                  const suggestion = buildProgressionSuggestion({
                    exercise,
                    phaseNumber: activeWorkout.phaseInfo?.phase_number ?? null,
                    dayNumber: activeWorkout.slotDayNumber ?? exercise?.day_number ?? null,
                    readinessBand: result?.readiness?.readiness_band ?? null,
                    workingSets,
                    previousUnderperformanceCount: countPreviousUnderperformances(
                      exercise,
                      exposures,
                    ),
                  })

                  if (suggestion) {
                    progressionSuggestions.push({
                      ...suggestion,
                      exerciseName: exercise?.name ?? 'Exercise',
                    })
                  }
                }
              } else {
                prCards = Array.from(
                  new Map(
                    [...prCards, ...(completeResult.prs ?? [])].map((prCard) => [prCard.id, prCard]),
                  ).values(),
                )

                const clearDraftResult = await clearWorkoutDraft(sessionId)

                if (!clearDraftResult.success) {
                  sessionError = sessionError ?? clearDraftResult.error
                }
              }
            }

            if (phaseReportData) {
              setPhaseCompletionReport(phaseReportData)
            } else {
              setSessionSummary({
                ...result,
                sessionId,
                loggedSets: persistedLoggedSets.length ? persistedLoggedSets : sessionSets,
                dayName:
                  activeWorkout.templateName ??
                  result?.day?.name ??
                  activeWorkout.day?.name ??
                  'Workout',
                phaseName:
                  isProgramWorkout
                    ? activeWorkout.phaseInfo?.name ??
                      result?.phaseInfo?.name ??
                      'Current Phase'
                    : 'Custom Workout',
                source: activeWorkout.source ?? 'program',
                templateId: activeWorkout.templateId ?? null,
                templateName: activeWorkout.templateName ?? null,
                phaseInfo: isProgramWorkout ? activeWorkout.phaseInfo ?? null : null,
                exerciseCount: uniqueLoggedExerciseCount,
                totalVolume,
                totalSets,
                restDisciplineScore,
                durationMinutes,
                prs: prCards,
                readiness: result?.readiness ?? null,
                progressionSuggestions,
                error: sessionError,
              })
            }
            applyActiveWorkout(null)
            setIsPersistingSession(false)
          }}
        />
      )
    }

    if (phaseCompletionReport) {
      return (
        <PhaseCompletionReport
          phaseData={phaseCompletionReport.phaseData}
          nextPhase={phaseCompletionReport.nextPhase}
          phaseColor={phaseCompletionReport.phaseColor}
          onContinue={() => {
            setPhaseCompletionReport(null)
            refetch()
            refetchProgress()
          }}
        />
      )
    }

    if (sessionSummary) {
      return (
        <SessionSummary
          session={sessionSummary}
          phaseInfo={sessionSummary.phaseInfo}
          onClose={async (summaryFields) => {
            if (sessionSummary?.sessionId) {
              await completeSession(sessionSummary.sessionId, {
                startedAt: sessionSummary.startedAt,
                completedAt: sessionSummary.completedAt,
                totalVolume: sessionSummary.totalVolume,
                totalSets: sessionSummary.totalSets,
                durationMinutes: sessionSummary.durationMinutes,
                restDisciplineScore: sessionSummary.restDisciplineScore,
                prsHit: sessionSummary.prs?.length ?? 0,
                notes: summaryFields?.notes,
                moodRating: summaryFields?.mood_rating,
                sessionRpe: summaryFields?.session_rpe,
                source: sessionSummary.source ?? 'program',
              })
            }

            if (program?.id && Array.isArray(summaryFields?.acceptedGuidance)) {
              for (const guidance of summaryFields.acceptedGuidance) {
                const guidanceResult = await saveProgramLoadGuidance({
                  programId: program.id,
                  phaseNumber: guidance.phaseNumber,
                  dayNumber: guidance.dayNumber,
                  displayOrder: guidance.displayOrder,
                  exerciseId: guidance.exerciseId,
                  guidanceAction: guidance.guidance_action,
                  targetWeight: guidance.target_weight,
                  sourceSessionId: sessionSummary?.sessionId ?? null,
                })

                if (!guidanceResult.success) {
                  showToast(guidanceResult.error ?? 'Unable to save one of the load guidance updates.', 'error')
                  break
                }
              }
            }

            setSessionSummary(null)
            refetch()
            refetchProgress()
          }}
        />
      )
    }

    if (programLoading && !program) {
      return <LoadingState />
    }

    if (page === 'programs') {
      return (
        <ProgramsPage
          program={program}
          progress={progress}
          onProgramSaved={async () => {
            refetch()
          }}
        />
      )
    }

    if (page === 'custom') {
      return (
        <CustomWorkoutsPage
          onCreate={() => openWorkoutBuilder()}
          onOpenTemplate={openCustomTemplate}
          onNavigate={navigateToPage}
        />
      )
    }

    if (page === 'custom-builder') {
      return (
        <WorkoutBuilderPage
          templateId={customBuilderTemplateId}
          onCancel={() =>
            customBuilderTemplateId ? openCustomTemplate(customBuilderTemplateId) : navigateToPage('custom')
          }
          onSaved={() => navigateToPage('custom')}
        />
      )
    }

    if (page === 'custom-detail') {
      return (
        <TemplateDetailPage
          templateId={customDetailTemplateId}
          onBack={() => navigateToPage('custom')}
          onEdit={(templateId) => openWorkoutBuilder(templateId)}
          onOpenTemplate={openCustomTemplate}
          onStartWorkout={(template) =>
            handleStartWorkout(
              {
                id: `custom-${template.id}`,
                name: template.name,
                exercises: template.exercises ?? [],
                notes: template.notes ?? null,
              },
              null,
              {
                source: 'custom',
                templateId: template.id,
                templateName: template.name,
              },
            )
          }
        />
      )
    }

    if (page === 'home') {
      return (
        <ModesPage
          program={program}
          progress={progress}
          currentSlot={currentSlot}
          weeklyQuota={weeklyQuota}
          overdueSlots={overdueSlots}
          onNavigate={navigateToPage}
          onStartProgramWorkout={
            currentSlot?.day
              ? () => {
                  handleStartWorkout(
                    currentSlot.day,
                    {
                      phase_number: currentSlot.phase_number ?? progress?.current_phase ?? 1,
                      name: currentSlot.phase_name ?? 'Current Phase',
                      week: currentSlot.week_number ?? progress?.current_week ?? 1,
                      phaseColor: '#c9a227',
                    },
                    {
                      slot: currentSlot,
                    },
                  )
                }
              : null
          }
          onCreateCustomWorkout={() => openWorkoutBuilder()}
        />
      )
    }

    if (!program) {
      return (
        <EmptyState
          page={page}
          onUploadClick={() => setPage('programs')}
          errorMessage={programError}
        />
      )
    }

    switch (page) {
      case 'program':
        return (
          <DashboardPage
            program={program}
            progress={progress}
            currentSlot={currentSlot}
            activeSession={activeSession}
            weeklyQuota={weeklyQuota}
            recoveryRecommendation={recoveryRecommendation}
            overdueSlots={overdueSlots}
            onSkipOverdue={handleSkipOverdueSlot}
            onStartWorkout={handleStartWorkout}
            onNavigate={navigateToPage}
            contextId="program"
          />
        )
      case 'progress':
        return <ProgressPage program={program} progress={progress} onNavigate={setPage} />
      case 'history':
        return <HistoryPage program={program} />
      case 'library':
        return <ExercisesPage />
      case 'glossary':
        return <GlossaryPage />
      case 'settings':
        return (
          <SettingsPage
            program={program}
            progress={progress}
            updateProgress={updateProgress}
            onNavigate={setPage}
            onDataReset={() => {
              refetch()
              refetchProgress()
              setPage('home')
            }}
          />
        )
      default:
        return (
          <DashboardPage
            program={program}
            progress={progress}
            currentSlot={currentSlot}
            activeSession={activeSession}
            weeklyQuota={weeklyQuota}
            recoveryRecommendation={recoveryRecommendation}
            overdueSlots={overdueSlots}
            onSkipOverdue={handleSkipOverdueSlot}
            onStartWorkout={handleStartWorkout}
            onNavigate={navigateToPage}
            contextId="program"
          />
        )
    }
  }

  const sidebarSlot =
    showAppChrome && isLargeViewport ? (
      <Suspense fallback={null}>
        <DesktopSidebar
          activePage={getNavigationPage(page)}
          onNavigate={navigateToPage}
          onCommandOpen={openCommandBar}
          program={program}
          progress={progress}
        />
      </Suspense>
    ) : null

  const mobileNavSlot =
    showAppChrome && !isLargeViewport ? (
      <Suspense fallback={null}>
        <BottomNav
          activePage={getNavigationPage(page)}
          onNavigate={navigateToPage}
          onCommandOpen={openCommandBar}
        />
      </Suspense>
    ) : null

  return (
    <>
      <AppShell
        showChrome={showAppChrome}
        headerSlot={showAppChrome ? <Breadcrumb /> : null}
        sidebar={sidebarSlot}
        mobileNav={mobileNavSlot}
      >
        <Suspense fallback={<PageFallback />}>{renderCurrentPage()}</Suspense>
      </AppShell>

      {!showAppChrome && !activeWorkout ? <Breadcrumb floating topClassName="top-[4.75rem]" /> : null}

      {activeWorkout || showAppChrome ? (
        <div className="hidden lg:block">
          <FooterBar bottomOffsetClassName={footerBottomOffsetClassName} />
        </div>
      ) : null}

      <SessionRecoveryOverlay
        sessions={sessionRecoveryPrompt?.sessions ?? []}
        pendingLaunchLabel={
          sessionRecoveryPrompt?.pendingLaunch?.templateName ??
          sessionRecoveryPrompt?.pendingLaunch?.day?.name ??
          null
        }
        onResume={resumeRecoverableWorkout}
        onDiscard={discardRecoverableWorkout}
        onClose={resolveRecoveryPrompt}
      />
      {isCommandBarOpen ? (
        <Suspense fallback={null}>
          <CommandBar />
        </Suspense>
      ) : null}
    </>
  )
}

export default App
