import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, RefreshCw } from 'lucide-react'
import * as XLSX from 'xlsx'
import PlateCalculator from '../components/shared/PlateCalculator.jsx'
import {
  getStoredPreferences,
  writeStoredPreferences,
} from '../lib/preferences.js'
import { readRuntimeDiagnostics } from '../lib/runtimeDiagnostics.js'
import { isConfigured, supabase } from '../lib/supabase.js'

const DEFAULT_EQUIPMENT = [
  { equipment_type: 'bar', label: 'Olympic Barbell', weight: 20, quantity: 1, unit: 'kg' },
  { equipment_type: 'bar', label: 'EZ Curl Bar', weight: 10, quantity: 1, unit: 'kg' },
  { equipment_type: 'plate', label: '20kg Plate', weight: 20, quantity: 2, unit: 'kg' },
  { equipment_type: 'plate', label: '15kg Plate', weight: 15, quantity: 2, unit: 'kg' },
  { equipment_type: 'plate', label: '10kg Plate', weight: 10, quantity: 2, unit: 'kg' },
  { equipment_type: 'plate', label: '5kg Plate', weight: 5, quantity: 2, unit: 'kg' },
  { equipment_type: 'plate', label: '2.5kg Plate', weight: 2.5, quantity: 2, unit: 'kg' },
  { equipment_type: 'plate', label: '1.25kg Plate', weight: 1.25, quantity: 2, unit: 'kg' },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      className={`relative inline-flex h-5 w-10 rounded-full transition ${
        checked ? 'bg-gold' : 'bg-iron-600'
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-zinc-100 transition ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

async function fetchEquipment() {
  const { data, error } = await supabase
    .from('user_equipment')
    .select('*')
    .order('equipment_type', { ascending: true })
    .order('weight', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

function SettingsMetric({ label, value, hint }) {
  return (
    <div className="rounded-[22px] border border-white/[0.05] bg-iron-950/70 px-4 py-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-[-0.04em] text-zinc-50">{value}</p>
      <p className="mt-2 text-[12px] text-zinc-500">{hint}</p>
    </div>
  )
}

function formatDiagnosticTime(value) {
  if (!value) {
    return '--'
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function formatMemoryMb(value) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? `${Math.round(numericValue / 1024 / 1024)} MB` : '--'
}

function SettingsPage({ program, progress, updateProgress, onNavigate, onDataReset }) {
  const [equipment, setEquipment] = useState([])
  const [selectedBarId, setSelectedBarId] = useState('')
  const [preferences, setPreferences] = useState(() => ({
    ...getStoredPreferences(),
  }))
  const [diagnostics, setDiagnostics] = useState(() => readRuntimeDiagnostics())
  const [isPlateCalculatorOpen, setIsPlateCalculatorOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const bars = useMemo(
    () => equipment.filter((item) => item.equipment_type === 'bar'),
    [equipment],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadEquipment() {
      if (!isConfigured) {
        if (!isCancelled) {
          setEquipment([])
          setLoading(false)
        }

        return
      }

      setLoading(true)

      try {
        const nextEquipment = await fetchEquipment()

        if (!isCancelled) {
          setEquipment(nextEquipment)
          setSelectedBarId((currentValue) => currentValue || nextEquipment[0]?.id || '')
          setLoading(false)
        }
      } catch {
        if (!isCancelled) {
          setEquipment([])
          setLoading(false)
        }
      }
    }

    void loadEquipment()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    writeStoredPreferences(preferences)
  }, [preferences])

  const recentDiagnosticEvents = useMemo(
    () => [...(diagnostics.events ?? [])].slice(-8).reverse(),
    [diagnostics.events],
  )

  async function saveEquipment(nextEquipment = equipment) {
    const removableIds = nextEquipment
      .filter((item) => item._delete && item.id)
      .map((item) => item.id)

    if (removableIds.length) {
      await supabase.from('user_equipment').delete().in('id', removableIds)
    }

    const upsertRows = nextEquipment
      .filter((item) => !item._delete)
      .map((item) => ({
        id: item.id?.startsWith?.('local-') ? undefined : item.id,
        equipment_type: item.equipment_type,
        weight: Number(item.weight) || 0,
        quantity: Number(item.quantity) || 0,
        unit: item.unit || 'kg',
        label: item.label || null,
      }))

    if (upsertRows.length) {
      await supabase.from('user_equipment').upsert(upsertRows)
    }

    const refreshedEquipment = await fetchEquipment()
    setEquipment(refreshedEquipment)
  }

  async function resetEquipment() {
    await supabase.from('user_equipment').delete().neq('id', '')
    await supabase.from('user_equipment').insert(DEFAULT_EQUIPMENT)
    const refreshedEquipment = await fetchEquipment()
    setEquipment(refreshedEquipment)
    setSelectedBarId(refreshedEquipment[0]?.id ?? '')
  }

  async function exportData() {
    const [
      { data: sessions },
      { data: sets },
      { data: exercisesData },
      { data: prs },
      { data: progressRows },
    ] = await Promise.all([
      supabase.from('workout_sessions').select('*'),
      supabase.from('logged_sets').select('*'),
      supabase.from('exercises').select('*'),
      supabase.from('personal_records').select('*'),
      supabase.from('user_progress').select('*'),
    ])

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sessions ?? []), 'Sessions')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sets ?? []), 'Sets')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exercisesData ?? []), 'Exercises')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(prs ?? []), 'PRs')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(progressRows ?? []), 'Progress')

    XLSX.writeFile(workbook, 'iron-export.xlsx')
  }

  async function resetProgressData() {
    if (!window.confirm('Reset workout progress and session history?')) {
      return
    }

    await supabase.from('logged_sets').delete().neq('id', '')
    await supabase.from('personal_records').delete().neq('id', '')
    await supabase.from('phase_snapshots').delete().neq('id', '')
    await supabase.from('workout_sessions').delete().neq('id', '')

    if (progress?.id) {
      await updateProgress({
        current_phase: 1,
        current_week: 1,
        current_day: 1,
        session_streak: 0,
        longest_streak: progress.longest_streak ?? 0,
        weekly_completed: 0,
        total_sessions: 0,
        total_volume_lifetime: 0,
        total_prs: 0,
        total_xp: 0,
        level: 1,
        last_workout_date: null,
      })
    }

    onDataReset?.()
  }

  async function deleteAllData() {
    if (!window.confirm('Delete all IRON data? This cannot be undone.')) {
      return
    }

    await supabase.from('logged_sets').delete().neq('id', '')
    await supabase.from('personal_records').delete().neq('id', '')
    await supabase.from('phase_snapshots').delete().neq('id', '')
    await supabase.from('workout_sessions').delete().neq('id', '')
    await supabase.from('body_metrics').delete().neq('id', '')
    await supabase.from('user_progress').delete().neq('id', '')
    await supabase.from('programs').delete().neq('id', '')
    await supabase.from('exercises').delete().neq('id', '')
    await supabase.from('user_equipment').delete().neq('id', '')

    window.dispatchEvent(new CustomEvent('iron:program-changed'))
    onDataReset?.()
  }

  return (
    <>
      <section className="space-y-6 py-2 lg:py-1">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-gold">
              System Panel
            </p>
            <h1 className="mt-3 text-[34px] font-black tracking-[-0.06em] text-zinc-50 sm:text-[42px]">
              Tune the environment that powers the floor.
            </h1>
            <p className="mt-3 max-w-3xl text-[14px] leading-7 text-zinc-400">
              Manage equipment, calibration preferences, training targets, exports, and the few
              controls that can wipe the system clean.
            </p>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-4">
          <SettingsMetric
            label="Equipment"
            value={equipment.length}
            hint={program ? `${program.name}` : 'Default gym setup'}
          />
          <SettingsMetric
            label="Weekly Target"
            value={progress?.weekly_target ?? 5}
            hint="Target sessions"
          />
          <SettingsMetric
            label="Shields"
            value={progress?.streak_shields_remaining ?? 0}
            hint="Streak protection"
          />
          <SettingsMetric
            label="Units"
            value={(preferences.units ?? 'kg').toUpperCase()}
            hint="Measurement mode"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[28px] border border-white/[0.04] bg-[linear-gradient(180deg,rgba(20,20,22,0.94),rgba(10,10,11,0.92))] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-200">Equipment Rack</p>
                <p className="mt-1 text-[12px] text-zinc-500">
                  {program ? `${program.name} equipment profile` : 'Default gym setup'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-2xl border border-white/[0.04] bg-iron-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30"
                onClick={() => setIsPlateCalculatorOpen(true)}
              >
                Plate Calculator
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {bars.map((bar) => {
                const isActive = selectedBarId === bar.id

                return (
                  <button
                    key={bar.id}
                    type="button"
                    className={`rounded-full border px-3 py-2 text-[12px] transition ${
                      isActive
                        ? 'border-gold/30 bg-gold/15 text-gold'
                        : 'border-white/[0.04] bg-iron-950/70 text-zinc-500'
                    }`}
                    onClick={() => setSelectedBarId(bar.id)}
                  >
                    {bar.label ?? `${bar.weight}kg bar`}
                  </button>
                )
              })}
            </div>

            <div className="mt-5 space-y-3">
              {loading ? (
                <div className="h-20 animate-pulse rounded-2xl bg-iron-900/60" />
              ) : (
                equipment.map((item, index) => (
                  <div
                    key={item.id ?? `${item.label}-${index + 1}`}
                    className="grid gap-2 rounded-[22px] border border-white/[0.04] bg-iron-950/60 p-3 lg:grid-cols-[1.3fr,0.7fr,0.7fr,auto]"
                  >
                    <input
                      value={item.label ?? ''}
                      onChange={(event) =>
                        setEquipment((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, label: event.target.value } : entry,
                          ),
                        )
                      }
                      className="rounded-xl border border-iron-600 bg-iron-900 px-3 py-2 text-[12px] text-zinc-100 outline-none transition focus:border-gold"
                    />
                    <input
                      type="number"
                      value={item.weight}
                      onChange={(event) =>
                        setEquipment((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, weight: event.target.value } : entry,
                          ),
                        )
                      }
                      className="rounded-xl border border-iron-600 bg-iron-900 px-3 py-2 text-[12px] text-zinc-100 outline-none transition focus:border-gold"
                    />
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(event) =>
                        setEquipment((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                          ),
                        )
                      }
                      className="rounded-xl border border-iron-600 bg-iron-900 px-3 py-2 text-[12px] text-zinc-100 outline-none transition focus:border-gold"
                    />
                    <button
                      type="button"
                      className="rounded-xl border border-white/[0.04] bg-iron-900 px-3 py-2 text-[12px] text-zinc-500 transition hover:text-coral"
                      onClick={() =>
                        setEquipment((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, _delete: true } : entry,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-2xl border border-white/[0.04] bg-iron-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30"
                onClick={() =>
                  setEquipment((current) => [
                    ...current,
                    {
                      id: `local-${Date.now()}`,
                      equipment_type: 'plate',
                      label: 'New plate',
                      weight: 1.25,
                      quantity: 2,
                      unit: 'kg',
                    },
                  ])
                }
              >
                Add Plate
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/[0.04] bg-iron-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30"
                onClick={() => void saveEquipment(equipment)}
              >
                Save Equipment
              </button>
              <button
                type="button"
                className="rounded-2xl border border-white/[0.04] bg-iron-900 px-4 py-2.5 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30"
                onClick={() => void resetEquipment()}
              >
                Reset Defaults
              </button>
            </div>
          </section>

          <div className="space-y-4">
            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Reference</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    Open the internal glossary for training terms used across the app.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-2.5 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30 hover:text-zinc-100"
                  onClick={() => onNavigate?.('glossary')}
                >
                  <BookOpenText className="h-4 w-4" strokeWidth={1.8} />
                  Glossary
                </button>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <p className="text-sm font-semibold text-zinc-200">Preferences</p>
              <div className="mt-4 space-y-3">
                {[
                  ['Units', preferences.units === 'kg' ? 'Kilograms' : 'Pounds', 'units'],
                  ['Rest Sound', preferences.restSound ? 'On' : 'Off', 'restSound'],
                  ['Smart Rest', preferences.smartRestEnabled ? 'On' : 'Off', 'smartRestEnabled'],
                  ['Vibration', preferences.vibration ? 'On' : 'Off', 'vibration'],
                  ['XP Tracking', preferences.xpEnabled ? 'On' : 'Off', 'xpEnabled'],
                ].map(([label, value, key]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 rounded-[22px] border border-white/[0.04] bg-iron-950/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-zinc-200">{label}</p>
                      <p className="mt-1 text-[12px] text-zinc-500">{value}</p>
                    </div>
                    {key === 'units' ? (
                      <div className="flex gap-2">
                        {['kg', 'lbs'].map((unit) => (
                          <button
                            key={unit}
                            type="button"
                            className={`rounded-full border px-3 py-1.5 text-[12px] transition ${
                              preferences.units === unit
                                ? 'border-gold/30 bg-gold/15 text-gold'
                                : 'border-white/[0.04] bg-iron-900 text-zinc-500'
                            }`}
                            onClick={() =>
                              setPreferences((current) => ({ ...current, units: unit }))
                            }
                          >
                            {unit}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Toggle
                        checked={Boolean(preferences[key])}
                        onChange={(nextValue) =>
                          setPreferences((current) => ({ ...current, [key]: nextValue }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <p className="text-sm font-semibold text-zinc-200">Weekly Target</p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-2 text-zinc-300"
                  onClick={() =>
                    updateProgress?.({
                      weekly_target: Math.max((progress?.weekly_target ?? 5) - 1, 1),
                    })
                  }
                >
                  -
                </button>
                <div className="rounded-2xl bg-iron-950 px-4 py-2 font-mono text-[20px] font-bold text-zinc-100">
                  {progress?.weekly_target ?? 5}
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-2 text-zinc-300"
                  onClick={() =>
                    updateProgress?.({
                      weekly_target: Math.min((progress?.weekly_target ?? 5) + 1, 7),
                    })
                  }
                >
                  +
                </button>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <p className="text-sm font-semibold text-zinc-200">Streak Shields</p>
              <p className="mt-2 text-[13px] text-zinc-500">
                {progress?.streak_shields_remaining ?? 0} remaining
              </p>
              <p className="mt-1 text-[12px] text-zinc-600">
                Reset date: {progress?.streak_shields_reset_at ?? 'Not set'}
              </p>
              <button
                type="button"
                className="mt-4 rounded-2xl border border-white/[0.04] bg-iron-950 px-4 py-2 text-[12px] font-semibold text-zinc-300 transition hover:border-gold/30"
                onClick={() => {
                  if ((progress?.streak_shields_remaining ?? 0) > 0) {
                    updateProgress?.({
                      streak_shields_remaining: Math.max(
                        (progress?.streak_shields_remaining ?? 0) - 1,
                        0,
                      ),
                      streak_shields_reset_at: new Date().toISOString().slice(0, 10),
                    })
                  }
                }}
              >
                Use Shield
              </button>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <p className="text-sm font-semibold text-zinc-200">Data Export</p>
              <button
                type="button"
                className="mt-4 rounded-2xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition hover:bg-gold-light"
                onClick={() => void exportData()}
              >
                Export (.xlsx)
              </button>
            </section>

            <section className="rounded-[28px] border border-white/[0.04] bg-iron-900/75 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-200">Runtime Diagnostics</p>
                  <p className="mt-1 text-[12px] text-zinc-500">
                    {recentDiagnosticEvents[0]?.type ?? 'No events yet'}
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.04] bg-iron-950 text-zinc-400 transition hover:border-gold/30 hover:text-zinc-100"
                  onClick={() => setDiagnostics(readRuntimeDiagnostics())}
                  aria-label="Refresh runtime diagnostics"
                >
                  <RefreshCw className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {recentDiagnosticEvents.length ? (
                  recentDiagnosticEvents.map((event, index) => (
                    <div
                      key={`${event.timestamp}-${event.type}-${index}`}
                      className="rounded-[18px] border border-white/[0.04] bg-iron-950/65 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold text-zinc-200">{event.type}</p>
                        <p className="font-mono text-[11px] text-zinc-600">
                          {formatDiagnosticTime(event.timestamp)}
                        </p>
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        Heap {formatMemoryMb(event.memory?.usedJsHeap)} /{' '}
                        {formatMemoryMb(event.memory?.jsHeapLimit)}
                      </p>
                      {event.payload?.message ? (
                        <p className="mt-2 break-words text-[11px] leading-5 text-coral">
                          {event.payload.message}
                        </p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-white/[0.04] bg-iron-950/65 px-3 py-3 text-[12px] text-zinc-500">
                    Waiting for runtime events.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-coral/30 bg-iron-900/75 p-5">
              <p className="text-sm font-semibold text-coral">Danger Zone</p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.2em] text-coral"
                  onClick={() => void resetProgressData()}
                >
                  Reset Progress
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-coral/30 bg-coral/10 px-4 py-3 text-[12px] font-bold uppercase tracking-[0.2em] text-coral"
                  onClick={() => void deleteAllData()}
                >
                  Delete All Data
                </button>
              </div>
            </section>
          </div>
        </div>
      </section>

      <PlateCalculator
        isOpen={isPlateCalculatorOpen}
        onClose={() => setIsPlateCalculatorOpen(false)}
        onConfirm={() => setIsPlateCalculatorOpen(false)}
      />
    </>
  )
}

export default SettingsPage
