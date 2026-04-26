import { useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import BuilderExerciseCard from '../components/custom/BuilderExerciseCard.jsx'
import ExercisePicker from '../components/custom/ExercisePicker.jsx'
import { useInteractionContext } from '../hooks/useCommandRegistry.js'
import {
  FOCUS_OPTIONS,
  calculateTemplateTotals,
  createLocalId,
  formatLabel,
  getFocusColor,
  normalizeTemplateExerciseRecord,
} from '../lib/customWorkouts.js'
import {
  createTemplate,
  getTemplateById,
  updateTemplate,
} from '../services/templateService.js'

function WorkoutBuilderPage({ templateId = null, onCancel, onSaved }) {
  const isEditing = Boolean(templateId)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [focus, setFocus] = useState('')
  const [notes, setNotes] = useState('')
  const [exercises, setExercises] = useState([])
  const [expandedExerciseId, setExpandedExerciseId] = useState(null)

  const totals = useMemo(() => calculateTemplateTotals(exercises), [exercises])
  const footerActions = useMemo(
    () => [
      {
        action: () => setPickerOpen(true),
        displayShortcut: '⌘E',
        id: 'builder-add-exercise',
        label: 'Add Exercise',
        shortcut: 'Mod+E',
      },
      {
        action: onCancel,
        displayShortcut: 'Esc',
        id: 'builder-back',
        label: 'Back',
        shortcut: 'Escape',
      },
    ],
    [onCancel],
  )

  useInteractionContext(isEditing ? 'custom-builder-edit' : 'custom-builder', {
    breadcrumbSegments: ['IRON', 'My Workouts', isEditing ? 'Edit Workout' : 'Create Workout'],
    footerActions,
  })

  useEffect(() => {
    if (!isEditing) {
      return undefined
    }

    let cancelled = false

    async function loadTemplate() {
      setLoading(true)
      setError('')

      try {
        const template = await getTemplateById(templateId)

        if (!cancelled && template) {
          setName(template.name ?? '')
          setFocus(template.focus ?? '')
          setNotes(template.notes ?? '')
          setExercises(
            (template.exercises ?? []).map((exercise, index) => ({
              ...normalizeTemplateExerciseRecord(exercise, index),
              id: exercise.id ?? createLocalId('builder-exercise'),
            })),
          )
          setExpandedExerciseId(template.exercises?.[0]?.id ?? null)
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
  }, [isEditing, templateId])

  function updateExercise(exerciseId, field, value) {
    setExercises((currentExercises) =>
      currentExercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise
        }

        const nextExercise = {
          ...exercise,
          [field]:
            field === 'sets' || field === 'rest_seconds'
              ? value === ''
                ? ''
                : Number(value)
              : value,
        }

        if (field === 'technique' && value !== 'superset') {
          nextExercise.superset_group = ''
        }

        return nextExercise
      }),
    )
  }

  function moveExercise(exerciseId, direction) {
    setExercises((currentExercises) => {
      const currentIndex = currentExercises.findIndex((exercise) => exercise.id === exerciseId)

      if (currentIndex === -1) {
        return currentExercises
      }

      const targetIndex = currentIndex + direction

      if (targetIndex < 0 || targetIndex >= currentExercises.length) {
        return currentExercises
      }

      const nextExercises = [...currentExercises]
      const [movedExercise] = nextExercises.splice(currentIndex, 1)
      nextExercises.splice(targetIndex, 0, movedExercise)
      return nextExercises
    })
  }

  function handleAddExercise(exercise) {
    const builderExercise = {
      ...normalizeTemplateExerciseRecord(exercise, exercises.length),
      id: createLocalId('builder-exercise'),
      exercise_id: exercise.id,
      sets: 3,
      working_sets: 3,
      reps_target: '10-12',
      rep_notation: '10-12',
      tempo: 'CTRL',
      rest_seconds: 60,
      rpe: '8',
      technique: '',
      superset_group: '',
      notes: '',
    }

    setExercises((currentExercises) => [...currentExercises, builderExercise])
    setExpandedExerciseId(builderExercise.id)
  }

  async function handleSave() {
    setError('')

    const hasInvalidExercise = exercises.some(
      (exercise) => !Number(exercise.sets) || !`${exercise.reps_target ?? ''}`.trim(),
    )

    if (!name.trim()) {
      setError('Workout name is required.')
      return
    }

    if (!focus) {
      setError('Choose a focus before saving.')
      return
    }

    if (!exercises.length) {
      setError('Add at least one exercise before saving.')
      return
    }

    if (hasInvalidExercise) {
      setError('Each exercise needs sets and reps before saving.')
      return
    }

    setSaving(true)

    const payload = {
      name: name.trim(),
      focus,
      focus_color: getFocusColor(focus),
      notes: notes.trim() || null,
      exercises: exercises.map((exercise, index) => ({
        ...exercise,
        order_index: index,
      })),
    }

    const result = isEditing
      ? await updateTemplate(templateId, payload)
      : await createTemplate(payload)

    setSaving(false)

    if (!result.success) {
      setError(result.error ?? 'Failed to save template.')
      return
    }

    onSaved?.(result.data)
  }

  if (loading) {
    return (
      <section className="space-y-4 py-3">
        <div className="h-24 animate-pulse rounded-[26px] bg-iron-800/70" />
        <div className="h-72 animate-pulse rounded-[26px] bg-iron-800/70" />
      </section>
    )
  }

  return (
    <>
      <section className="space-y-6 py-3">
        <header className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-6">
          <p className="font-mono text-[12px] uppercase tracking-[0.32em] text-zinc-500">
            {isEditing ? 'Edit Workout' : 'Create Workout'}
          </p>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workout name..."
            className="mt-4 w-full border-b border-white/[0.06] bg-transparent pb-3 text-[28px] font-bold tracking-[-0.05em] text-zinc-50 outline-none placeholder:text-zinc-600"
          />

          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              Focus
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {FOCUS_OPTIONS.map((option) => {
                const isActive = focus === option

                return (
                  <button
                    key={option}
                    type="button"
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                      isActive
                        ? 'text-iron-900'
                        : 'bg-iron-800 text-zinc-400 hover:text-zinc-100'
                    }`}
                    style={isActive ? { backgroundColor: getFocusColor(option) } : undefined}
                    onClick={() => setFocus(option)}
                  >
                    {formatLabel(option)}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
              Notes
            </p>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Rules, reminders, notes..."
              className="mt-3 w-full rounded-lg border border-white/[0.04] bg-iron-900 px-4 py-3 font-mono text-[12px] text-zinc-100 outline-none transition focus:border-gold"
            />
          </div>
        </header>

        <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                Exercises
              </p>
              <p className="mt-2 text-[14px] text-zinc-400">
                {totals.totalSets} total sets loaded
              </p>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/30 px-4 py-2 text-[12px] font-semibold text-gold transition hover:bg-gold/10"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              <span>Add Exercise</span>
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {exercises.map((exercise, index) => (
              <BuilderExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={index}
                isExpanded={expandedExerciseId === exercise.id}
                onToggle={(exerciseId) =>
                  setExpandedExerciseId((current) => (current === exerciseId ? null : exerciseId))
                }
                onRemove={(exerciseId) =>
                  setExercises((currentExercises) =>
                    currentExercises.filter((item) => item.id !== exerciseId),
                  )
                }
                onMoveUp={(exerciseId) => moveExercise(exerciseId, -1)}
                onMoveDown={(exerciseId) => moveExercise(exerciseId, 1)}
                onChange={updateExercise}
              />
            ))}

            {!exercises.length ? (
              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-iron-900/60 px-4 py-6 text-center text-[13px] text-zinc-500">
                Add your first exercise to start building the template.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Summary
          </p>
          <p className="mt-3 text-[14px] text-zinc-300">
            Total sets: {totals.totalSets} · Est. duration: ~{totals.estimatedDuration} min
          </p>

          {error ? (
            <div className="mt-4 rounded-xl border border-coral/20 bg-coral/10 px-4 py-3 text-[13px] text-coral">
              {error}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              className="rounded-lg border border-white/[0.06] bg-iron-900 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-white/[0.12]"
              onClick={() => onCancel?.()}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded-lg bg-gold px-4 py-3 text-[12px] font-bold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </section>
      </section>

      <ExercisePicker
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handleAddExercise}
        excludeIds={exercises.map((exercise) => exercise.exercise_id)}
      />
    </>
  )
}

export default WorkoutBuilderPage
