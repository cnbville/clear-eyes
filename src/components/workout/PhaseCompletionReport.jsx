import GlossaryTerm from '../shared/GlossaryTerm.jsx'

function normalizeComparisons(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (Array.isArray(value?.comparisons)) {
    return value.comparisons
  }

  return []
}

function formatVolume(value) {
  return `${Math.round(Number(value) || 0)} kg`
}

function PhaseCompletionReport({ phaseData, nextPhase, phaseColor = '#c9a227', onContinue }) {
  const comparisons = normalizeComparisons(phaseData?.lift_comparisons)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-iron-900">
      <div className="mx-auto min-h-screen w-full max-w-lg px-4 pb-10 pt-10">
        <header className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-zinc-500">
            Phase {phaseData?.phase_number ?? '--'}
          </p>
          <h1 className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-zinc-100">
            {phaseData?.name ?? 'Phase'}
          </h1>
          <p className="mt-2 text-[16px] font-semibold" style={{ color: phaseColor }}>
            Complete
          </p>
          <div
            className="mx-auto mt-5 h-px w-full max-w-[280px]"
            style={{
              background: `linear-gradient(90deg, transparent, ${phaseColor}, transparent)`,
            }}
          />
        </header>

        <section className="mt-8 grid grid-cols-2 gap-3">
          {[
            {
              key: 'sessions',
              label: 'Sessions',
              value: `${phaseData?.sessions_completed ?? 0}/${phaseData?.sessions_total ?? 0}`,
              tone: 'default',
            },
            {
              key: 'volume',
              label: <GlossaryTerm term="volume">Volume</GlossaryTerm>,
              value: formatVolume(phaseData?.total_volume),
              tone: 'default',
            },
            {
              key: 'prs',
              label: <GlossaryTerm term="pr">PRs</GlossaryTerm>,
              value: `${phaseData?.prs_hit ?? 0}`,
              tone: 'gold',
            },
            {
              key: 'rest-discipline',
              label: <GlossaryTerm term="rest_discipline">Rest Score</GlossaryTerm>,
              value: `${Math.round(Number(phaseData?.avg_rest_discipline) || 0)}%`,
              tone: 'default',
            },
          ].map((item) => (
            <div
              key={item.key}
              className="rounded-xl border border-white/[0.04] bg-iron-800 p-4"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                {item.label}
              </p>
              <p
                className={`mt-3 font-mono text-[22px] font-bold ${
                  item.tone === 'gold' ? 'text-gold' : 'text-zinc-100'
                }`}
              >
                {item.value}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            Progression
          </p>

          <div className="mt-4 space-y-3">
            {comparisons.length ? (
              comparisons.map((comparison) => {
                const delta = Number(comparison?.pct_change ?? comparison?.pct ?? 0)

                return (
                  <div
                    key={`${comparison.exercise_name}-${comparison.start_weight}-${comparison.end_weight}`}
                    className="rounded-2xl border border-white/[0.04] bg-iron-800 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-semibold text-zinc-100">
                        {comparison.exercise_name}
                      </p>
                      <p
                        className="text-[12px] font-semibold"
                        style={{ color: delta >= 0 ? '#4ade80' : '#f87171' }}
                      >
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(1)}%
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-[12px] text-zinc-500">
                      {comparison.start_weight}kg → {comparison.end_weight}kg
                    </p>
                  </div>
                )
              })
            ) : (
              <div className="rounded-2xl border border-white/[0.04] bg-iron-800 px-4 py-4 text-[13px] text-zinc-500">
                Phase comparisons will appear here once enough session data is available.
              </div>
            )}
          </div>
        </section>

        {nextPhase ? (
          <section className="mt-8 rounded-2xl border border-white/[0.04] bg-iron-800 p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
              Next Phase
            </p>
            <h2 className="mt-3 text-[18px] font-semibold text-zinc-100">{nextPhase.name}</h2>
            <p className="mt-2 text-[13px] leading-6 text-zinc-500">
              {nextPhase.description ?? 'The next training block is ready when you are.'}
            </p>
          </section>
        ) : null}

        <button
          type="button"
          className="mt-8 w-full rounded-2xl px-5 py-4 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition"
          style={{ backgroundColor: phaseColor }}
          onClick={onContinue}
        >
          Begin Phase {nextPhase?.phase_number ?? phaseData?.phase_number ?? 1}
        </button>
      </div>
    </div>
  )
}

export default PhaseCompletionReport
