import GlossaryTerm from '../shared/GlossaryTerm.jsx'

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function PhaseBanner({
  phase,
  currentWeek = 1,
  totalWeeks = 1,
  sessionsRemaining = 0,
  phaseColor = '#c9a227',
}) {
  const phaseNumber = phase?.phase_number ?? 1
  const progressPercentage = totalWeeks
    ? clamp((currentWeek / totalWeeks) * 100, 0, 100)
    : 0

  const showFinalSessionAlert = sessionsRemaining <= 1
  const showPhaseFinaleAlert = sessionsRemaining > 1 && sessionsRemaining <= 5

  return (
    <section
      className="overflow-hidden rounded-2xl border border-white/[0.04] border-l-[3px] bg-iron-800"
      style={{ borderLeftColor: phaseColor }}
    >
      {showFinalSessionAlert ? (
        <div
          className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em]"
          style={{
            backgroundColor: `${phaseColor}26`,
            color: phaseColor,
          }}
        >
          FINAL SESSION — PHASE {phaseNumber}
        </div>
      ) : null}

      {showPhaseFinaleAlert ? (
        <div
          className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em]"
          style={{
            backgroundColor: `${phaseColor}26`,
            color: phaseColor,
          }}
        >
          PHASE FINALE — {sessionsRemaining} sessions remaining
        </div>
      ) : null}

      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
              <GlossaryTerm term="phase">PHASE {phaseNumber}</GlossaryTerm>
            </p>
            <h2 className="mt-2 text-[15px] font-semibold text-zinc-100">
              {phase?.name ?? 'Untitled phase'}
            </h2>
            <p className="mt-1 text-[12px] text-zinc-500">
              {phase?.description || 'Current training block'}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[13px] font-semibold text-zinc-200">
              <GlossaryTerm term="week">Wk {currentWeek}/{totalWeeks}</GlossaryTerm>
            </p>
            <p className="mt-1 text-[12px]" style={{ color: phaseColor }}>
              {sessionsRemaining} to next phase
            </p>
          </div>
        </div>

        <div className="mt-3.5 h-1 overflow-hidden rounded-full bg-iron-900">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progressPercentage}%`,
              backgroundColor: phaseColor,
            }}
          />
        </div>

        <p className="mt-2 text-right font-mono text-[11px] text-zinc-600">
          {Math.round(progressPercentage)}%
        </p>
      </div>
    </section>
  )
}

export default PhaseBanner
