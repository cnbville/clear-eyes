import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileJson,
  Loader2,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react'
import {
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUP_OPTIONS,
  formatLabel,
  slugify,
} from '../../lib/customWorkouts.js'
import {
  createCustomExercise,
  getExercises,
  seedExercises,
} from '../../services/exerciseService.js'
import {
  QUICK_TEMPLATE_IMPORT_EXAMPLE,
  analyzeQuickTemplateImport,
  buildTemplatePayloadFromImportWorkout,
  searchExerciseLibrary,
} from '../../services/templateImportService.js'
import { createTemplate } from '../../services/templateService.js'

function MetricCard({ label, value, hint }) {
  return (
    <div className="rounded-[20px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[24px] font-bold tracking-[-0.05em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function buildInitialResolutionState(unresolvedExercises = []) {
  return unresolvedExercises.reduce((state, item) => {
    state[item.key] = {
      mode: '',
      selectedExerciseId: '',
      searchQuery: item.name,
      createName: item.name,
      muscle_group: item.muscle_group || MUSCLE_GROUP_OPTIONS[0],
      equipment: item.equipment || EQUIPMENT_OPTIONS[0],
    }
    return state
  }, {})
}

function countResolvedExercises(unresolvedExercises = [], resolutionState = {}, catalogById = new Map()) {
  return unresolvedExercises.reduce((count, item) => {
    const resolution = resolutionState[item.key]

    if (!resolution) {
      return count
    }

    if (resolution.mode === 'existing' && catalogById.has(resolution.selectedExerciseId)) {
      return count + 1
    }

    if (
      resolution.mode === 'create' &&
      `${resolution.createName ?? ''}`.trim() &&
      resolution.muscle_group &&
      resolution.equipment
    ) {
      return count + 1
    }

    return count
  }, 0)
}

function QuickTemplateImportModal({ isOpen, onClose, onImported }) {
  const fileInputRef = useRef(null)
  const [rawInput, setRawInput] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [resolutionState, setResolutionState] = useState({})
  const [catalog, setCatalog] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const catalogById = useMemo(
    () => new Map(catalog.map((exercise) => [exercise.id, exercise])),
    [catalog],
  )
  const unresolvedExercises = useMemo(() => analysis?.unresolvedExercises ?? [], [analysis])
  const resolvedExerciseCount = useMemo(
    () => countResolvedExercises(unresolvedExercises, resolutionState, catalogById),
    [catalogById, resolutionState, unresolvedExercises],
  )
  const allUnresolvedResolved =
    !unresolvedExercises.length || resolvedExerciseCount === unresolvedExercises.length

  const ensureCatalogLoaded = useCallback(async () => {
    if (catalog.length) {
      return catalog
    }

    setLoadingCatalog(true)

    try {
      await seedExercises()
      const rows = await getExercises()
      setCatalog(rows)
      return rows
    } finally {
      setLoadingCatalog(false)
    }
  }, [catalog])

  useEffect(() => {
    if (!isOpen) {
      setRawInput('')
      setAnalysis(null)
      setResolutionState({})
      setCatalog([])
      setLoadingCatalog(false)
      setAnalyzing(false)
      setImporting(false)
      setError('')
      setSuccessMessage('')
      return
    }

    void ensureCatalogLoaded()
  }, [ensureCatalogLoaded, isOpen])

  if (!isOpen) {
    return null
  }

  function updateResolution(key, patch) {
    setResolutionState((current) => ({
      ...current,
      [key]: {
        ...current[key],
        ...patch,
      },
    }))
  }

  function handleInputChange(value) {
    setRawInput(value)
    setAnalysis(null)
    setResolutionState({})
    setError('')
    setSuccessMessage('')
  }

  async function handleFilePicked(event) {
    const [file] = Array.from(event.target.files ?? [])

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      handleInputChange(text)
    } catch {
      setError('Could not read that file. Please try another JSON file.')
    } finally {
      event.target.value = ''
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    setSuccessMessage('')

    try {
      const exerciseCatalog = await ensureCatalogLoaded()
      const result = analyzeQuickTemplateImport(rawInput, exerciseCatalog)

      if (!result.success) {
        setAnalysis(null)
        setResolutionState({})
        setError(result.error ?? 'Could not analyze that import.')
        return
      }

      setAnalysis(result.data)
      setResolutionState(buildInitialResolutionState(result.data.unresolvedExercises))
    } catch (analyzeError) {
      setAnalysis(null)
      setResolutionState({})
      setError(
        analyzeError instanceof Error ? analyzeError.message : 'Could not analyze that import.',
      )
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleImport() {
    if (!analysis) {
      setError('Analyze the import before saving it.')
      return
    }

    if (!allUnresolvedResolved) {
      setError('Resolve every unrecognized exercise before importing.')
      return
    }

    setImporting(true)
    setError('')
    setSuccessMessage('')

    try {
      const resolutionLookup = new Map()
      const createdExercises = []

      for (const item of unresolvedExercises) {
        const resolution = resolutionState[item.key]

        if (resolution?.mode === 'existing') {
          const matchedExercise = catalogById.get(resolution.selectedExerciseId)

          if (!matchedExercise) {
            throw new Error(`Pick a library match for "${item.name}" before importing.`)
          }

          resolutionLookup.set(item.key, matchedExercise)
          continue
        }

        const requestedName = `${resolution?.createName ?? ''}`.trim()
        const exactExisting = catalog.find(
          (exercise) =>
            exercise.slug === slugify(requestedName) ||
            `${exercise.name ?? ''}`.trim().toLowerCase() === requestedName.toLowerCase(),
        )

        if (exactExisting) {
          resolutionLookup.set(item.key, exactExisting)
          continue
        }

        const creationResult = await createCustomExercise({
          name: requestedName,
          muscle_group: resolution.muscle_group,
          equipment: resolution.equipment,
        })

        if (!creationResult.success) {
          throw new Error(
            `Could not create "${requestedName || item.name}": ${creationResult.error ?? 'Unknown error.'}`,
          )
        }

        resolutionLookup.set(item.key, creationResult.data)
        createdExercises.push(creationResult.data)
      }

      const importedTemplates = []

      for (const workout of analysis.workouts) {
        const payload = buildTemplatePayloadFromImportWorkout(workout, resolutionLookup)
        const templateResult = await createTemplate(payload)

        if (!templateResult.success) {
          throw new Error(
            `Could not import "${workout.name}": ${templateResult.error ?? 'Unknown error.'}`,
          )
        }

        importedTemplates.push(templateResult.data)
      }

      const summary = {
        importedWorkouts: importedTemplates.length,
        createdExercises: createdExercises.length,
        workoutNames: importedTemplates.map((template) => template.name),
      }

      setSuccessMessage(
        `Imported ${summary.importedWorkouts} workout${summary.importedWorkouts === 1 ? '' : 's'} and created ${summary.createdExercises} new exercise${summary.createdExercises === 1 ? '' : 's'}.`,
      )
      onImported?.(summary)
      onClose?.()
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Import failed.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-iron-950/92 backdrop-blur-sm lg:items-center lg:justify-center">
      <div className="h-[94vh] w-full overflow-y-auto rounded-t-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(18,18,20,0.98),rgba(8,8,9,0.96))] p-4 shadow-[0_30px_120px_rgba(0,0,0,0.55)] lg:h-auto lg:max-h-[92vh] lg:max-w-6xl lg:rounded-[30px] lg:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[12px] uppercase tracking-[0.28em] text-zinc-500">
              Quick Import
            </p>
            <h2 className="mt-2 text-[22px] font-black tracking-[-0.05em] text-zinc-50">
              Drop workouts in fast, then fix the misses inline.
            </h2>
            <p className="mt-3 max-w-3xl text-[13px] leading-6 text-zinc-400">
              Paste workout JSON or upload a file. If an exercise is unknown, we&apos;ll keep the
              import open, let you search the library first, and only create something new if you
              decide it belongs there.
            </p>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-iron-900 text-zinc-400 transition hover:text-zinc-100"
            onClick={() => onClose?.()}
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.8fr)]">
          <section className="space-y-4 rounded-[28px] border border-white/[0.05] bg-iron-900/55 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-sky/30 bg-sky/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-sky transition hover:bg-sky/15"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" strokeWidth={1.9} />
                <span>Upload JSON</span>
              </button>
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-white/[0.08] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-zinc-200 transition hover:border-gold/30 hover:text-gold"
                onClick={() => handleInputChange(QUICK_TEMPLATE_IMPORT_EXAMPLE)}
              >
                <FileJson className="h-4 w-4" strokeWidth={1.9} />
                <span>Load Example</span>
              </button>
              <button
                type="button"
                className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-lg border border-gold/30 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleAnalyze}
                disabled={analyzing || importing || !rawInput.trim()}
              >
                {analyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.9} />
                ) : (
                  <Search className="h-4 w-4" strokeWidth={1.9} />
                )}
                <span>{analyzing ? 'Analyzing' : 'Analyze Import'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFilePicked}
              />
            </div>

            <textarea
              value={rawInput}
              onChange={(event) => handleInputChange(event.target.value)}
              placeholder='Paste workout JSON here…'
              className="min-h-[320px] w-full rounded-[24px] border border-white/[0.06] bg-iron-950/85 px-4 py-4 font-mono text-[12px] leading-6 text-zinc-100 outline-none transition focus:border-sky/40"
              spellCheck={false}
            />

            {error ? (
              <div className="rounded-[22px] border border-coral/25 bg-coral/10 px-4 py-3 text-[13px] text-coral">
                {error}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-[22px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-[13px] text-emerald-200">
                {successMessage}
              </div>
            ) : null}
          </section>

          <section className="space-y-4 rounded-[28px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.92),rgba(10,10,11,0.94))] p-4 sm:p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                Format
              </p>
              <h3 className="mt-3 text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
                Use JSON with a workouts array.
              </h3>
            </div>

            <div className="rounded-[24px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Required</p>
              <div className="mt-3 space-y-2 text-[13px] text-zinc-300">
                <p>
                  Root: <span className="font-mono text-zinc-100">{'{"version":1,"workouts":[...]}'}</span>
                </p>
                <p>
                  Workout: <span className="font-mono text-zinc-100">name</span> and{' '}
                  <span className="font-mono text-zinc-100">exercises</span>
                </p>
                <p>
                  Exercise: <span className="font-mono text-zinc-100">exercise</span> plus any
                  optional prescription fields like sets, reps, rest, tempo, rpe, notes
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">Tip</p>
              <p className="mt-3 text-[13px] leading-6 text-zinc-400">
                If an exercise might not already exist, include{' '}
                <span className="font-mono text-zinc-200">muscle_group</span> and{' '}
                <span className="font-mono text-zinc-200">equipment</span>. That lets us create it
                without making you backtrack.
              </p>
            </div>

            {analysis ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard
                    label="Workouts"
                    value={analysis.workouts.length}
                    hint="Templates ready to save"
                  />
                  <MetricCard
                    label="Recognized"
                    value={analysis.recognizedExerciseCount}
                    hint="Matched instantly"
                  />
                  <MetricCard
                    label="Needs Review"
                    value={analysis.unresolvedExercises.length}
                    hint="Resolve before import"
                  />
                </div>

                <button
                  type="button"
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-[12px] font-extrabold uppercase tracking-[0.18em] text-iron-900 transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleImport}
                  disabled={importing || loadingCatalog || !allUnresolvedResolved}
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
                  )}
                  <span>{importing ? 'Importing' : 'Import Workouts'}</span>
                </button>

                {!allUnresolvedResolved ? (
                  <p className="text-[12px] text-zinc-500">
                    Resolve {analysis.unresolvedExercises.length - resolvedExerciseCount}{' '}
                    unrecognized exercise
                    {analysis.unresolvedExercises.length - resolvedExerciseCount === 1 ? '' : 's'}{' '}
                    to finish the import.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-white/[0.08] bg-iron-950/45 px-4 py-6 text-[13px] leading-6 text-zinc-500">
                Analyze the JSON first and this panel will turn into a quick review board for the
                import.
              </div>
            )}
          </section>
        </div>

        {analysis?.unresolvedExercises.length ? (
          <section className="mt-5 rounded-[30px] border border-white/[0.05] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-zinc-500">
                  Resolve Unrecognized Exercises
                </p>
                <h3 className="mt-3 text-[24px] font-semibold tracking-[-0.05em] text-zinc-50">
                  Search first. Create only when it really belongs in the library.
                </h3>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-iron-950/70 px-4 py-2 text-[12px] text-zinc-400">
                <AlertCircle className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
                <span>
                  {resolvedExerciseCount}/{analysis.unresolvedExercises.length} resolved
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {analysis.unresolvedExercises.map((item) => {
                const resolution = resolutionState[item.key] ?? buildInitialResolutionState([item])[item.key]
                const searchResults = searchExerciseLibrary(
                  catalog,
                  resolution.searchQuery || item.name,
                  8,
                )
                const selectedExercise = catalogById.get(resolution.selectedExerciseId) ?? null

                return (
                  <article
                    key={item.key}
                    className="rounded-[26px] border border-white/[0.05] bg-iron-950/65 p-4"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 xl:max-w-[260px]">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-coral">
                          Unrecognized
                        </p>
                        <h4 className="mt-2 text-[20px] font-semibold tracking-[-0.04em] text-zinc-50">
                          {item.name}
                        </h4>
                        <p className="mt-2 text-[12px] leading-6 text-zinc-500">
                          Shows up {item.occurrences.length} time
                          {item.occurrences.length === 1 ? '' : 's'} in this import.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.occurrences.map((occurrence) => (
                            <span
                              key={`${occurrence.workoutName}-${occurrence.exerciseIndex}`}
                              className="rounded-full border border-white/[0.05] bg-iron-900 px-2.5 py-1 text-[11px] text-zinc-400"
                            >
                              {occurrence.workoutName}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="grid min-w-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-[22px] border border-white/[0.04] bg-iron-900/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                              Search Existing Library
                            </p>
                            {selectedExercise ? (
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200">
                                Matched
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-white/[0.05] bg-iron-950/75 px-3 py-3">
                            <Search className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
                            <input
                              type="text"
                              value={resolution.searchQuery}
                              onChange={(event) =>
                                updateResolution(item.key, {
                                  mode: resolution.mode === 'existing' ? '' : resolution.mode,
                                  searchQuery: event.target.value,
                                  selectedExerciseId: '',
                                })
                              }
                              placeholder="Search the exercise library..."
                              className="w-full bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
                            />
                          </div>

                          {searchResults.length ? (
                            <div className="mt-3 grid gap-2">
                              {searchResults.map((exercise) => {
                                const isSelected = resolution.selectedExerciseId === exercise.id

                                return (
                                  <button
                                    key={exercise.id}
                                    type="button"
                                    className={`rounded-[18px] border px-3 py-3 text-left transition ${
                                      isSelected
                                        ? 'border-sky/35 bg-sky/10'
                                        : 'border-white/[0.04] bg-iron-950/65 hover:border-white/[0.08]'
                                    }`}
                                    onClick={() =>
                                      updateResolution(item.key, {
                                        mode: 'existing',
                                        selectedExerciseId: exercise.id,
                                      })
                                    }
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-[13px] font-semibold text-zinc-100">
                                          {exercise.name}
                                        </p>
                                        <p className="mt-1 text-[11px] text-zinc-500">
                                          {formatLabel(exercise.muscle_group)} ·{' '}
                                          {formatLabel(exercise.equipment)}
                                        </p>
                                      </div>
                                      {isSelected ? (
                                        <CheckCircle2
                                          className="h-4 w-4 shrink-0 text-sky"
                                          strokeWidth={2}
                                        />
                                      ) : null}
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="mt-3 rounded-[18px] border border-dashed border-white/[0.06] bg-iron-950/55 px-4 py-4 text-[12px] text-zinc-500">
                              No close matches from the library for this query.
                            </div>
                          )}
                        </div>

                        <div className="rounded-[22px] border border-white/[0.04] bg-iron-900/60 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-600">
                              Create New If Needed
                            </p>
                            <button
                              type="button"
                              className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
                                resolution.mode === 'create'
                                  ? 'border-gold/35 bg-gold/10 text-gold'
                                  : 'border-white/[0.06] text-zinc-300 hover:border-gold/30 hover:text-gold'
                              }`}
                              onClick={() =>
                                updateResolution(item.key, {
                                  mode: 'create',
                                  selectedExerciseId: '',
                                })
                              }
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                              <span>Create New</span>
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3">
                            <input
                              type="text"
                              value={resolution.createName}
                              onChange={(event) =>
                                updateResolution(item.key, {
                                  createName: event.target.value,
                                  mode: 'create',
                                  selectedExerciseId: '',
                                })
                              }
                              placeholder="Exercise name"
                              className="rounded-[18px] border border-white/[0.05] bg-iron-950/75 px-3 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold/35"
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                              <select
                                value={resolution.muscle_group}
                                onChange={(event) =>
                                  updateResolution(item.key, {
                                    muscle_group: event.target.value,
                                    mode: 'create',
                                  })
                                }
                                className="rounded-[18px] border border-white/[0.05] bg-iron-950/75 px-3 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold/35"
                              >
                                {MUSCLE_GROUP_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {formatLabel(option)}
                                  </option>
                                ))}
                              </select>

                              <select
                                value={resolution.equipment}
                                onChange={(event) =>
                                  updateResolution(item.key, {
                                    equipment: event.target.value,
                                    mode: 'create',
                                  })
                                }
                                className="rounded-[18px] border border-white/[0.05] bg-iron-950/75 px-3 py-3 text-[13px] text-zinc-100 outline-none transition focus:border-gold/35"
                              >
                                {EQUIPMENT_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {formatLabel(option)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {resolution.mode === 'create' ? (
                            <div className="mt-3 rounded-[18px] border border-gold/20 bg-gold/10 px-3 py-3 text-[12px] text-gold">
                              This will create a new library exercise during import if you keep
                              this path selected.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : analysis ? (
          <section className="mt-5 rounded-[30px] border border-emerald-400/20 bg-emerald-400/10 px-5 py-4 text-[14px] text-emerald-100">
            Every exercise matched the library cleanly. You can import these workouts right away.
          </section>
        ) : null}
      </div>
    </div>
  )
}

export default QuickTemplateImportModal
