import { getPhaseColor, parseRestNotation } from './calculations.js'
import { buildImageId, slugify } from './customWorkouts.js'
import { parseReps } from './repParser.js'

function normalizeText(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmedValue = value.trim()

  return trimmedValue || null
}

function toNumber(value, fallback = null) {
  const parsedValue = Number(value)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function getDaysPerWeek(programData) {
  const phaseDayCounts = (programData?.phases ?? []).map(
    (phase) => phase?.days?.length ?? 0,
  )

  return Math.max(...phaseDayCounts, 0) || 5
}

function getRepBounds(repNotation) {
  const parsed = parseReps(repNotation)

  if (!parsed) {
    return {
      rep_min: null,
      rep_max: null,
    }
  }

  switch (parsed.type) {
    case 'range':
      return {
        rep_min: parsed.min,
        rep_max: parsed.max,
      }
    case 'fixed':
      return {
        rep_min: parsed.value,
        rep_max: parsed.value,
      }
    case 'variable':
      return {
        rep_min: Math.min(...parsed.perSet),
        rep_max: Math.max(...parsed.perSet),
      }
    case 'dropset':
      return {
        rep_min: Math.min(parsed.main, parsed.drop),
        rep_max: Math.max(parsed.main, parsed.drop),
      }
    case 'compound':
      return {
        rep_min: Math.min(...parsed.parts),
        rep_max: Math.max(...parsed.parts),
      }
    default:
      return {
        rep_min: null,
        rep_max: null,
      }
  }
}

function getRpeTarget(rpeNotation) {
  const normalizedRpe = normalizeText(rpeNotation)

  if (!normalizedRpe) {
    return null
  }

  const match = normalizedRpe.match(
    /(?<start>\d+(?:\.\d+)?)(?:\s*-\s*(?<end>\d+(?:\.\d+)?))?/,
  )

  if (!match?.groups?.start) {
    return null
  }

  const start = Number(match.groups.start)
  const end = match.groups.end ? Number(match.groups.end) : start

  return Math.round(((start + end) / 2) * 10) / 10
}

async function ensureNoError(result, fallbackMessage) {
  if (result.error) {
    throw new Error(result.error.message || fallbackMessage)
  }

  return result.data
}

async function findOrCreateExercise(supabase, exercise, exerciseCache) {
  const exerciseName = normalizeText(exercise?.name)
  const videoUrl = normalizeText(exercise?.video_url)
  const slug = slugify(exerciseName)

  if (!exerciseName) {
    throw new Error('Exercise name is required to save a program.')
  }

  const cacheKey = exerciseName.toLowerCase()

  if (exerciseCache.has(cacheKey)) {
    return exerciseCache.get(cacheKey)
  }

  const existingExercise = await ensureNoError(
    await supabase
      .from('exercises')
      .select('id, video_url, slug, muscle_group')
      .eq('name', exerciseName)
      .maybeSingle(),
    `Failed to look up exercise "${exerciseName}".`,
  )

  if (existingExercise?.id) {
    const patch = {}

    if (!normalizeText(existingExercise.video_url) && videoUrl) {
      patch.video_url = videoUrl
    }

    if (!normalizeText(existingExercise.slug) && slug) {
      patch.slug = slug
    }

    if (!normalizeText(existingExercise.muscle_group) && normalizeText(exercise.muscle)) {
      patch.muscle_group = normalizeText(exercise.muscle)
      patch.primary_muscle_group = normalizeText(exercise.muscle)
    }

    if (Object.keys(patch).length) {
      await ensureNoError(
        await supabase
          .from('exercises')
          .update(patch)
          .eq('id', existingExercise.id),
        `Failed to update exercise metadata for "${exerciseName}".`,
      )
    }

    exerciseCache.set(cacheKey, existingExercise.id)
    return existingExercise.id
  }

  const insertedExercise = await ensureNoError(
    await supabase
      .from('exercises')
      .insert({
        name: exerciseName,
        slug,
        muscle_group: normalizeText(exercise.muscle),
        primary_muscle_group: normalizeText(exercise.muscle),
        secondary_muscles: [],
        equipment: normalizeText(exercise.equipment),
        movement_type: normalizeText(exercise.movement_type) ?? 'isolation',
        force: normalizeText(exercise.force),
        mechanic: normalizeText(exercise.mechanic),
        instructions: normalizeText(exercise.coaching_cue),
        image_id: buildImageId(exerciseName),
        video_url: videoUrl,
        is_custom: true,
      })
      .select('id')
      .single(),
    `Failed to create exercise "${exerciseName}".`,
  )

  exerciseCache.set(cacheKey, insertedExercise.id)
  return insertedExercise.id
}

export async function saveProgram(supabase, programData) {
  try {
    if (!supabase?.from) {
      throw new Error('A configured Supabase client is required.')
    }

    if (!programData?.program_name) {
      throw new Error('Program name is required.')
    }

    const exerciseCache = new Map()
    const daysPerWeek = getDaysPerWeek(programData)

    const program = await ensureNoError(
      await supabase
        .from('programs')
        .insert({
          name: programData.program_name.trim(),
          author: normalizeText(programData.author),
          days_per_week: daysPerWeek,
          is_active: false,
          source_filename: normalizeText(programData.source_filename),
        })
        .select('id')
        .single(),
      'Failed to create program.',
    )

    let globalWeekNumber = 1

    for (let phaseIndex = 0; phaseIndex < (programData.phases ?? []).length; phaseIndex += 1) {
      const phase = programData.phases[phaseIndex]
      const phaseNumber = toNumber(phase.phase_number, phaseIndex + 1)
      const numWeeks = Math.max(toNumber(phase.num_weeks, 1), 1)

      const savedPhase = await ensureNoError(
        await supabase
          .from('program_phases')
          .insert({
            program_id: program.id,
            phase_number: phaseNumber,
            name: normalizeText(phase.name) ?? `Phase ${phaseNumber}`,
            description: normalizeText(phase.description),
            num_weeks: numWeeks,
            color_accent: getPhaseColor(phaseNumber),
          })
          .select('id')
          .single(),
        `Failed to create phase ${phaseNumber}.`,
      )

      // Duplicate the phase template into each generated week when the PDF only
      // describes one representative week for a repeating phase.
      for (let weekNumber = 1; weekNumber <= numWeeks; weekNumber += 1) {
        const savedWeek = await ensureNoError(
          await supabase
            .from('program_weeks')
            .insert({
              phase_id: savedPhase.id,
              week_number: weekNumber,
              global_week_number: globalWeekNumber,
              label: `Week ${weekNumber}`,
            })
            .select('id')
            .single(),
          `Failed to create week ${weekNumber} for phase ${phaseNumber}.`,
        )

        for (let dayIndex = 0; dayIndex < (phase.days ?? []).length; dayIndex += 1) {
          const day = phase.days[dayIndex]

          const savedDay = await ensureNoError(
            await supabase
              .from('program_days')
              .insert({
                week_id: savedWeek.id,
                day_number: toNumber(day.day_number, dayIndex + 1),
                name: normalizeText(day.name) ?? `Day ${dayIndex + 1}`,
                day_type: normalizeText(day.day_type),
                rest_note: normalizeText(day.rest_note),
              })
              .select('id')
              .single(),
            `Failed to create day ${dayIndex + 1} for phase ${phaseNumber}.`,
          )

          for (
            let exerciseIndex = 0;
            exerciseIndex < (day.exercises ?? []).length;
            exerciseIndex += 1
          ) {
            const exercise = day.exercises[exerciseIndex]
            const exerciseId = await findOrCreateExercise(supabase, exercise, exerciseCache)
            const { rep_min: repMin, rep_max: repMax } = getRepBounds(exercise.rep_notation)

            await ensureNoError(
              await supabase.from('prescribed_exercises').insert({
                day_id: savedDay.id,
                exercise_id: exerciseId,
                display_order: toNumber(exercise.display_order, exerciseIndex + 1),
                warmup_sets: toNumber(exercise.warmup_sets, 0),
                working_sets: toNumber(exercise.working_sets, 0),
                rep_notation: normalizeText(exercise.rep_notation) ?? '',
                rep_min: repMin,
                rep_max: repMax,
                rpe_target: getRpeTarget(exercise.rpe_notation),
                rpe_notation: normalizeText(exercise.rpe_notation),
                rest_seconds: parseRestNotation(exercise.rest_notation),
                rest_notation: normalizeText(exercise.rest_notation),
                group_id: normalizeText(exercise.group_id),
                group_type: normalizeText(exercise.group_id) ? 'superset' : null,
                group_order: toNumber(exercise.group_order, exerciseIndex + 1),
                substitution_1: normalizeText(exercise.substitution_1),
                substitution_2: normalizeText(exercise.substitution_2),
                coaching_cue: normalizeText(exercise.coaching_cue),
              }),
              `Failed to save exercise "${exercise.name}" for day ${savedDay.id}.`,
            )
          }
        }

        globalWeekNumber += 1
      }
    }

    await ensureNoError(
      await supabase.from('programs').update({ is_active: false }).neq('id', program.id),
      'Failed to deactivate existing programs.',
    )

    await ensureNoError(
      await supabase.from('programs').update({ is_active: true }).eq('id', program.id),
      'Failed to activate imported program.',
    )

    await ensureNoError(
      await supabase.from('user_progress').insert({
        program_id: program.id,
        current_phase: 1,
        current_week: 1,
        current_day: 1,
        weekly_target: daysPerWeek,
      }),
      'Failed to create user progress row.',
    )

    return {
      success: true,
      program_id: program.id,
      error: null,
    }
  } catch (error) {
    return {
      success: false,
      program_id: null,
      error: error instanceof Error ? error.message : 'Failed to save program.',
    }
  }
}
