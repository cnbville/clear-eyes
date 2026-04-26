import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react'
import {
  SUPERSET_GROUP_OPTIONS,
  TECHNIQUE_OPTIONS,
  formatLabel,
} from '../../lib/customWorkouts.js'

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  )
}

function inputClassName(extraClassName = '') {
  return `w-full rounded-md border border-white/[0.06] bg-iron-900 px-3 py-2.5 font-mono text-[12px] text-zinc-100 outline-none transition focus:border-gold ${extraClassName}`
}

function BuilderExerciseCard({
  exercise,
  index,
  isExpanded,
  onToggle,
  onRemove,
  onMoveUp,
  onMoveDown,
  onChange,
}) {
  return (
    <article className="rounded-2xl border border-white/[0.04] bg-[linear-gradient(180deg,rgba(18,18,20,0.96),rgba(12,12,13,0.95))] p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onToggle?.(exercise.id)}
        >
          <GripVertical className="h-4 w-4 shrink-0 text-zinc-600" strokeWidth={1.8} />
          <span className="font-mono text-[12px] uppercase tracking-[0.18em] text-zinc-500">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-zinc-100">{exercise.name}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {formatLabel(exercise.muscle_group)} · {formatLabel(exercise.equipment)}
            </p>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.05] bg-iron-900 text-zinc-400 transition hover:text-zinc-100"
            onClick={() => onMoveUp?.(exercise.id)}
            aria-label="Move exercise up"
          >
            <ChevronUp className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.05] bg-iron-900 text-zinc-400 transition hover:text-zinc-100"
            onClick={() => onMoveDown?.(exercise.id)}
            aria-label="Move exercise down"
          >
            <ChevronDown className="h-4 w-4" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-coral/20 bg-coral/10 text-coral transition hover:bg-coral/20"
            onClick={() => onRemove?.(exercise.id)}
            aria-label="Remove exercise"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Sets">
              <input
                type="number"
                min="1"
                max="10"
                value={exercise.sets ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'sets', event.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Reps">
              <input
                type="text"
                value={exercise.reps_target ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'reps_target', event.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="Tempo">
              <input
                type="text"
                value={exercise.tempo ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'tempo', event.target.value)}
                className={inputClassName()}
                placeholder="3-1-2"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Rest (sec)">
              <input
                type="number"
                min="0"
                value={exercise.rest_seconds ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'rest_seconds', event.target.value)}
                className={inputClassName()}
              />
            </Field>
            <Field label="RPE">
              <input
                type="text"
                value={exercise.rpe ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'rpe', event.target.value)}
                className={inputClassName()}
                placeholder="8"
              />
            </Field>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Technique">
              <select
                value={exercise.technique ?? ''}
                onChange={(event) => onChange?.(exercise.id, 'technique', event.target.value)}
                className={inputClassName()}
              >
                {TECHNIQUE_OPTIONS.map((option) => (
                  <option key={option.value || 'none'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            {exercise.technique === 'superset' ? (
              <Field label="Superset Group">
                <select
                  value={exercise.superset_group ?? ''}
                  onChange={(event) =>
                    onChange?.(exercise.id, 'superset_group', event.target.value)
                  }
                  className={inputClassName()}
                >
                  <option value="">Select group</option>
                  {SUPERSET_GROUP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div />
            )}
          </div>

          <Field label="Notes">
            <input
              type="text"
              value={exercise.notes ?? ''}
              onChange={(event) => onChange?.(exercise.id, 'notes', event.target.value)}
              className={inputClassName()}
              placeholder="Coaching cue or reminder"
            />
          </Field>
        </div>
      ) : null}
    </article>
  )
}

export default BuilderExerciseCard
