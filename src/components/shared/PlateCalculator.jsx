import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { isConfigured, supabase } from '../../lib/supabase.js'

const PLATE_COLORS = {
  20: 'bg-red-500 h-14',
  15: 'bg-yellow-500 h-12',
  10: 'bg-green-500 h-10',
  5: 'bg-zinc-300 h-8',
  2.5: 'bg-red-400 h-6',
  1.25: 'bg-zinc-500 h-5',
}

function getBarOptions(equipment = []) {
  return equipment
    .filter((item) => item.equipment_type === 'bar')
    .map((item) => ({
      id: item.id,
      label: item.label ?? `${item.weight}kg bar`,
      weight: Number(item.weight) || 0,
    }))
}

function getPlateOptions(equipment = []) {
  return equipment
    .filter((item) => item.equipment_type === 'plate')
    .map((item) => ({
      id: item.id,
      weight: Number(item.weight) || 0,
      quantity: Number(item.quantity) || 0,
      label: item.label ?? `${item.weight}kg plate`,
    }))
    .sort((left, right) => right.weight - left.weight)
}

function formatPlateList(plates = []) {
  return plates.map((plate) => plate.weight).join(' + ') || 'None'
}

function buildPlatePlan(targetWeight, barWeight, plates) {
  const availableWeight = Math.max((Number(targetWeight) || 0) - (Number(barWeight) || 0), 0)
  const perSideTarget = availableWeight / 2
  let remainingWeight = perSideTarget
  const plan = []

  plates.forEach((plate) => {
    if (plate.weight <= 0) {
      return
    }

    const maxPairs = Math.floor((plate.quantity || 0) / 2)
    const neededPairs = Math.floor(remainingWeight / plate.weight)
    const pairCount = Math.min(maxPairs, neededPairs)

    for (let index = 0; index < pairCount; index += 1) {
      plan.push(plate)
      remainingWeight -= plate.weight
    }
  })

  return {
    perSideTarget,
    perSidePlates: plan,
    achievedWeight:
      barWeight + plan.reduce((sum, plate) => sum + plate.weight, 0) * 2,
  }
}

function PlateCalculator({
  isOpen,
  initialWeight = 60,
  onClose,
  onConfirm,
}) {
  const [equipment, setEquipment] = useState([])
  const [targetWeight, setTargetWeight] = useState(initialWeight)
  const [selectedBarId, setSelectedBarId] = useState('')

  useEffect(() => {
    let isCancelled = false

    async function loadEquipment() {
      if (!isConfigured || !isOpen) {
        if (!isCancelled) {
          setEquipment([])
        }

        return
      }

      const { data, error } = await supabase
        .from('user_equipment')
        .select('*')
        .order('weight', { ascending: false })

      if (!isCancelled && !error) {
        setEquipment(data ?? [])
      }
    }

    void loadEquipment()

    return () => {
      isCancelled = true
    }
  }, [isOpen])

  const barOptions = useMemo(() => getBarOptions(equipment), [equipment])
  const plateOptions = useMemo(() => getPlateOptions(equipment), [equipment])
  const selectedBar = useMemo(
    () => barOptions.find((option) => option.id === selectedBarId) ?? barOptions[0] ?? null,
    [barOptions, selectedBarId],
  )
  const platePlan = useMemo(
    () => buildPlatePlan(targetWeight, selectedBar?.weight ?? 20, plateOptions),
    [plateOptions, selectedBar?.weight, targetWeight],
  )

  useEffect(() => {
    if (!selectedBarId && barOptions[0]?.id) {
      setSelectedBarId(barOptions[0].id)
    }
  }, [barOptions, selectedBarId])

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 bg-iron-900/90 px-4 py-8 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/[0.04] bg-iron-800 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Utility</p>
            <h2 className="mt-2 text-[22px] font-bold text-zinc-100">Plate Calculator</h2>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.04] bg-iron-900 text-zinc-500 transition hover:text-zinc-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mt-5 text-center">
          <input
            type="number"
            value={targetWeight}
            onChange={(event) => setTargetWeight(event.target.value)}
            className="w-full bg-transparent text-center font-mono text-[32px] font-bold text-zinc-100 outline-none"
          />
          <p className="mt-1 text-[12px] text-zinc-500">Target weight (kg)</p>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {[-5, -2.5, 2.5, 5].map((increment) => (
            <button
              key={increment}
              type="button"
              className="rounded-xl border border-white/[0.04] bg-iron-900 px-3 py-2 text-[13px] font-semibold text-zinc-300 transition hover:border-gold/30"
              onClick={() =>
                setTargetWeight((current) => Math.max((Number(current) || 0) + increment, 0))
              }
            >
              {increment > 0 ? `+${increment}` : increment}
            </button>
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {barOptions.map((option) => {
            const isActive = selectedBar?.id === option.id

            return (
              <button
                key={option.id}
                type="button"
                className={`rounded-full border px-3 py-2 text-[12px] transition ${
                  isActive
                    ? 'border-gold/30 bg-gold/15 text-gold'
                    : 'border-white/[0.04] bg-iron-900 text-zinc-500'
                }`}
                onClick={() => setSelectedBarId(option.id)}
              >
                {option.label}
              </button>
            )
          })}
        </div>

        <div className="mt-6 rounded-2xl bg-iron-900 p-4">
          <div className="mx-auto flex h-20 items-center justify-center gap-1 overflow-hidden">
            <div className="flex items-center gap-1">
              {[...platePlan.perSidePlates].reverse().map((plate, index) => (
                <div
                  key={`left-${plate.id}-${index + 1}`}
                  className={`w-5 rounded-sm ${PLATE_COLORS[plate.weight] ?? 'bg-zinc-600 h-6'}`}
                />
              ))}
            </div>

            <div className="h-2 w-24 rounded-full bg-zinc-600" />

            <div className="flex items-center gap-1">
              {platePlan.perSidePlates.map((plate, index) => (
                <div
                  key={`right-${plate.id}-${index + 1}`}
                  className={`w-5 rounded-sm ${PLATE_COLORS[plate.weight] ?? 'bg-zinc-600 h-6'}`}
                />
              ))}
            </div>
          </div>

          <p className="mt-4 text-center font-mono text-[13px] text-zinc-400">
            Per side: {formatPlateList(platePlan.perSidePlates)}
          </p>
          <p className="mt-2 text-center text-[12px] text-zinc-500">
            Achievable: {platePlan.achievedWeight}kg total
          </p>
        </div>

        <button
          type="button"
          className="mt-5 w-full rounded-xl bg-gold px-4 py-3 text-[12px] font-extrabold uppercase tracking-[0.24em] text-iron-900 transition hover:bg-gold-light"
          onClick={() =>
            onConfirm?.({
              targetWeight: Number(targetWeight) || 0,
              achievedWeight: platePlan.achievedWeight,
              bar: selectedBar,
              plates: platePlan.perSidePlates,
            })
          }
        >
          Use {platePlan.achievedWeight}kg
        </button>
      </div>
    </div>
  )
}

export default PlateCalculator
