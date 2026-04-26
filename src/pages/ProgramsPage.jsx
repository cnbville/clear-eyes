import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Sparkles, Upload } from 'lucide-react'
import PhaseRoadmap from '../components/programs/PhaseRoadmap.jsx'
import PdfUpload from '../components/programs/PdfUpload.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { getPhaseColor } from '../lib/calculations.js'
import { saveProgram } from '../lib/programSaver.js'
import { isConfigured, supabase } from '../lib/supabase.js'
import ImportPreviewPage from './ImportPreviewPage.jsx'

function getCurrentPhase(program, progress) {
  if (!program?.phases?.length) {
    return null
  }

  const targetPhaseNumber = progress?.current_phase ?? program.phases[0].phase_number

  return (
    program.phases.find((phase) => phase.phase_number === targetPhaseNumber) ??
    program.phases[0]
  )
}

function getSessionsRemaining(program, progress, currentPhase) {
  if (!program || !currentPhase) {
    return 0
  }

  const currentWeek = progress?.current_week ?? 1
  const currentDay = progress?.current_day ?? 1

  return (
    (currentPhase.num_weeks - currentWeek) * program.days_per_week +
    (program.days_per_week - currentDay + 1)
  )
}

function ProgramsPage({ program, progress, onProgramSaved }) {
  const [showUploader, setShowUploader] = useState(!program)
  const [extractedData, setExtractedData] = useState(null)
  const [status, setStatus] = useState({
    tone: 'neutral',
    message: '',
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const roadmapRef = useRef(null)

  const currentPhase = useMemo(
    () => getCurrentPhase(program, progress),
    [program, progress],
  )
  const phaseColor = getPhaseColor(currentPhase?.phase_number)
  const sessionsRemaining = getSessionsRemaining(program, progress, currentPhase)
  const footerActions = useMemo(() => {
    if (!program) {
      return [
        {
          action: () => setShowUploader(true),
          displayShortcut: '↵',
          id: 'programs-open-import',
          label: extractedData ? 'Review Import' : 'Open Import Bay',
          shortcut: 'Enter',
        },
        {
          action: null,
          displayShortcut: '⌘K',
          id: 'programs-search',
          label: 'Search',
          shortcut: 'Mod+K',
        },
      ]
    }

    return [
      {
        action: () => roadmapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        displayShortcut: '↵',
        id: 'programs-view-roadmap',
        label: 'View Roadmap',
        shortcut: 'Enter',
      },
      {
        action: null,
        displayShortcut: '⌘K',
        id: 'programs-search',
        label: 'Search',
        shortcut: 'Mod+K',
      },
    ]
  }, [extractedData, program])

  useInteractionContext('programs', {
    breadcrumbSegments: [
      'IRON',
      'Program Vault',
      extractedData ? 'Review Import' : program?.name ?? 'Import Chamber',
    ],
    footerActions,
  })

  useEffect(() => {
    if (program && isRefreshing) {
      setShowUploader(false)
      setIsRefreshing(false)
      setStatus({
        tone: 'success',
        message: 'Program imported and activated.',
      })
    }
  }, [program, isRefreshing])

  async function handleConfirmImport(editedData) {
    if (!isConfigured) {
      const result = {
        success: false,
        error: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before saving.',
      }

      setStatus({
        tone: 'error',
        message: result.error,
      })

      return result
    }

    setStatus({
      tone: 'loading',
      message: 'Saving program to Supabase...',
    })

    const result = await saveProgram(supabase, editedData)

    if (!result.success) {
      setStatus({
        tone: 'error',
        message: result.error,
      })

      return result
    }

    setExtractedData(null)
    setShowUploader(false)
    setIsRefreshing(true)
    setStatus({
      tone: 'loading',
      message: 'Program saved. Refreshing active program...',
    })

    await onProgramSaved?.()
    window.dispatchEvent(new CustomEvent('iron:program-changed'))

    return result
  }

  function handleCancelPreview() {
    setExtractedData(null)
    setStatus({
      tone: 'neutral',
      message: '',
    })
  }

  const statusClassName = {
    neutral: 'border-white/[0.04] bg-iron-800 text-zinc-400',
    loading: 'border-gold/15 bg-gold/5 text-gold',
    success: 'border-mint/20 bg-mint/10 text-mint',
    error: 'border-coral/20 bg-coral/10 text-coral',
  }[status.tone]

  const statusBanner = status.message ? (
    <div className={`rounded-[24px] border px-4 py-3 text-[13px] ${statusClassName}`}>
      {status.message}
    </div>
  ) : null

  if (!program && extractedData) {
    return (
      <section className="space-y-6 py-2 lg:py-1">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Program Vault
            </p>
            <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
              Review the import before it enters the system.
            </h1>
          </div>
        </header>

        {statusBanner}

        <ImportPreviewPage
          extractedData={extractedData}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelPreview}
        />
      </section>
    )
  }

  if (!program) {
    return (
      <section className="space-y-6 py-2 lg:py-1">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Program Vault
            </p>
            <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
              Load the engine with a real training system.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Import a PDF, inspect the extracted structure, then activate it as the program that
              powers the whole wall.
            </p>
          </div>
        </header>

        {statusBanner}

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden rounded-[30px] border border-white/[0.06] bg-[linear-gradient(145deg,rgba(20,20,22,0.96),rgba(10,10,11,0.92))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.42)] sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,162,39,0.16),transparent_42%)]" />
            <div className="relative flex items-center gap-3">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-gold/20 bg-gold/10 text-gold">
                <Sparkles className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                  Import Chamber
                </p>
                <p className="mt-1 text-[16px] font-semibold text-zinc-100">
                  No active program on the deck
                </p>
              </div>
            </div>

            <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ['Schema', 'Ready', 'Tables and saver flow are online'],
                ['Extractor', 'Live', 'Claude can parse uploaded PDFs'],
                ['Supabase', 'Connected', 'Imports persist into the vault'],
              ].map(([label, value, description]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
                  <p className="mt-2 text-[20px] font-bold tracking-[-0.04em] text-zinc-50">
                    {value}
                  </p>
                  <p className="mt-2 text-[12px] leading-5 text-zinc-500">{description}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-4">
            {isRefreshing ? (
              <div className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-6 text-sm text-zinc-500">
                Refreshing your newly imported program...
              </div>
            ) : (
              <PdfUpload onExtracted={setExtractedData} />
            )}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6 py-2 lg:py-1">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
            Program Vault
          </p>
          <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
            Your active system lives here.
          </h1>
          <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
            Track the current cycle, see what phase is active, and bring a new program into the
            chamber when you are ready to rotate.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:w-auto">
          <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Days / Week</p>
            <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">
              {program.days_per_week}
            </p>
          </div>
          <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Phases</p>
            <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">
              {program.phases?.length ?? 0}
            </p>
          </div>
        </div>
      </header>

      {statusBanner}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <div
            ref={roadmapRef}
            className="rounded-[30px] border border-white/[0.04] border-l-[3px] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.4)]"
            style={{ borderLeftColor: phaseColor }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <span className="inline-flex rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-gold">
                  ACTIVE
                </span>
                <h1 className="mt-4 text-[28px] font-bold tracking-[-0.05em] text-zinc-100">
                  {program.name}
                </h1>
                <p className="mt-2 text-[14px] text-zinc-500">
                  {program.author ? `by ${program.author}` : 'No author listed'}
                </p>
              </div>

              <div className="rounded-[22px] border border-white/[0.04] bg-iron-900/70 px-4 py-3 text-right">
                <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Current Phase</p>
                <p className="mt-2 text-[18px] font-semibold text-zinc-100">
                  {currentPhase?.name ?? 'Phase'}
                </p>
                <p className="mt-1 text-[12px]" style={{ color: phaseColor }}>
                  {Math.max(sessionsRemaining, 0)} sessions remaining
                </p>
              </div>
            </div>

            <PhaseRoadmap
              phases={program.phases}
              currentPhase={currentPhase}
              sessionsRemaining={sessionsRemaining}
            />
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-[30px] border border-white/[0.05] bg-iron-900/75 p-5">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.05] bg-iron-950/80 text-gold">
                <Upload className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                  Import Bay
                </p>
                <p className="mt-1 text-[15px] font-semibold text-zinc-100">
                  Rotate to a new program
                </p>
              </div>
            </div>

            <p className="mt-4 text-[13px] leading-6 text-zinc-500">
              Bring in another PDF when it is time to pivot blocks, test a new cycle, or archive
              the current engine.
            </p>

            {showUploader ? (
              <div className="mt-5">
                <PdfUpload onExtracted={setExtractedData} />
              </div>
            ) : (
              <button
                type="button"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-iron-600 bg-iron-800/60 px-4 py-5 text-sm font-semibold text-zinc-400 transition hover:border-gold hover:bg-gold/5 hover:text-zinc-200"
                onClick={() => {
                  setShowUploader(true)
                  setStatus({
                    tone: 'neutral',
                    message: '',
                  })
                }}
              >
                <Plus className="h-4 w-4" />
                <span>Upload New Program</span>
              </button>
            )}
          </section>

          <section className="rounded-[30px] border border-white/[0.05] bg-iron-900/75 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Vault Telemetry
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              {[
                ['Cycle Length', `${(program.phases ?? []).reduce((sum, phase) => sum + (phase.num_weeks ?? 0), 0)} weeks`],
                ['Current Position', `Week ${progress?.current_week ?? 1} · Day ${progress?.current_day ?? 1}`],
                ['Upload Status', isRefreshing ? 'Refreshing' : 'Stable'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
                  <p className="mt-2 text-[16px] font-semibold text-zinc-100">{value}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {extractedData ? (
        <ImportPreviewPage
          extractedData={extractedData}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelPreview}
        />
      ) : null}
    </section>
  )
}

export default ProgramsPage
