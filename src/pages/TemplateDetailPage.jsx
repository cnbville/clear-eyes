import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MoreHorizontal, PencilLine, Play, Plus, Archive } from 'lucide-react'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import {
  formatLabel,
  getTechniqueLabel,
  groupExercisesByMuscle,
} from '../lib/customWorkouts.js'
import {
  deleteTemplate,
  duplicateTemplate,
  getTemplateById,
  recordTemplateUsage,
} from '../services/templateService.js'

function imageUrlFor(imageId, frame) {
  return `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/${imageId}/${frame}.jpg`
}

function Badge({ children, tone = 'neutral' }) {
  const className = {
    neutral: 'border-white/[0.06] bg-iron-950/80 text-zinc-400',
    gold: 'border-gold/20 bg-gold/10 text-gold',
    mint: 'border-mint/20 bg-mint/10 text-mint',
    coral: 'border-coral/20 bg-coral/10 text-coral',
    sky: 'border-sky/20 bg-sky/10 text-sky',
  }[tone]

  return (
    <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] ${className}`}>
      {children}
    </span>
  )
}

function TemplateDetailPage({ templateId, onBack, onEdit, onStartWorkout, onOpenTemplate }) {
  const [template, setTemplate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [expandedExerciseId, setExpandedExerciseId] = useState(null)

  const groupedExercises = useMemo(
    () => groupExercisesByMuscle(template?.exercises ?? []),
    [template?.exercises],
  )
  const footerActions = useMemo(
    () => [
      {
        action: () => onStartWorkout?.(template),
        disabled: !template,
        displayShortcut: '↵',
        id: 'template-start-workout',
        label: 'Start Workout',
        shortcut: 'Enter',
      },
      {
        action: () => onEdit?.(templateId),
        disabled: !template,
        displayShortcut: '⌘E',
        id: 'template-edit-workout',
        label: 'Edit Workout',
        shortcut: 'Mod+E',
      },
    ],
    [onEdit, onStartWorkout, template, templateId],
  )

  useInteractionContext('custom-detail', {
    breadcrumbSegments: ['IRON', 'My Workouts', template?.name ?? 'Template Detail'],
    footerActions,
  })

  useEffect(() => {
    let cancelled = false

    async function loadTemplate() {
      setLoading(true)
      setError('')

      try {
        const data = await getTemplateById(templateId)

        if (!cancelled) {
          setTemplate(data)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load template.')
          setLoading(false)
        }
      }
    }

    void loadTemplate()

    return () => {
      cancelled = true
    }
  }, [templateId])

  async function handleStart() {
    if (!template) {
      return
    }

    const usageResult = await recordTemplateUsage(template.id)

    if (usageResult.success && usageResult.data) {
      setTemplate((currentTemplate) => ({
        ...currentTemplate,
        ...usageResult.data,
      }))
    }

    onStartWorkout?.(template)
  }

  async function handleDuplicate() {
    const result = await duplicateTemplate(templateId)

    if (result.success && result.data) {
      onOpenTemplate?.(result.data.id)
    } else {
      setError(result.error ?? 'Failed to duplicate template.')
    }
  }

  async function handleArchive() {
    const result = await deleteTemplate(templateId)

    if (!result.success) {
      setError(result.error ?? 'Failed to archive template.')
      return
    }

    onBack?.()
  }

  if (loading) {
    return (
      <section className="space-y-4 py-3">
        <div className="h-28 animate-pulse rounded-[26px] bg-iron-800/70" />
        <div className="h-80 animate-pulse rounded-[26px] bg-iron-800/70" />
      </section>
    )
  }

  if (!template) {
    return (
      <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-8 text-center">
        <p className="text-[18px] font-semibold text-zinc-200">Template not found.</p>
      </section>
    )
  }

  return (
    <section className="space-y-5 py-2">
      <header className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-4 sm:p-6">
        <button
          type="button"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-zinc-400 transition hover:text-zinc-100"
          onClick={() => onBack?.()}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          <span>Back</span>
        </button>

        <h1 className="mt-5 text-[28px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[32px]">
          {template.name}
        </h1>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {formatLabel(template.focus)} · {template.total_sets ?? 0} sets · ~
          {template.estimated_duration ?? 0} min
        </p>
        {template.notes ? (
          <p className="mt-4 max-w-3xl text-[13px] leading-6 text-zinc-400">{template.notes}</p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 text-[12px] font-bold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light"
            onClick={handleStart}
          >
            <Play className="h-4 w-4" strokeWidth={2} />
            <span>Start Workout</span>
          </button>
          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-iron-900 px-4 py-3 text-[12px] font-semibold text-zinc-300 transition hover:border-white/[0.08]"
            onClick={() => onEdit?.(template.id)}
          >
            <PencilLine className="h-4 w-4" strokeWidth={1.8} />
            <span>Edit</span>
          </button>
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-full items-center justify-center rounded-lg bg-iron-900 px-4 py-3 text-zinc-300 transition hover:text-zinc-100"
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.8} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-14 z-10 min-w-[180px] overflow-hidden rounded-2xl border border-white/[0.04] bg-iron-900 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-zinc-300 transition hover:bg-iron-800"
                  onClick={handleDuplicate}
                >
                  <Plus className="h-4 w-4" strokeWidth={1.8} />
                  <span>Duplicate</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] text-zinc-300 transition hover:bg-iron-800"
                  onClick={handleArchive}
                >
                  <Archive className="h-4 w-4" strokeWidth={1.8} />
                  <span>Archive</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-coral/20 bg-coral/10 px-4 py-3 text-[13px] text-coral">
            {error}
          </div>
        ) : null}
      </header>

      <div className="space-y-5">
        {groupedExercises.map((group) => (
          <section key={group.muscleGroup} className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <p className="text-[18px] font-bold uppercase tracking-[0.16em] text-zinc-100">
                  {group.label}
                </p>
              </div>
              <p className="font-mono text-[12px] text-zinc-500">{group.totalSets} sets</p>
            </div>

            <div className="mt-4 space-y-3">
              {group.exercises.map((exercise, index) => {
                const isFinisher = exercise.technique === 'finisher'
                const isExpanded = expandedExerciseId === exercise.id
                const previousExercise = group.exercises[index - 1]
                const supersetBadge =
                  exercise.technique === 'superset' && exercise.superset_group
                    ? previousExercise?.superset_group === exercise.superset_group
                      ? 'Into'
                      : 'Superset'
                    : null

                return (
                  <article
                    key={exercise.id}
                    className={`rounded-[24px] border p-4 transition ${
                      isFinisher
                        ? 'border-coral/20 bg-coral/[0.08]'
                        : 'border-white/[0.04] bg-iron-900'
                    }`}
                  >
                    {supersetBadge ? (
                      <div className="mb-3">
                        <Badge tone={supersetBadge === 'Superset' ? 'sky' : 'mint'}>
                          {supersetBadge}
                          {exercise.superset_group ? ` ${exercise.superset_group}` : ''}
                        </Badge>
                      </div>
                    ) : null}

                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-4 text-left"
                      onClick={() =>
                        setExpandedExerciseId((current) => (current === exercise.id ? null : exercise.id))
                      }
                    >
                      <div className="flex min-w-0 gap-4">
                        <p className="w-10 shrink-0 text-[24px] font-black tracking-[-0.04em] text-zinc-700">
                          {String(exercise.display_order ?? index + 1).padStart(2, '0')}
                        </p>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge>{formatLabel(exercise.equipment)}</Badge>
                            {exercise.technique ? (
                              <Badge tone={isFinisher ? 'coral' : 'gold'}>
                                {getTechniqueLabel(exercise.technique)}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-2 text-[15px] font-semibold text-zinc-100">
                            {exercise.name}
                          </p>
                          {exercise.notes || exercise.instructions ? (
                            <p className="mt-2 font-mono text-[11px] leading-5 text-zinc-500">
                              {exercise.notes ?? exercise.instructions}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {exercise.rest_seconds ? (
                              <Badge tone="mint">Rest {exercise.rest_seconds}s</Badge>
                            ) : null}
                            {exercise.rpe ? <Badge tone="gold">RPE {exercise.rpe}</Badge> : null}
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[22px] font-bold tracking-[-0.05em] text-zinc-100">
                          {exercise.sets}×{exercise.reps_target}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                          {exercise.tempo ?? 'CTRL'}
                        </p>
                      </div>
                    </button>

                    {isExpanded && exercise.image_id ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {[0, 1].map((frame) => (
                          <img
                            key={`${exercise.image_id}-${frame}`}
                            src={imageUrlFor(exercise.image_id, frame)}
                            alt={`${exercise.name} demo ${frame + 1}`}
                            className="h-48 w-full rounded-2xl border border-white/[0.04] object-cover"
                            loading="lazy"
                          />
                        ))}
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}

export default TemplateDetailPage
