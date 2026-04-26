import { Check, Lock } from 'lucide-react'
import { getPhaseColor } from '../../lib/calculations.js'

function getCurrentPhaseNumber(currentPhase) {
  if (typeof currentPhase === 'number') {
    return currentPhase
  }

  return currentPhase?.phase_number ?? 1
}

function getPhaseSessionCount(phase, fallbackDaysPerWeek) {
  const daysPerWeek = phase?.days?.length || fallbackDaysPerWeek || 0
  return daysPerWeek * (phase?.num_weeks ?? 1)
}

function PhaseRoadmap({ phases = [], currentPhase, sessionsRemaining = 0 }) {
  const currentPhaseNumber = getCurrentPhaseNumber(currentPhase)
  const sortedPhases = [...phases].sort(
    (left, right) => left.phase_number - right.phase_number,
  )
  const currentPhaseIndex = sortedPhases.findIndex(
    (phase) => phase.phase_number === currentPhaseNumber,
  )
  const fallbackDaysPerWeek = currentPhase?.days?.length ?? 0

  function getUnlockEstimate(targetIndex) {
    if (targetIndex <= currentPhaseIndex) {
      return 0
    }

    let totalSessions = Math.max(sessionsRemaining, 0)

    for (let index = currentPhaseIndex + 1; index < targetIndex; index += 1) {
      totalSessions += getPhaseSessionCount(sortedPhases[index], fallbackDaysPerWeek)
    }

    return totalSessions
  }

  return (
    <div className="mt-5 space-y-4">
      {sortedPhases.map((phase, index) => {
        const isCompleted = phase.phase_number < currentPhaseNumber
        const isCurrent = phase.phase_number === currentPhaseNumber
        const isLocked = phase.phase_number > currentPhaseNumber
        const phaseColor = getPhaseColor(phase.phase_number)
        const unlockSessions = getUnlockEstimate(index)

        return (
          <div key={phase.phase_number} className="relative pl-11">
            {index < sortedPhases.length - 1 ? (
              <span className="absolute left-[15px] top-8 h-[calc(100%+0.5rem)] w-px bg-iron-600" />
            ) : null}

            <div
              className={`absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border ${
                isCompleted
                  ? 'border-mint/30 bg-mint/15 text-mint'
                  : isCurrent
                    ? 'border-transparent text-iron-900'
                    : 'border-iron-600 bg-iron-900 text-zinc-600'
              }`}
              style={isCurrent ? { backgroundColor: phaseColor } : undefined}
            >
              {isCompleted ? (
                <Check className="h-4 w-4" strokeWidth={2.4} />
              ) : isLocked ? (
                <Lock className="h-4 w-4" strokeWidth={1.9} />
              ) : (
                <span className="text-[12px] font-bold">{phase.phase_number}</span>
              )}
            </div>

            <div className="rounded-xl border border-white/[0.04] bg-iron-900/60 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-100">{phase.name}</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {phase.description || `${phase.num_weeks} week phase`}
                  </p>
                </div>

                {isCurrent ? (
                  <span
                    className="shrink-0 text-[10px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: phaseColor }}
                  >
                    ◄ YOU ARE HERE
                  </span>
                ) : null}
              </div>

              {isLocked ? (
                <p className="mt-2 text-[12px] text-zinc-600">
                  Unlocks in ~{unlockSessions} sessions
                </p>
              ) : isCompleted ? (
                <p className="mt-2 text-[12px] text-mint">Completed</p>
              ) : (
                <p className="mt-2 text-[12px]" style={{ color: phaseColor }}>
                  {Math.max(sessionsRemaining, 0)} sessions to phase completion
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default PhaseRoadmap
