import { useEffect, useState } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'

const DAY_TYPE_OPTIONS = [
  'push',
  'pull',
  'legs',
  'upper',
  'lower',
  'full_body',
  'other',
]

const EQUIPMENT_OPTIONS = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'bodyweight',
  'other',
]

const MUSCLE_OPTIONS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'full_body',
  'other',
]

function cloneProgramData(data) {
  return JSON.parse(JSON.stringify(data))
}

function normalizeExercise(exercise = {}, index = 0) {
  return {
    display_order: exercise.display_order ?? index + 1,
    name: exercise.name ?? '',
    warmup_sets: exercise.warmup_sets ?? 0,
    working_sets: exercise.working_sets ?? '',
    rep_notation: exercise.rep_notation ?? '',
    rpe_notation: exercise.rpe_notation ?? '',
    rest_notation: exercise.rest_notation ?? '',
    substitution_1: exercise.substitution_1 ?? '',
    substitution_2: exercise.substitution_2 ?? '',
    coaching_cue: exercise.coaching_cue ?? '',
    group_id: exercise.group_id ?? '',
    group_order: exercise.group_order ?? index + 1,
    equipment: exercise.equipment ?? 'other',
    muscle: exercise.muscle ?? 'other',
  }
}

function normalizeDay(day = {}, index = 0) {
  return {
    day_number: day.day_number ?? index + 1,
    name: day.name ?? '',
    day_type: day.day_type ?? 'other',
    rest_note: day.rest_note ?? '',
    exercises: Array.isArray(day.exercises)
      ? day.exercises.map((exercise, exerciseIndex) =>
          normalizeExercise(exercise, exerciseIndex),
        )
      : [],
  }
}

function normalizePhase(phase = {}, index = 0) {
  return {
    phase_number: phase.phase_number ?? index + 1,
    name: phase.name ?? '',
    description: phase.description ?? '',
    num_weeks: phase.num_weeks ?? 1,
    days: Array.isArray(phase.days)
      ? phase.days.map((day, dayIndex) => normalizeDay(day, dayIndex))
      : [],
  }
}

function normalizeProgramData(data) {
  return {
    program_name: data?.program_name ?? '',
    author: data?.author ?? '',
    phases: Array.isArray(data?.phases)
      ? data.phases.map((phase, phaseIndex) => normalizePhase(phase, phaseIndex))
      : [],
  }
}

function isBlank(value) {
  return String(value ?? '').trim() === ''
}

function hasValidationErrors(program) {
  return program.phases.some((phase) =>
    phase.days.some((day) =>
      day.exercises.some(
        (exercise) =>
          isBlank(exercise.name) ||
          isBlank(exercise.working_sets) ||
          isBlank(exercise.rep_notation),
      ),
    ),
  )
}

function createExerciseInputClass(isInvalid, extraClassName = '') {
  return [
    'bg-iron-900 border rounded-lg px-3 py-2 text-[13px] text-zinc-100 focus:border-gold focus:outline-none',
    isInvalid ? 'border-coral' : 'border-iron-600',
    extraClassName,
  ]
    .filter(Boolean)
    .join(' ')
}

function createEmptyExercise(nextDisplayOrder) {
  return normalizeExercise(
    {
      display_order: nextDisplayOrder,
      warmup_sets: 0,
      working_sets: 3,
      rep_notation: '',
      rpe_notation: '',
      rest_notation: '',
      substitution_1: '',
      substitution_2: '',
      coaching_cue: '',
      group_id: '',
      group_order: nextDisplayOrder,
      equipment: 'other',
      muscle: 'other',
    },
    nextDisplayOrder - 1,
  )
}

function ImportPreviewPage({ extractedData, onConfirm, onCancel }) {
  const [editedData, setEditedData] = useState(() => normalizeProgramData(extractedData))
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setEditedData(normalizeProgramData(cloneProgramData(extractedData ?? {})))
    setSubmitError('')
    setIsSubmitting(false)
  }, [extractedData])

  if (!extractedData) {
    return null
  }

  function updateProgramField(field, value) {
    setEditedData((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function updatePhaseField(phaseIndex, field, value) {
    setEditedData((current) => ({
      ...current,
      phases: current.phases.map((phase, index) =>
        index === phaseIndex ? { ...phase, [field]: value } : phase,
      ),
    }))
  }

  function updateDayField(phaseIndex, dayIndex, field, value) {
    setEditedData((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) {
          return phase
        }

        return {
          ...phase,
          days: phase.days.map((day, currentDayIndex) =>
            currentDayIndex === dayIndex ? { ...day, [field]: value } : day,
          ),
        }
      }),
    }))
  }

  function updateExerciseField(phaseIndex, dayIndex, exerciseIndex, field, value) {
    setEditedData((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) {
          return phase
        }

        return {
          ...phase,
          days: phase.days.map((day, currentDayIndex) => {
            if (currentDayIndex !== dayIndex) {
              return day
            }

            return {
              ...day,
              exercises: day.exercises.map((exercise, currentExerciseIndex) =>
                currentExerciseIndex === exerciseIndex
                  ? { ...exercise, [field]: value }
                  : exercise,
              ),
            }
          }),
        }
      }),
    }))
  }

  function deleteExercise(phaseIndex, dayIndex, exerciseIndex) {
    setEditedData((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) {
          return phase
        }

        return {
          ...phase,
          days: phase.days.map((day, currentDayIndex) => {
            if (currentDayIndex !== dayIndex) {
              return day
            }

            const exercises = day.exercises
              .filter((_, currentExerciseIndex) => currentExerciseIndex !== exerciseIndex)
              .map((exercise, nextIndex) => ({
                ...exercise,
                display_order: nextIndex + 1,
              }))

            return {
              ...day,
              exercises,
            }
          }),
        }
      }),
    }))
  }

  function addExercise(phaseIndex, dayIndex) {
    setEditedData((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) {
          return phase
        }

        return {
          ...phase,
          days: phase.days.map((day, currentDayIndex) => {
            if (currentDayIndex !== dayIndex) {
              return day
            }

            const nextDisplayOrder = day.exercises.length + 1

            return {
              ...day,
              exercises: [...day.exercises, createEmptyExercise(nextDisplayOrder)],
            }
          }),
        }
      }),
    }))
  }

  async function handleSave() {
    setSubmitError('')

    if (hasValidationErrors(editedData)) {
      setSubmitError('Please fill in all required exercise fields before saving.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await onConfirm?.(cloneProgramData(editedData))

      if (result?.error) {
        setSubmitError(result.error)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="space-y-6 rounded-[2rem] bg-iron-900">
      <div className="rounded-2xl border border-white/[0.04] bg-iron-800 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-gold-light">
          Review Import
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">
          Clean up the extracted structure before saving it.
        </h2>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <input
            type="text"
            value={editedData.program_name}
            placeholder="Program name"
            className={createExerciseInputClass(false)}
            onChange={(event) => updateProgramField('program_name', event.target.value)}
          />
          <input
            type="text"
            value={editedData.author ?? ''}
            placeholder="Author"
            className={createExerciseInputClass(false)}
            onChange={(event) => updateProgramField('author', event.target.value)}
          />
        </div>
      </div>

      {editedData.phases.map((phase, phaseIndex) => (
        <details
          key={`phase-${phase.phase_number}-${phaseIndex}`}
          open
          className="rounded-2xl border border-white/[0.04] bg-iron-800"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-500">
                Phase {phase.phase_number}
              </p>
              <p className="mt-2 text-lg font-semibold text-white">{phase.name || 'Untitled Phase'}</p>
            </div>
            <ChevronDown className="h-5 w-5 text-zinc-500" />
          </summary>

          <div className="space-y-5 border-t border-white/[0.04] px-6 py-6">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_1.2fr_0.4fr]">
              <input
                type="text"
                value={phase.name}
                placeholder="Phase name"
                className={createExerciseInputClass(false)}
                onChange={(event) =>
                  updatePhaseField(phaseIndex, 'name', event.target.value)
                }
              />
              <textarea
                rows={2}
                value={phase.description ?? ''}
                placeholder="Phase description"
                className={createExerciseInputClass(false, 'resize-y')}
                onChange={(event) =>
                  updatePhaseField(phaseIndex, 'description', event.target.value)
                }
              />
              <input
                type="number"
                min="1"
                value={phase.num_weeks}
                placeholder="Weeks"
                className={createExerciseInputClass(false)}
                onChange={(event) =>
                  updatePhaseField(
                    phaseIndex,
                    'num_weeks',
                    event.target.value === '' ? '' : Number(event.target.value),
                  )
                }
              />
            </div>

            <div className="space-y-4">
              {phase.days.map((day, dayIndex) => (
                <details
                  key={`phase-${phaseIndex}-day-${day.day_number}-${dayIndex}`}
                  open
                  className="rounded-2xl border border-white/[0.04] bg-iron-900/70"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-500">
                        Day {day.day_number}
                      </p>
                      <p className="mt-1 text-base font-semibold text-white">
                        {day.name || 'Untitled Day'}
                      </p>
                    </div>
                    <ChevronDown className="h-5 w-5 text-zinc-500" />
                  </summary>

                  <div className="space-y-5 border-t border-white/[0.04] px-5 py-5">
                    <div className="grid gap-4 md:grid-cols-[1fr_0.45fr]">
                      <input
                        type="text"
                        value={day.name}
                        placeholder="Day name"
                        className={createExerciseInputClass(false)}
                        onChange={(event) =>
                          updateDayField(phaseIndex, dayIndex, 'name', event.target.value)
                        }
                      />
                      <select
                        value={day.day_type ?? 'other'}
                        className={createExerciseInputClass(false)}
                        onChange={(event) =>
                          updateDayField(phaseIndex, dayIndex, 'day_type', event.target.value)
                        }
                      >
                        {DAY_TYPE_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="overflow-x-auto">
                      <div className="min-w-[1280px] space-y-3">
                        <div className="grid grid-cols-[1.4fr_0.55fr_0.55fr_0.8fr_0.8fr_0.8fr_1fr_1fr_0.65fr_0.8fr_0.8fr_auto] gap-3 px-1 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                          <span>Name</span>
                          <span>Warmups</span>
                          <span>Working</span>
                          <span>Reps</span>
                          <span>RPE</span>
                          <span>Rest</span>
                          <span>Sub 1</span>
                          <span>Sub 2</span>
                          <span>Group</span>
                          <span>Equipment</span>
                          <span>Muscle</span>
                          <span />
                        </div>

                        {day.exercises.map((exercise, exerciseIndex) => {
                          const nameInvalid = isBlank(exercise.name)
                          const workingSetsInvalid = isBlank(exercise.working_sets)
                          const repNotationInvalid = isBlank(exercise.rep_notation)

                          return (
                            <div
                              key={`exercise-${exercise.display_order}-${exerciseIndex}`}
                              className="rounded-xl border border-white/[0.04] bg-iron-800/70 p-3"
                            >
                              <div className="grid grid-cols-[1.4fr_0.55fr_0.55fr_0.8fr_0.8fr_0.8fr_1fr_1fr_0.65fr_0.8fr_0.8fr_auto] gap-3">
                                <input
                                  type="text"
                                  value={exercise.name}
                                  className={createExerciseInputClass(nameInvalid)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'name',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={exercise.warmup_sets}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'warmup_sets',
                                      event.target.value === ''
                                        ? ''
                                        : Number(event.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={exercise.working_sets}
                                  className={createExerciseInputClass(workingSetsInvalid)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'working_sets',
                                      event.target.value === ''
                                        ? ''
                                        : Number(event.target.value),
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.rep_notation}
                                  className={createExerciseInputClass(repNotationInvalid)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'rep_notation',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.rpe_notation ?? ''}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'rpe_notation',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.rest_notation ?? ''}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'rest_notation',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.substitution_1 ?? ''}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'substitution_1',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.substitution_2 ?? ''}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'substitution_2',
                                      event.target.value,
                                    )
                                  }
                                />
                                <input
                                  type="text"
                                  value={exercise.group_id ?? ''}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'group_id',
                                      event.target.value,
                                    )
                                  }
                                />
                                <select
                                  value={exercise.equipment ?? 'other'}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'equipment',
                                      event.target.value,
                                    )
                                  }
                                >
                                  {EQUIPMENT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={exercise.muscle ?? 'other'}
                                  className={createExerciseInputClass(false)}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'muscle',
                                      event.target.value,
                                    )
                                  }
                                >
                                  {MUSCLE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-coral/20 bg-coral/10 text-coral transition hover:border-coral/40 hover:bg-coral/15"
                                  onClick={() =>
                                    deleteExercise(phaseIndex, dayIndex, exerciseIndex)
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>

                              <details className="mt-3 rounded-lg border border-white/[0.04] bg-iron-900/70 px-3 py-2">
                                <summary className="cursor-pointer list-none font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                  Coaching cue
                                </summary>
                                <textarea
                                  rows={3}
                                  value={exercise.coaching_cue ?? ''}
                                  className={createExerciseInputClass(false, 'mt-3 w-full resize-y')}
                                  onChange={(event) =>
                                    updateExerciseField(
                                      phaseIndex,
                                      dayIndex,
                                      exerciseIndex,
                                      'coaching_cue',
                                      event.target.value,
                                    )
                                  }
                                />
                              </details>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-4 py-2 text-[13px] font-semibold text-gold-light transition hover:border-gold/40 hover:bg-gold/15"
                      onClick={() => addExercise(phaseIndex, dayIndex)}
                    >
                      <Plus className="h-4 w-4" />
                      Add Exercise
                    </button>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </details>
      ))}

      {submitError ? (
        <div className="rounded-2xl border border-coral/20 bg-coral/10 px-4 py-3 text-[13px] text-coral">
          {submitError}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="rounded-xl bg-iron-800 px-5 py-3 text-sm font-semibold text-zinc-400 transition hover:bg-iron-700 hover:text-zinc-200"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded-xl bg-gold px-5 py-3 text-sm font-extrabold text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void handleSave()}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving Program...' : 'Save Program'}
        </button>
      </div>
    </section>
  )
}

export default ImportPreviewPage
