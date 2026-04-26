import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Dumbbell,
  FileJson,
  Plus,
  Sparkles,
} from 'lucide-react'
import QuickTemplateImportModal from '../components/custom/QuickTemplateImportModal.jsx'
import TemplateCard from '../components/custom/TemplateCard.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import { formatRelativeTime } from '../lib/customWorkouts.js'
import { seedExercises } from '../services/exerciseService.js'
import { getTemplates } from '../services/templateService.js'

function CustomWorkoutsPage({ onCreate, onOpenTemplate, onNavigate }) {
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importSummary, setImportSummary] = useState(null)

  const activeTemplates = useMemo(
    () => templates.filter((template) => !template.is_archived),
    [templates],
  )
  const archivedTemplates = useMemo(
    () => templates.filter((template) => template.is_archived),
    [templates],
  )
  const totalTemplateUses = useMemo(
    () => activeTemplates.reduce((sum, template) => sum + (Number(template.times_used) || 0), 0),
    [activeTemplates],
  )
  const mostRecentlyTouchedTemplate = useMemo(
    () =>
      [...activeTemplates].sort(
        (left, right) =>
          `${right.last_used_at ?? right.updated_at ?? ''}`.localeCompare(
            `${left.last_used_at ?? left.updated_at ?? ''}`,
          ),
      )[0] ?? null,
    [activeTemplates],
  )

  const footerActions = useMemo(
    () => [
      {
        action: onCreate,
        displayShortcut: '↵',
        id: 'custom-create-workout',
        label: 'Create Workout',
        shortcut: 'Enter',
      },
      {
        action: () => setIsImportOpen(true),
        displayShortcut: '⌘I',
        id: 'custom-import-workout',
        label: 'Quick Import',
        shortcut: 'Mod+I',
      },
      {
        action: () => onNavigate?.('program'),
        displayShortcut: '⌘P',
        id: 'custom-program-mode',
        label: 'Program Mode',
        shortcut: 'Mod+P',
      },
    ],
    [onCreate, onNavigate],
  )

  useInteractionContext('custom', {
    breadcrumbSegments: ['IRON', 'My Workouts'],
    footerActions,
  })

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      await seedExercises()
      const rows = await getTemplates(true)
      setTemplates(rows)
      setLoading(false)
    } catch (loadError) {
      setTemplates([])
      setError(loadError instanceof Error ? loadError.message : 'Failed to load templates.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        await loadTemplates()
      } catch {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    if (!cancelled) {
      void load()
    }

    return () => {
      cancelled = true
    }
  }, [loadTemplates])

  async function handleImported(summary) {
    setImportSummary(summary)
    setIsImportOpen(false)
    await loadTemplates()
  }

  return (
    <>
      <section className="space-y-5 py-2 lg:py-1">
        <header className="flex flex-col items-start gap-4 rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-4 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.32em] text-sky">
              My Workouts
            </p>
            <h1 className="mt-3 text-[26px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[30px]">
              Custom mode deserves its own kingdom now.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Build reusable sessions, launch them instantly, and feed the exact same progress
              engine as program mode. This is no longer the tiny side room.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-gold/30 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.18em] text-gold transition hover:bg-gold/10"
              onClick={() => onNavigate?.('program')}
            >
              <span>Program Mode</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-100 transition hover:border-sky/30 hover:text-sky"
              onClick={() => setIsImportOpen(true)}
            >
              <FileJson className="h-4 w-4" strokeWidth={2} />
              <span>Quick Import</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-lg border border-sky/30 bg-sky/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.18em] text-sky transition hover:bg-sky/15"
              onClick={() => onCreate?.()}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              <span>Create</span>
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/[0.05] bg-iron-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Active Templates</p>
            <p className="mt-2 text-[28px] font-bold tracking-[-0.05em] text-zinc-50">
              {activeTemplates.length}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/[0.05] bg-iron-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Total Uses</p>
            <p className="mt-2 text-[28px] font-bold tracking-[-0.05em] text-zinc-50">
              {totalTemplateUses}
            </p>
          </div>
          <div className="rounded-[24px] border border-white/[0.05] bg-iron-900/70 px-5 py-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600">Most Recent</p>
            <p className="mt-2 truncate text-[22px] font-bold tracking-[-0.05em] text-zinc-50">
              {mostRecentlyTouchedTemplate?.name ?? 'Ready'}
            </p>
            <p className="mt-2 text-[12px] text-zinc-500">
              {mostRecentlyTouchedTemplate?.last_used_at
                ? `Last used ${formatRelativeTime(mostRecentlyTouchedTemplate.last_used_at)}`
                : 'Create your first saved session'}
            </p>
          </div>
        </section>

        {importSummary ? (
          <div className="rounded-[24px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-100">
            Imported {importSummary.importedWorkouts} workout
            {importSummary.importedWorkouts === 1 ? '' : 's'} and created{' '}
            {importSummary.createdExercises} new exercise
            {importSummary.createdExercises === 1 ? '' : 's'}.
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[24px] border border-coral/20 bg-coral/10 px-4 py-3 text-[13px] text-coral">
            {error}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-6">
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-zinc-500">
                Template Floor
              </p>
              <h2 className="mt-3 text-[30px] font-semibold tracking-[-0.05em] text-zinc-50">
                Open the sessions worth keeping.
              </h2>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-iron-900/60 px-4 py-2 text-[12px] text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-sky" strokeWidth={1.8} />
              <span>
                Custom work still counts toward analytics, lift memory, and exercise notes.
              </span>
            </div>
          </div>

          {loading ? (
            <div className="mt-6 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="h-28 animate-pulse rounded-[28px] bg-iron-900/70" />
              ))}
            </div>
          ) : activeTemplates.length || archivedTemplates.length ? (
            <div className="mt-6 space-y-3">
              {activeTemplates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onClick={() => onOpenTemplate?.(template.id)}
                />
              ))}

              {archivedTemplates.length ? (
                <section className="pt-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-[24px] border border-white/[0.05] bg-iron-950/60 px-5 py-4 text-left"
                    onClick={() => setShowArchived((current) => !current)}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      Archived Templates
                    </span>
                    {showArchived ? (
                      <ChevronUp className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
                    )}
                  </button>

                  {showArchived ? (
                    <div className="mt-3 space-y-3">
                      {archivedTemplates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          dimmed
                          onClick={() => onOpenTemplate?.(template.id)}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : (
            <div className="mt-6 flex min-h-[320px] flex-col items-center justify-center rounded-[28px] border border-white/[0.05] bg-iron-950/55 px-6 text-center">
              <Dumbbell className="h-12 w-12 text-zinc-600" strokeWidth={1.6} />
              <p className="mt-5 text-[22px] font-semibold text-zinc-100">No custom workouts yet</p>
              <p className="mt-3 max-w-md text-[14px] leading-7 text-zinc-500">
                Build the first one or import a JSON block and the custom side immediately becomes
                part of the same performance memory as the structured program.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.08] px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-zinc-100 transition hover:border-sky/30 hover:text-sky"
                  onClick={() => setIsImportOpen(true)}
                >
                  <FileJson className="h-4 w-4" strokeWidth={2} />
                  <span>Quick Import</span>
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full bg-sky px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-[#9dd0ee]"
                  onClick={() => onCreate?.()}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                  <span>Create Workout</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      <QuickTemplateImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImported={handleImported}
      />
    </>
  )
}

export default CustomWorkoutsPage
