import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Search, Upload, X } from 'lucide-react'
import { getPrDisplayLabel } from '../lib/calculations.js'
import {
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  formatLabel,
  normalizeExerciseRecord,
} from '../lib/customWorkouts.js'
import { clearExerciseDetailsCache, useExerciseDetails } from '../hooks/useExerciseDetails.js'
import {
  createCustomExercise,
  getExercises,
  importExercisesFromJsonText,
  seedExercises,
} from '../services/exerciseService.js'

function formatShortDate(value) {
  if (!value) {
    return ''
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function getBestPr(records = []) {
  if (!records.length) {
    return 'No PR yet'
  }

  const heaviestWeight = records.find((record) => record.pr_type === 'heaviest_weight')

  if (heaviestWeight?.weight) {
    return `${heaviestWeight.weight}kg`
  }

  const recentRecord = records[0]

  if (recentRecord?.weight && recentRecord?.reps) {
    return `${recentRecord.weight}kg × ${recentRecord.reps}`
  }

  if (recentRecord?.pr_type === 'session_volume') {
    return `${Math.round(Number(recentRecord?.value) || 0)}kg volume`
  }

  return `${recentRecord?.value ?? '--'}`
}

function getExerciseKey(exercise = {}) {
  return exercise.slug || `${exercise.name ?? ''}`.trim().toLowerCase() || exercise.id
}

function mergeExerciseCatalogs(...collections) {
  const catalog = new Map()

  collections.flat().forEach((row) => {
    const exercise = normalizeExerciseRecord(row)
    const key = getExerciseKey(exercise)

    if (!key) {
      return
    }

    const currentExercise = catalog.get(key)

    if (!currentExercise) {
      catalog.set(key, exercise)
      return
    }

    catalog.set(
      key,
      normalizeExerciseRecord({
        ...exercise,
        ...currentExercise,
        id: currentExercise.id ?? exercise.id,
        name: currentExercise.name ?? exercise.name,
        slug: currentExercise.slug ?? exercise.slug,
        video_url: currentExercise.video_url ?? exercise.video_url,
        instructions: currentExercise.instructions ?? exercise.instructions,
        movement_type: currentExercise.movement_type ?? exercise.movement_type,
        force: currentExercise.force ?? exercise.force,
        mechanic: currentExercise.mechanic ?? exercise.mechanic,
        image_id: currentExercise.image_id ?? exercise.image_id,
        secondary_muscles:
          currentExercise.secondary_muscles?.length
            ? currentExercise.secondary_muscles
            : exercise.secondary_muscles,
      }),
    )
  })

  return Array.from(catalog.values()).sort((left, right) => left.name.localeCompare(right.name))
}

async function fetchLibraryCatalog() {
  let catalog = await getExercises()

  if (!catalog.length) {
    await seedExercises()
    catalog = await getExercises()
  }

  return {
    exercises: mergeExerciseCatalogs(catalog),
  }
}

function LibraryMetric({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function ExerciseLibraryCard({
  exercise,
  isExpanded,
  onToggle,
}) {
  const {
    history,
    personalRecords,
    note,
    timesPerformed,
    loading,
    error,
  } = useExerciseDetails(exercise.id, isExpanded)

  return (
    <article className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
      <button
        type="button"
        className="w-full text-left"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-zinc-100">
              {exercise.name}
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/[0.04] bg-iron-950/70 px-2.5 py-1 text-[11px] text-zinc-400">
                {formatLabel(exercise.muscle_group ?? 'full_body')}
              </span>
              <span className="rounded-full border border-white/[0.04] bg-iron-950/70 px-2.5 py-1 text-[11px] text-zinc-400">
                {formatLabel(exercise.equipment ?? 'bodyweight')}
              </span>
            </div>
          </div>

          <div className="text-right text-[12px] text-zinc-500">
            <p>{isExpanded ? `${timesPerformed} sessions` : 'Tap for history'}</p>
            <p className="mt-1">{isExpanded ? getBestPr(personalRecords) : 'Details on demand'}</p>
          </div>
        </div>
      </button>

      {isExpanded ? (
        <div className="mt-5 space-y-2.5 border-t border-white/[0.04] pt-4">
          {loading ? (
            <div className="rounded-[22px] bg-iron-950/60 px-4 py-4 text-[13px] text-zinc-500">
              Loading exercise details…
            </div>
          ) : null}

          {!loading && error ? (
            <div className="rounded-[22px] border border-red-500/20 bg-red-500/[0.06] px-4 py-4 text-[13px] text-zinc-300">
              {error}
            </div>
          ) : null}

          {!loading && note ? (
            <div className="rounded-[22px] border border-gold/15 bg-gold/[0.06] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-gold">
                Saved Note
              </p>
              <p className="mt-2 text-[13px] leading-6 text-zinc-300">
                {note}
              </p>
            </div>
          ) : null}

          {!loading && personalRecords.length ? (
            <div className="rounded-[22px] bg-iron-950/60 px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">
                PR Breakdown
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {personalRecords.slice(0, 4).map((record) => (
                  <span
                    key={record.id}
                    className="rounded-full border border-white/[0.04] bg-iron-900 px-2.5 py-1 text-[11px] text-zinc-300"
                  >
                    {getPrDisplayLabel(record.pr_type)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {!loading && history.length ? (
            history.slice(0, 8).map((set) => (
              <div
                key={set.id}
                className="flex items-center justify-between rounded-[22px] bg-iron-950/60 px-3.5 py-3 text-[12px]"
              >
                <div>
                  <p className="font-medium text-zinc-200">
                    {formatShortDate(set.workout_sessions?.date)}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    {set.weight ?? '--'}kg × {set.reps ?? '--'}
                  </p>
                </div>
                <p className="font-mono text-zinc-500">
                  Set {set.set_number ?? '--'}
                </p>
              </div>
            ))
          ) : null}

          {!loading && !history.length ? (
            <div className="rounded-[22px] bg-iron-950/60 px-4 py-3 text-[13px] text-zinc-500">
              No session history yet.
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

function ExercisesPage() {
  const fileInputRef = useRef(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeMuscle, setActiveMuscle] = useState('all')
  const [expandedExerciseId, setExpandedExerciseId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exercises, setExercises] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [createError, setCreateError] = useState('')
  const [createForm, setCreateForm] = useState({
    name: '',
    muscle_group: '',
    equipment: '',
    video_url: '',
  })

  useEffect(() => {
    let isCancelled = false

    async function loadLibrary() {
      setLoading(true)

      try {
        const nextData = await fetchLibraryCatalog()

        if (!isCancelled) {
          setExercises(nextData.exercises)
          setLoading(false)
        }
      } catch {
        if (!isCancelled) {
          setExercises([])
          setLoading(false)
        }
      }
    }

    void loadLibrary()

    return () => {
      isCancelled = true
    }
  }, [])

  const muscleGroups = useMemo(
    () => [
      'all',
      ...Array.from(new Set(exercises.map((exercise) => exercise.muscle_group).filter(Boolean))),
    ],
    [exercises],
  )

  const filteredExercises = useMemo(
    () =>
      exercises.filter((exercise) => {
        const matchesSearch =
          !searchQuery ||
          exercise.name.toLowerCase().includes(searchQuery.toLowerCase())
        const matchesMuscle = activeMuscle === 'all' || exercise.muscle_group === activeMuscle

        return matchesSearch && matchesMuscle
      }),
    [activeMuscle, exercises, searchQuery],
  )

  async function refreshLibraryState() {
    clearExerciseDetailsCache()
    const nextData = await fetchLibraryCatalog()
    setExercises(nextData.exercises)
  }

  async function handleCreateExercise() {
    if (!createForm.name.trim()) {
      setCreateError('Exercise name is required.')
      return
    }

    setCreateError('')

    const result = await createCustomExercise(createForm)

    if (!result.success) {
      setCreateError(result.error ?? 'Unable to save exercise.')
      return
    }

    await refreshLibraryState()
    setCreateForm({
      name: '',
      muscle_group: '',
      equipment: '',
      video_url: '',
    })
    setIsModalOpen(false)
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsImporting(true)
    setImportResult(null)

    try {
      const fileContents = await file.text()
      const result = await importExercisesFromJsonText(fileContents)

      if (!result.success) {
        setImportResult({
          success: false,
          fileName: file.name,
          error: result.error ?? 'Import failed.',
        })
        return
      }

      await refreshLibraryState()
      setImportResult({
        success: true,
        fileName: file.name,
        ...result.data,
      })
    } catch {
      setImportResult({
        success: false,
        fileName: file.name,
        error: 'Unable to read the selected file.',
      })
    } finally {
      event.target.value = ''
      setIsImporting(false)
    }
  }

  return (
    <>
      <section className="space-y-6 py-2 lg:py-1">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              Library
            </p>
            <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
              Browse the movement catalog like a control index.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Search by name, filter by muscle group, and crack open any lift to see its recent
              working history and best logged output.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              className="inline-flex items-center gap-2 self-start rounded-2xl border border-white/[0.06] bg-iron-900 px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.2em] text-zinc-200 transition hover:border-gold/30 hover:text-gold disabled:cursor-wait disabled:opacity-70 xl:self-auto"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="h-4 w-4" strokeWidth={2} />
              {isImporting ? 'Importing...' : 'Import JSON'}
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 self-start rounded-2xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.2em] text-iron-900 transition hover:bg-gold-light xl:self-auto"
              onClick={() => {
                setCreateError('')
                setIsModalOpen(true)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Create Exercise
            </button>
          </div>
        </header>

        {importResult ? (
          <section
            className={`rounded-[28px] border px-5 py-5 ${
              importResult.success
                ? 'border-gold/20 bg-gold/[0.06]'
                : 'border-red-500/20 bg-red-500/[0.06]'
            }`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p
                  className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
                    importResult.success ? 'text-gold' : 'text-red-300'
                  }`}
                >
                  {importResult.success ? 'Import Complete' : 'Import Failed'}
                </p>
                <h2 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-zinc-100">
                  {importResult.fileName}
                </h2>
                <p className="mt-2 max-w-3xl text-[13px] leading-6 text-zinc-400">
                  {importResult.success
                    ? `Added ${importResult.insertedCount} exercises. Skipped ${importResult.duplicateCount} duplicates and ${importResult.invalidCount} invalid rows.`
                    : importResult.error}
                </p>
                {importResult.source ? (
                  <p className="mt-2 text-[12px] text-zinc-500">Source: {importResult.source}</p>
                ) : null}
              </div>

              {importResult.success ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <LibraryMetric
                    label="Inserted"
                    value={importResult.insertedCount}
                    hint="New exercises added"
                  />
                  <LibraryMetric
                    label="Duplicates"
                    value={importResult.duplicateCount}
                    hint="Skipped safely"
                  />
                  <LibraryMetric
                    label="Invalid"
                    value={importResult.invalidCount}
                    hint="Need cleanup"
                  />
                </div>
              ) : null}
            </div>

            {importResult.success &&
            (importResult.duplicateRows?.length || importResult.invalidRows?.length) ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {importResult.duplicateRows?.length ? (
                  <div className="rounded-[22px] bg-iron-950/55 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      Duplicate Rows
                    </p>
                    <div className="mt-3 space-y-2">
                      {importResult.duplicateRows.slice(0, 5).map((row) => (
                        <div
                          key={`${row.rowNumber}-${row.slug}`}
                          className="text-[12px] text-zinc-300"
                        >
                          Row {row.rowNumber}: {row.name} · {row.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {importResult.invalidRows?.length ? (
                  <div className="rounded-[22px] bg-iron-950/55 px-4 py-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      Invalid Rows
                    </p>
                    <div className="mt-3 space-y-2">
                      {importResult.invalidRows.slice(0, 5).map((row) => (
                        <div
                          key={`${row.rowNumber}-${row.name ?? 'invalid'}`}
                          className="text-[12px] text-zinc-300"
                        >
                          Row {row.rowNumber}: {row.name ?? 'Unnamed exercise'} · {row.error}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <LibraryMetric
            label="Catalog Size"
            value={exercises.length}
            hint="Total exercises available"
          />
          <LibraryMetric
            label="With Demo"
            value={exercises.filter((exercise) => Boolean(exercise.video_url)).length}
            hint="Video-linked movements"
          />
          <LibraryMetric
            label="Filtered View"
            value={filteredExercises.length}
            hint={activeMuscle === 'all' ? 'All muscle groups' : formatLabel(activeMuscle)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Filter Rail
              </p>

              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-600" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search exercises"
                  className="w-full rounded-2xl border border-iron-600 bg-iron-900 py-3 pl-10 pr-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {muscleGroups.map((muscleGroup) => {
                  const isActive = activeMuscle === muscleGroup

                  return (
                    <button
                      key={muscleGroup}
                      type="button"
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-[12px] transition ${
                        isActive
                          ? 'border-gold/30 bg-gold/15 text-gold'
                          : 'border-white/[0.04] bg-iron-950/70 text-zinc-500'
                      }`}
                      onClick={() => setActiveMuscle(muscleGroup)}
                    >
                      {formatLabel(muscleGroup)}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                Catalog Notes
              </p>
              <p className="mt-4 text-[13px] leading-6 text-zinc-500">
                Imported exercises land in the shared library, so they become available in the
                custom workout builder without any extra setup.
              </p>
            </section>
          </aside>

          {loading ? (
            <div className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-5">
              <div className="h-24 animate-pulse rounded-2xl bg-iron-900/60" />
            </div>
          ) : !exercises.length ? (
            <div className="rounded-[28px] border border-white/[0.04] bg-iron-800 p-6 text-[13px] text-zinc-500">
              Your library is empty. Create an exercise or import a JSON file to populate it.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {filteredExercises.map((exercise) => {
                return (
                  <ExerciseLibraryCard
                    key={exercise.id}
                    exercise={exercise}
                    isExpanded={expandedExerciseId === exercise.id}
                    onToggle={() =>
                      setExpandedExerciseId((current) =>
                        current === exercise.id ? null : exercise.id,
                      )
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 bg-iron-900/90 px-4 py-8 backdrop-blur-sm">
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/[0.04] bg-iron-800 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-bold text-zinc-100">Create Exercise</h2>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.04] bg-iron-900 text-zinc-500 transition hover:text-zinc-100"
                onClick={() => setIsModalOpen(false)}
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Exercise name"
                className="w-full rounded-xl border border-iron-600 bg-iron-900 px-3 py-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
              />
              <select
                value={createForm.muscle_group}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    muscle_group: event.target.value,
                  }))
                }
                className="w-full rounded-xl border border-iron-600 bg-iron-900 px-3 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
              >
                <option value="">Primary muscle group</option>
                {MUSCLE_GROUP_OPTIONS.map((muscleGroup) => (
                  <option key={muscleGroup} value={muscleGroup}>
                    {formatLabel(muscleGroup)}
                  </option>
                ))}
              </select>
              <select
                value={createForm.equipment}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, equipment: event.target.value }))
                }
                className="w-full rounded-xl border border-iron-600 bg-iron-900 px-3 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold"
              >
                <option value="">Equipment</option>
                {EQUIPMENT_OPTIONS.map((equipment) => (
                  <option key={equipment} value={equipment}>
                    {formatLabel(equipment)}
                  </option>
                ))}
              </select>
              <input
                value={createForm.video_url}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, video_url: event.target.value }))
                }
                placeholder="Video URL"
                className="w-full rounded-xl border border-iron-600 bg-iron-900 px-3 py-3 text-[13px] text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-gold"
              />
            </div>

            {createError ? (
              <p className="mt-4 text-[12px] text-red-300">{createError}</p>
            ) : null}

            <button
              type="button"
              className="mt-5 w-full rounded-xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition hover:bg-gold-light"
              onClick={handleCreateExercise}
            >
              Save Exercise
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default ExercisesPage
