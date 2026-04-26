import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import {
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  formatLabel,
} from '../../lib/customWorkouts.js'
import {
  createCustomExercise,
  getExercises,
  seedExercises,
} from '../../services/exerciseService.js'

function FilterPill({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
        active ? 'bg-gold text-iron-900' : 'bg-iron-800 text-zinc-400 hover:text-zinc-100'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ExercisePicker({ isOpen, onClose, onSelect, excludeIds = [] }) {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [muscleGroup, setMuscleGroup] = useState('all')
  const [equipment, setEquipment] = useState('all')
  const [exercises, setExercises] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    muscle_group: MUSCLE_GROUP_OPTIONS[0],
    equipment: EQUIPMENT_OPTIONS[0],
  })
  const excludedIds = useMemo(() => new Set(excludeIds), [excludeIds])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const timeoutId = window.setTimeout(() => {
      setSearch(searchInput.trim())
    }, 180)

    return () => window.clearTimeout(timeoutId)
  }, [isOpen, searchInput])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    async function loadExercises() {
      setLoading(true)
      setError('')

      await seedExercises()

      try {
        const rows = await getExercises({
          muscle_group: muscleGroup,
          equipment,
          search,
        })

        if (!cancelled) {
          setExercises(rows)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setExercises([])
          setError(loadError instanceof Error ? loadError.message : 'Failed to load exercises.')
          setLoading(false)
        }
      }
    }

    void loadExercises()

    return () => {
      cancelled = true
    }
  }, [equipment, isOpen, muscleGroup, search])

  if (!isOpen) {
    return null
  }

  async function handleCreateExercise() {
    setError('')

    const result = await createCustomExercise(createForm)

    if (!result.success) {
      setError(result.error ?? 'Failed to create exercise.')
      return
    }

    onSelect?.(result.data)
    setIsCreating(false)
    setCreateForm({
      name: '',
      muscle_group: MUSCLE_GROUP_OPTIONS[0],
      equipment: EQUIPMENT_OPTIONS[0],
    })
    onClose?.()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-iron-950/95 backdrop-blur-sm lg:items-center lg:justify-center">
      <div className="h-[92vh] w-full rounded-t-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(18,18,20,0.98),rgba(8,8,9,0.96))] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] lg:h-auto lg:max-h-[85vh] lg:max-w-4xl lg:rounded-[28px] lg:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-zinc-500">
              Pick Exercise
            </p>
            <p className="mt-2 text-[18px] font-bold text-zinc-100">
              Build from the shared exercise database
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-gold/30 px-3 py-2 text-[12px] font-semibold text-gold transition hover:bg-gold/10"
              onClick={() => setIsCreating((current) => !current)}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              <span>New</span>
            </button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-iron-900 text-zinc-400 transition hover:text-zinc-100"
              onClick={() => onClose?.()}
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        {isCreating ? (
          <div className="mt-5 rounded-2xl border border-white/[0.04] bg-iron-900/80 p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_auto]">
              <input
                type="text"
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Exercise name"
                className="rounded-lg border border-white/[0.06] bg-iron-950 px-3 py-2.5 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
              />
              <select
                value={createForm.muscle_group}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    muscle_group: event.target.value,
                  }))
                }
                className="rounded-lg border border-white/[0.06] bg-iron-950 px-3 py-2.5 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
              >
                {MUSCLE_GROUP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
              <select
                value={createForm.equipment}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    equipment: event.target.value,
                  }))
                }
                className="rounded-lg border border-white/[0.06] bg-iron-950 px-3 py-2.5 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
              >
                {EQUIPMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded-lg bg-gold px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light"
                onClick={handleCreateExercise}
              >
                Save
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-5 rounded-2xl border border-white/[0.04] bg-iron-900/70 px-4 py-3">
          <div className="flex items-center gap-3">
            <Search className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search exercises..."
              className="w-full bg-transparent font-mono text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
            />
          </div>
        </div>

        <div className="mt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Muscle Group
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <FilterPill active={muscleGroup === 'all'} onClick={() => setMuscleGroup('all')}>
              All
            </FilterPill>
            {MUSCLE_GROUP_OPTIONS.map((option) => (
              <FilterPill
                key={option}
                active={muscleGroup === option}
                onClick={() => setMuscleGroup(option)}
              >
                {formatLabel(option)}
              </FilterPill>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            Equipment
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <FilterPill active={equipment === 'all'} onClick={() => setEquipment('all')}>
              All
            </FilterPill>
            {EQUIPMENT_OPTIONS.map((option) => (
              <FilterPill
                key={option}
                active={equipment === option}
                onClick={() => setEquipment(option)}
              >
                {formatLabel(option)}
              </FilterPill>
            ))}
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-coral/20 bg-coral/10 px-4 py-3 text-[13px] text-coral">
            {error}
          </div>
        ) : null}

        <div className="mt-5 h-[calc(100%-17rem)] overflow-y-auto rounded-2xl border border-white/[0.04] bg-iron-950/70">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-iron-800" />
              ))}
            </div>
          ) : exercises.length ? (
            <div className="divide-y divide-white/[0.04]">
              {exercises.map((exercise) => {
                const isExcluded = excludedIds.has(exercise.id)

                return (
                  <button
                    key={exercise.id}
                    type="button"
                    disabled={isExcluded}
                    className={`flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition ${
                      isExcluded
                        ? 'cursor-not-allowed opacity-30'
                        : 'hover:bg-iron-900/80'
                    }`}
                    onClick={() => {
                      onSelect?.(exercise)
                      onClose?.()
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium text-zinc-100">
                        {exercise.name}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        {formatLabel(exercise.muscle_group)} · {formatLabel(exercise.equipment)} ·{' '}
                        {formatLabel(exercise.movement_type)}
                      </p>
                    </div>

                    {isExcluded ? (
                      <span className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        Added
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[13px] text-zinc-500">
              No exercises matched those filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ExercisePicker
