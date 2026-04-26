import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = resolve(
  SCRIPT_DIR,
  '../extracted/jeff_nippard_ultimate_ppl.json',
)

function parseSetCode(code) {
  const normalized = String(code).trim()
  const left = normalized.split('-')[0]

  if (/^\d{2}$/.test(left)) {
    return {
      working_sets: Number(left[0]),
      warmup_sets: Number(left[1]),
    }
  }

  if (/^\d{3}$/.test(left)) {
    return {
      working_sets: Number(left.slice(0, 2)),
      warmup_sets: Number(left.slice(2)),
    }
  }

  throw new Error(`Unsupported set code: ${code}`)
}

function stripGroupPrefix(value) {
  return typeof value === 'string'
    ? value.replace(/^[A-Z]\d?[:.]\s*/i, '').trim()
    : value
}

function inferEquipment(name, explicitEquipment) {
  if (explicitEquipment) {
    return explicitEquipment
  }

  const value = name.toLowerCase()

  if (
    value.includes('push up') ||
    value.includes('pushup') ||
    value.includes('pull-up') ||
    value.includes('chin-up') ||
    value.includes('stretch') ||
    value.includes('plank') ||
    value.includes('nordic') ||
    value.includes('reverse crunch') ||
    value.includes('hanging leg raise') ||
    value.includes('corpse crunch')
  ) {
    return 'bodyweight'
  }

  if (
    value.includes('cable') ||
    value.includes('pressdown') ||
    value.includes('bayesian') ||
    value.includes('press-around') ||
    value.includes('pull-in') ||
    value.includes('shrug-in')
  ) {
    return 'cable'
  }

  if (
    value.includes('db ') ||
    value.includes('dumbbell') ||
    value.includes('arnold') ||
    value.includes('meadows row') ||
    value.includes('kroc row') ||
    value.includes('goblet squat')
  ) {
    return 'dumbbell'
  }

  if (
    value.includes('machine') ||
    value.includes('smith') ||
    value.includes('hack squat') ||
    value.includes('leg press') ||
    value.includes('pec deck') ||
    value.includes('pulldown') ||
    value.includes('seated calf raise') ||
    value.includes('lying leg curl') ||
    value.includes('seated leg curl') ||
    value.includes('reverse pec deck') ||
    value.includes('t-bar row')
  ) {
    return 'machine'
  }

  if (
    value.includes('barbell') ||
    value.includes('bench press') ||
    value.includes('squat') ||
    value.includes('deadlift') ||
    value.includes('hip thrust') ||
    value.includes('ez-bar') ||
    value.includes('larsen press')
  ) {
    return 'barbell'
  }

  return 'other'
}

function inferMuscle(name, dayType, explicitMuscle) {
  if (explicitMuscle) {
    return explicitMuscle
  }

  const value = name.toLowerCase()

  if (value.includes('curl') || value.includes('bicep')) {
    return 'biceps'
  }

  if (
    value.includes('tricep') ||
    value.includes('triceps') ||
    value.includes('skull crusher') ||
    value.includes('french press') ||
    value.includes('kickback') ||
    value.includes('overhead cable')
  ) {
    return 'triceps'
  }

  if (
    value.includes('lateral raise') ||
    value.includes('shoulder press') ||
    value.includes('arnold press') ||
    value.includes('y-raise') ||
    value.includes('face pull') ||
    value.includes('side delt')
  ) {
    return 'shoulders'
  }

  if (
    value.includes('chest press') ||
    value.includes('bench press') ||
    value.includes('flye') ||
    value.includes('pec deck') ||
    value.includes('push up') ||
    value.includes('pushup') ||
    value.includes('dip') ||
    value.includes('press-around') ||
    value.includes('pec static stretch')
  ) {
    return 'chest'
  }

  if (
    value.includes('pull-up') ||
    value.includes('chin-up') ||
    value.includes('pulldown') ||
    value.includes('row') ||
    value.includes('lat') ||
    value.includes('shrug')
  ) {
    return value.includes('shrug') ? 'traps' : 'back'
  }

  if (
    value.includes('hip thrust') ||
    value.includes('rdl') ||
    value.includes('deadlift') ||
    value.includes('leg curl') ||
    value.includes('nordic') ||
    value.includes('hyperextension') ||
    value.includes('glute ham')
  ) {
    return value.includes('hip thrust') ? 'glutes' : 'hamstrings'
  }

  if (
    value.includes('squat') ||
    value.includes('lunge') ||
    value.includes('step-up') ||
    value.includes('leg extension') ||
    value.includes('split squat')
  ) {
    return 'quads'
  }

  if (value.includes('calf') || value.includes('toe press')) {
    return 'calves'
  }

  if (
    value.includes('crunch') ||
    value.includes('plank') ||
    value.includes('leg raise') ||
    value.includes('ab wheel')
  ) {
    return 'abs'
  }

  switch (dayType) {
    case 'push':
      return 'chest'
    case 'pull':
      return 'back'
    case 'legs':
    case 'lower':
      return 'quads'
    default:
      return 'other'
  }
}

function exercise(dayType, config) {
  const { working_sets, warmup_sets } = parseSetCode(config.set_code)
  const resolvedName =
    config.name === 'N/A' && config.substitution_2
      ? stripGroupPrefix(config.substitution_2)
      : config.name

  return {
    name: resolvedName,
    warmup_sets,
    working_sets,
    rep_notation: config.rep_notation,
    rpe_notation: config.rpe_notation,
    rest_notation: config.rest_notation,
    coaching_cue: config.coaching_cue ?? null,
    substitution_1: config.substitution_1 ?? null,
    substitution_2: config.substitution_2 ?? null,
    group_id: config.group_id ?? null,
    group_order: config.group_order ?? null,
    equipment: inferEquipment(resolvedName, config.equipment),
    muscle: inferMuscle(resolvedName, dayType, config.muscle),
    set_code: config.set_code,
  }
}

function day(dayNumber, name, dayType, restNote, exercises) {
  return {
    day_number: dayNumber,
    name,
    day_type: dayType,
    rest_note: restNote,
    exercises: exercises.map((item, index) => ({
      display_order: index + 1,
      ...exercise(dayType, item),
    })),
  }
}

const DAY_VIDEO_URLS = {
  '1-1': [
    'https://youtu.be/k1S_Any3NIA?t=240',
    'https://youtu.be/0GW4HdrWlcQ',
    'https://www.youtube.com/watch?v=flr4ohSl0j8',
    'https://youtu.be/-MRNjTr6xrE?t=791',
    'https://youtu.be/B5ZoqtHClCA',
    'https://youtu.be/-9QsrJ542ao',
    'https://youtu.be/popGXI-qs98?t=336',
    'https://youtu.be/94DXwlcX8Po?t=327',
  ],
  '1-2': [
    'https://youtu.be/Hdc7Mw6BIEE?t=99',
    'https://youtu.be/Hdc7Mw6BIEE?t=99',
    'https://youtu.be/bsx8PIGIuaI',
    'https://youtu.be/f2JDJV0AnyY?t=36',
    'https://youtu.be/gxD9coWulU0',
    'https://youtu.be/qfc70k40318?t=311',
    'https://youtu.be/tw1h5XOD23Y',
    'https://youtu.be/7d5WEXB0W5Y',
  ],
  '1-3': [
    'https://youtu.be/htDXu61MPio',
    'https://youtu.be/HyFNlo47d8Y',
    'https://youtu.be/J46aPqFl0WE?t=178',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/qVek72z3F1U?t=683',
    'https://youtu.be/-qsRtp_PbVM?t=162',
    'https://youtu.be/zU6X6DLCH_U',
  ],
  '1-4': [
    'https://youtu.be/j8Q50oBDK44',
    'https://youtu.be/WqDwmwN56lY',
    'https://youtu.be/f2JDJV0AnyY?t=336',
    'https://youtu.be/j8Q50oBDK44',
    'https://youtu.be/i1YgFZB6alI?t=487',
    'https://youtu.be/_68eM9w5N1E',
  ],
  '1-5': [
    'https://youtu.be/xDmFkJxPzeM?t=97',
    'https://youtu.be/V5u2AP9wBwE',
    'https://youtu.be/Y4Vv2ASsyhs?t=536',
    'https://www.youtube.com/watch?v=e_48W0vlU58&feature=youtu.be',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/VJ_9xii47Sk',
    'https://youtu.be/CFPB3QT19rE',
  ],
  '2-1': [
    'https://youtu.be/k1S_Any3NIA?t=240',
    'https://youtu.be/b8fYnZ-usP0',
    'https://youtu.be/-9QsrJ542ao',
    'https://youtu.be/K4E8CXajqfQ',
    'https://youtu.be/94DXwlcX8Po?t=106',
  ],
  '2-2': [
    'https://youtu.be/j8Q50oBDK44',
    'https://youtu.be/djKXLt7kv7Q?t=115',
    'https://youtu.be/qfc70k40318?t=311',
    'https://youtu.be/tw1h5XOD23Y',
    'https://youtu.be/i1YgFZB6alI?t=487',
  ],
  '2-3': [
    'https://youtu.be/htDXu61MPio',
    'https://youtu.be/J46aPqFl0WE?t=178',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/VJ_9xii47Sk',
    'https://youtu.be/zU6X6DLCH_U',
  ],
  '2-4': [
    'https://youtu.be/j8Q50oBDK44',
    'https://www.youtube.com/watch?v=zOpA1Op0zvc',
    'https://youtu.be/bsx8PIGIuaI',
    'https://youtu.be/URQ1Wn7lY3A',
    'https://youtu.be/SJqInYJcg5k?t=653',
    'https://youtu.be/tw1h5XOD23Y',
    'https://youtu.be/C6UcPm7mdE4',
  ],
  '2-5': [
    'https://youtu.be/htDXu61MPio',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/qVek72z3F1U?t=683',
    'https://youtu.be/VJ_9xii47Sk',
    'https://youtu.be/zU6X6DLCH_U',
  ],
  '3-1': [
    'https://youtu.be/Kx53V2h3sqU',
    'https://www.youtube.com/watch?v=zOpA1Op0zvc',
    'https://youtu.be/-EIhKMDSjBY?t=151',
    'https://youtu.be/AYkYht1aA8o',
    'https://youtu.be/-AcB69YVt9s',
    'https://youtu.be/K4E8CXajqfQ',
    'https://youtu.be/_68eM9w5N1E',
  ],
  '3-2': [
    'https://youtu.be/Vf7wf6bZODQ',
    'https://youtu.be/-d2Uui6MtRk',
    'https://youtu.be/bsx8PIGIuaI',
    'https://youtu.be/NE41flyGBgk',
    'https://youtu.be/qfc70k40318?t=311',
    'https://youtu.be/tw1h5XOD23Y',
    'https://youtu.be/2Gt_Ip_ENv4',
    'https://youtu.be/P6PXY01u-DY',
  ],
  '3-3': [
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/J46aPqFl0WE?t=178',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/qVek72z3F1U?t=683',
    'https://youtu.be/-qsRtp_PbVM?t=162',
    'https://youtu.be/1G0y8D5rFDc?t=79',
  ],
  '3-4': [
    'https://youtu.be/URQ1Wn7lY3A',
    'https://youtu.be/URQ1Wn7lY3A',
    'https://youtu.be/j8Q50oBDK44',
    'https://www.youtube.com/watch?v=flr4ohSl0j8',
    'https://youtu.be/X6Ve340eVDs',
    'https://youtu.be/C6UcPm7mdE4',
    'https://youtu.be/i1YgFZB6alI?t=487',
  ],
  '3-5': [
    'https://youtu.be/xDmFkJxPzeM?t=97',
    'https://youtu.be/Y4Vv2ASsyhs?t=536',
    'https://youtu.be/v-mQm_droHg?t=489',
    'https://youtu.be/qVek72z3F1U?t=683',
    'https://youtu.be/VJ_9xii47Sk',
    'https://youtu.be/2RrGnjxSsiA?t=124',
  ],
}

function applyVideoUrls(program) {
  return {
    ...program,
    phases: program.phases.map((phase) => ({
      ...phase,
      days: phase.days.map((currentDay) => {
        const urls =
          DAY_VIDEO_URLS[`${phase.phase_number}-${currentDay.day_number}`] ?? []

        return {
          ...currentDay,
          exercises: currentDay.exercises.map((currentExercise, index) => ({
            ...currentExercise,
            video_url: urls[index] ?? null,
          })),
        }
      }),
    })),
  }
}

const baseProgram = {
  program_name: 'The Ultimate Push Pull Legs System',
  author: 'Jeff Nippard',
  source_filename: 'jeff_nippard_phases_and_workouts_only.pdf',
  days_per_week: 5,
  extraction_notes: [
    'Warm-up ranges like "3-4" were collapsed to the lower bound for the integer warmup_sets field. The original PDF shorthand is preserved in each exercise set_code.',
    'Rows that OCR returned as "N/A" but clearly represented a static hold or stretch were renamed from the corresponding cue or substitution text so the program remains importable.',
    'A few lower-body coaching cues in the PDF appear to describe a substitution option more directly than the primary lift; they were preserved as written.',
  ],
  phases: [
    {
      phase_number: 1,
      name: 'Base Hypertrophy',
      description: 'Moderate Volume, Moderate Intensity',
      num_weeks: 6,
      days: [
        day(1, 'Push #1', 'push', null, [
          {
            name: 'Machine Chest Press',
            set_code: '13-4',
            rep_notation: '3-5',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Set up a comfortable arch, quick pause on the chest and explode up on each rep.',
            substitution_1: 'DB Bench Press',
            substitution_2: 'Bench Press',
          },
          {
            name: 'Machine Chest Press (No Leg Drive)',
            set_code: '20',
            rep_notation: '10',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Shoulder blades still retracted and depressed. Slight arch in upper back. Zero leg drive.',
            substitution_1: 'DB Bench Press (No Leg Drive)',
            substitution_2: 'Larsen Press',
          },
          {
            name: 'Machine Shoulder Press',
            set_code: '32',
            rep_notation: '8-10',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Start with your elbows in front of you and palms facing in. Rotate the dumbbells so that your palms face forward as you press.',
            substitution_1: 'Seated DB Shoulder Press',
            substitution_2: 'Standing Dumbbell Arnold Press',
          },
          {
            name: 'Deficit Push Up',
            set_code: '21',
            rep_notation: '12-15',
            rpe_notation: '9-10',
            rest_notation: '0 min',
            coaching_cue:
              'Brace with your non-working arm, squeeze your pecs by pressing the cable across your body.',
            substitution_1: 'DB Flye',
            substitution_2: 'A1. Press-Around',
            group_id: 'A',
            group_order: 1,
          },
          {
            name: 'Pec Static Stretch 30s',
            set_code: '20',
            rep_notation: '30s HOLD',
            rpe_notation: 'N/A',
            rest_notation: '0 min',
            coaching_cue:
              'Hold a pec stretch for 30 seconds. The stretch should be held at about a 7/10 intensity.',
            substitution_2: 'A2. Pec Static Stretch 30s',
            group_id: 'A',
            group_order: 2,
          },
          {
            name: 'Machine Lateral Raise',
            set_code: '31',
            rep_notation: '12-15',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Think about swinging the cable out and up as if drawing a sword from your side.',
            substitution_1: 'DB Lateral Raise',
            substitution_2: 'Cross-Body Cable Y-Raise (Side Delt)',
          },
          {
            name: 'DB Skull Crusher (12-15 reps)',
            set_code: '31',
            rep_notation: '8+8',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Do the second half of the ROM for pressdowns (the squeeze) and the first half of the ROM for overhead extensions (the stretch).',
            substitution_1: 'Triceps Pressdown (12-15 reps)',
            substitution_2:
              'Squeeze-Only Triceps Pressdown + Stretch-Only Overhead Triceps Extension',
          },
          {
            name: 'Single-Arm Cable Tricep Kickback',
            set_code: '20',
            rep_notation: '10-12',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Extend your triceps with your arm more out to the side than a regular pressdown. Feel the stretch as the cable moves across your torso.',
            substitution_1: 'Single-Arm Tricep Pressdown',
            substitution_2: 'N1-Style Cross-Body Triceps Extension',
          },
        ]),
        day(2, 'Pull #1', 'pull', null, [
          {
            name: 'Pull-Up',
            set_code: '40',
            rep_notation: '10',
            rpe_notation: 'See Notes',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Do 4 feeder sets of 10 reps by gradually building the weight up from set to set. Set 1 is pretty light (RPE 4-5). Set 2 is a little heavier (RPE 6-7). Set 3 is a little heavier again (RPE 7-8). Set 4 is your hard set: try to hit failure at 10 reps on this last set.',
            substitution_1: 'Machine Pulldown',
            substitution_2: 'Lat Pulldown (Feeder Sets)',
          },
          {
            name: 'Pull-Up',
            set_code: '10',
            rep_notation: '10+5',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'After hitting failure at about 10 reps, do a dropset. Strip the weight back about 30-50% and do another 5 reps with nice and controlled technique.',
            substitution_1: 'Machine Pulldown',
            substitution_2: 'Lat Pulldown (Failure Set)',
          },
          {
            name: 'Cable Seated Row',
            set_code: '32',
            rep_notation: '10-12',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Use 3 different grips for the 3 working sets (ideally going from wider to closer).',
            substitution_1: 'Incline Chest-Supported DB Row',
            substitution_2: 'Omni-Grip Machine Chest-Supported Row',
          },
          {
            name: '1-Arm Lat Pull-In',
            set_code: '21',
            rep_notation: '10-12',
            rpe_notation: '9-10',
            rest_notation: '0 min',
            coaching_cue:
              'Do DB lat pullovers, but cut out the top half of the ROM (stay entirely in the stretched aspect of the lift).',
            substitution_1: 'Cable Lat Pullover',
            substitution_2: 'A1. Bottom-Half DB Lat Pullover',
            group_id: 'A',
            group_order: 1,
          },
          {
            name: 'Lat Static Stretch 30s',
            set_code: '20',
            rep_notation: '30s HOLD',
            rpe_notation: 'N/A',
            rest_notation: '0 min',
            coaching_cue:
              'Hold a lat stretch for 30 seconds. The stretch should be held at about a 7/10 intensity.',
            substitution_2: 'A2. Lat Static Stretch 30s',
            group_id: 'A',
            group_order: 2,
          },
          {
            name: 'Bent-Over Reverse DB Flye',
            set_code: '31',
            rep_notation: '12-15',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              '1st set: low-to-high. 2nd set: mid-range. 3rd set: high-to-low.',
            substitution_1: 'Reverse Cable Flye',
            substitution_2: 'Omni-Direction Face Pull',
            muscle: 'shoulders',
          },
          {
            name: 'Cable Curl',
            set_code: '31',
            rep_notation: '6-8',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Focus on contracting your biceps, minimize torso momentum.',
            substitution_1: 'DB Curl',
            substitution_2: 'EZ-Bar Curl',
          },
          {
            name: 'Bottom-Half Bayesian Curl',
            set_code: '20',
            rep_notation: '10-12',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Do preacher curls, but cut out the top half of the ROM (stay entirely in the stretched aspect of the lift).',
            substitution_1: 'Bottom-Half Spider Curl',
            substitution_2: 'Bottom-Half Preacher Curl',
          },
        ]),
        day(3, 'Legs #1', 'legs', 'Optional Rest Day', [
          {
            name: 'DB Bulgarian Split Squat',
            set_code: '13-4',
            rep_notation: '2-4',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Sit back and down, keep your upper back tight to the bar.',
            substitution_1: 'Hack Squat',
            substitution_2: 'Squat',
          },
          {
            name: 'Pause DB Bulgarian Split Squat',
            set_code: '20',
            rep_notation: '5',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Drop the weight by about 25% from your top set. 2 second pause. Sit back and down, keep your upper back tight to the bar.',
            substitution_1: 'Pause Hack Squat',
            substitution_2: 'Pause Squat (Back off)',
          },
          {
            name: '45° Hyperextension',
            set_code: '32',
            rep_notation: '8-10',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Maintain a neutral lower back, set your hips back, don't allow your spine to round.",
            substitution_1: 'DB RDL',
            substitution_2: 'Barbell RDL',
            equipment: 'other',
          },
          {
            name: 'Goblet Squat',
            set_code: '21',
            rep_notation: '10',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Take medium strides, minimize the amount you push off your rear leg.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Walking Lunge',
          },
          {
            name: 'Nordic Ham Curl',
            set_code: '31',
            rep_notation: '10-12',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Focus on squeezing your hamstrings to move the weight.',
            substitution_1: 'Lying Leg Curl',
            substitution_2: 'Seated Leg Curl',
          },
          {
            name: 'Standing Calf Raise',
            set_code: '41',
            rep_notation: '10-12',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Seated Calf Raise',
            substitution_2: 'Leg Press Toe Press',
          },
          {
            name: 'Machine Crunch',
            set_code: '31',
            rep_notation: '10-12',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Hold a plate or DB to your chest and crunch hard.',
            substitution_1: 'Cable Crunch',
            substitution_2: 'Decline Plate-Weighted Crunch',
          },
        ]),
        day(4, 'Upper #1', 'upper', null, [
          {
            name: 'Machine Pulldown',
            set_code: '22',
            rep_notation: '8-10',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              '1.5x shoulder width grip, pull your chest to the bar.',
            substitution_1: 'Lat Pulldown',
            substitution_2: 'Pull-Up',
          },
          {
            name: 'Close-Grip Machine Press',
            set_code: '32-3',
            rep_notation: '8, 5, 12',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Use about a 45° incline and a grip width just outside shoulder width.',
            substitution_1: 'Close-Grip DB Incline Press',
            substitution_2: 'Close-Grip Barbell Incline Press',
          },
          {
            name: 'Meadows Row',
            set_code: '32',
            rep_notation: '10-12',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Kroc rows are basically just a dumbbell row with mild cheating and a slightly more upright posture. Don't be afraid to go heavy and use straps if your grip is limiting.",
            substitution_1: 'Single-Arm DB Row',
            substitution_2: 'Kroc Row',
          },
          {
            name: 'Machine Lateral Raise',
            set_code: '31',
            rep_notation: '5, 15',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'First 5 reps: 5-second lowering phase. Last 15 reps: constant tension (no pausing at the bottom or top).',
            substitution_1: 'DB Lateral Raise',
            substitution_2:
              'Eccentric-Accentuated Cable Lateral Raise, Constant-Tension Cable Lateral Raise',
          },
          {
            name: 'DB Curl',
            set_code: '31',
            rep_notation: '10-12',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Curl across your body with your arm out to the side at about 60°.',
            substitution_1: 'DB Incline Curl',
            substitution_2: 'N1-Style Cross-Body Bicep Curl',
          },
          {
            name: 'Kneeling Modified Push Up',
            set_code: '10',
            rep_notation: 'AMRAP',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              'Place your hands close together on the ground so that they form a diamond shape and do as many pushups as possible with a smooth tempo.',
            substitution_1: 'Close-Grip Push Up',
            substitution_2: 'Diamond Pushup',
          },
        ]),
        day(5, 'Lower #1', 'lower', 'Mandatory 1-2 Rest Days', [
          {
            name: 'Barbell Hip Thrust',
            set_code: '13-4',
            rep_notation: '5',
            rpe_notation: '8-9',
            rest_notation: '~3-5 min',
            coaching_cue:
              'Brace your lats, chest tall, pull the slack out of the bar before lifting.',
            substitution_1: 'Trap Bar Deadlift',
            substitution_2: 'Deadlift',
            muscle: 'glutes',
          },
          {
            name: 'DB RDL',
            set_code: '20',
            rep_notation: '8',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Think about doing a high-hip conventional deadlift with a slight bend in the knees.',
            substitution_1: 'Barbell RDL',
            substitution_2: 'Stiff-Leg Deadlift',
          },
          {
            name: 'Walking Lunge',
            set_code: '42-3',
            rep_notation: '10-12',
            rpe_notation: '8-9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Medium width feet placement on the platform, don't allow your lower back to round.",
            substitution_1: 'Goblet Squat',
            substitution_2: 'Leg Press',
            muscle: 'quads',
          },
          {
            name: 'Lying Leg Curl',
            set_code: '31',
            rep_notation: '8-10',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Keep your hips straight, do Nordic ham curls if no GHR machine.',
            substitution_1: 'Nordic Ham Curl',
            substitution_2: 'Glute Ham Raise',
          },
          {
            name: 'Goblet Squat',
            set_code: '31',
            rep_notation: '8-10',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Control the weight with a 3-4 second negative.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Slow-Eccentric Leg Extension',
          },
          {
            name: 'Leg Press Toe Press',
            set_code: '41',
            rep_notation: '15-20',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Standing Calf Raise',
            substitution_2: 'Seated Calf Raise',
          },
          {
            name: 'Reverse Crunch',
            set_code: '31',
            rep_notation: '10-20',
            rpe_notation: '9-10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Don't swing your legs at the bottom, minimize momentum, tuck your knees towards your chest if lifting your legs straight out is too challenging.",
            substitution_1: 'Hanging Leg Raise',
            substitution_2: 'Roman Chair Leg Raise',
          },
        ]),
      ],
    },
    {
      phase_number: 2,
      name: 'Maximum Effort',
      description: 'Low Volume, High Intensity',
      num_weeks: 4,
      days: [
        day(1, 'Push #1', 'push', null, [
          {
            name: 'Machine Chest Press',
            set_code: '13-4',
            rep_notation: '3-5',
            rpe_notation: '8-9',
            rest_notation: '~3-5 min',
            coaching_cue:
              'Set up a comfortable arch, quick pause on the chest and explode up on each rep.',
            substitution_1: 'DB Bench Press',
            substitution_2: 'Bench Press',
          },
          {
            name: 'Incline Machine Press',
            set_code: '22',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Set the bench at a 45-60° incline, touch the bar to your upper chest with control.',
            substitution_1: 'Incline DB Press',
            substitution_2: 'High-Incline Smith Machine Press',
          },
          {
            name: 'Machine Lateral Raise',
            set_code: '32',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Lean away from the cable. Focus on squeezing your delts.',
            substitution_1: 'DB Lateral Raise',
            substitution_2: 'Egyptian Cable Lateral Raise',
          },
          {
            name: 'DB French Press',
            set_code: '22',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Do both arms at once, resist the negative.',
            substitution_1: 'DB Floor Skull Crusher',
            substitution_2: 'Overhead Cable Triceps Extension',
          },
          {
            name: 'Triceps Pressdown',
            set_code: '21',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Lean slightly forward, lock your elbow behind your torso (shoulder hyperextension).',
            substitution_1: 'DB Triceps Kickback',
            substitution_2: 'Cable Triceps Kickback',
          },
        ]),
        day(2, 'Pull #1', 'pull', null, [
          {
            name: 'Machine Pulldown',
            set_code: '33',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Pull your elbows down against your sides.',
            substitution_1: 'Neutral-Grip Pull-Up',
            substitution_2: 'Neutral-Grip Lat Pulldown',
          },
          {
            name: 'Single-Arm Row',
            set_code: '23',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Initiate the movement by squeezing your shoulder blades together, pull to your lower chest, avoid using momentum.',
            substitution_1: 'Meadows Row',
            substitution_2: 'Pendlay Row',
            equipment: 'other',
          },
          {
            name: 'Bent-Over Reverse DB Flye',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Swing the weight out, not back.',
            substitution_1: 'Reverse Cable Flye',
            substitution_2: 'Reverse Pec Deck',
            muscle: 'shoulders',
          },
          {
            name: 'Cable Curl',
            set_code: '22',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Arc the bar out not up, focus on squeezing your biceps.',
            substitution_1: 'DB Curl',
            substitution_2: 'EZ-Bar Curl',
          },
          {
            name: 'DB Curl',
            set_code: '11',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              'You can use slight momentum on the concentric, but control the eccentric with your elbows stationary.',
            substitution_1: 'Inverse Zottman Curl',
            substitution_2: 'Hammer Cheat Curl',
          },
        ]),
        day(3, 'Legs #1', 'legs', 'Optional Rest Day', [
          {
            name: 'Bulgarian Split Squat',
            set_code: '13-4',
            rep_notation: '3-5',
            rpe_notation: '8-9',
            rest_notation: '~3-5 min',
            coaching_cue:
              'Sit back and down, keep your upper back tight to the bar.',
            substitution_1: 'Machine Squat',
            substitution_2: 'Squat or Machine Squat',
          },
          {
            name: '45° Hyperextension',
            set_code: '23',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              "Maintain a neutral lower back, set your hips back, don't allow your spine to round.",
            substitution_1: 'DB RDL',
            substitution_2: 'Barbell RDL',
            equipment: 'other',
          },
          {
            name: 'Goblet Squat',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Focus on squeezing your quads to make the weight move.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Leg Extension',
          },
          {
            name: 'Leg Press Toe Press',
            set_code: '22',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Standing Calf Raise',
            substitution_2: 'Seated Calf Raise',
          },
          {
            name: 'Machine Crunch',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Round your back as you crunch.',
            substitution_1: 'Plate-Weighted Crunch',
            substitution_2: 'Cable Crunch',
          },
        ]),
        day(4, 'Upper #1', 'upper', null, [
          {
            name: 'Machine Pulldown',
            set_code: '23',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Use about 1.5x shoulder width grip. Add weight or use assistance as needed to hit RPE. Keep form as consistent as possible.',
            substitution_1: 'Wide-Grip Lat Pulldown',
            substitution_2: 'Wide-Grip Pull-Up',
          },
          {
            name: 'Standing DB Arnold Press',
            set_code: '23',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Bring the dumbbells all the way down, keep your torso upright.',
            substitution_1: 'Machine Shoulder Press',
            substitution_2: 'Seated DB Shoulder Press',
          },
          {
            name: 'Incline Chest-Supported DB Row',
            set_code: '13',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Focus on squeezing your shoulder blades together, drive your elbows down and back.',
            substitution_1: 'T-Bar Row',
            substitution_2: 'Close-Grip Seated Cable Row',
          },
          {
            name: 'DB Bench Press',
            set_code: '23',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Tuck your elbows at 45°, lean your torso forward 15°, shoulder width or slightly wider grip.',
            substitution_1: 'Machine Chest Press',
            substitution_2: 'Weighted Dip',
          },
          {
            name: 'Cable Lateral Raise',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Focus on squeezing your lateral delt to move the weight.',
            substitution_1: 'DB Lateral Raise',
            substitution_2: 'Machine Lateral Raise',
          },
          {
            name: 'Cable Curl',
            set_code: '12',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Alternate arms with each curl: do 1 rep with your right arm, one rep with your left arm. Repeat until you reach 4-6 reps with each arm.',
            substitution_1: 'EZ Bar Curl',
            substitution_2: 'Alternating DB Curl',
          },
          {
            name: 'DB Triceps Kickback',
            set_code: '12',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              'Focus on squeezing your triceps to move the weight.',
            substitution_1: 'Cable Triceps Kickback',
            substitution_2: 'Triceps Pressdown',
          },
        ]),
        day(5, 'Lower #1', 'lower', 'Mandatory 1-2 Rest Days', [
          {
            name: 'Bulgarian Split Squat',
            set_code: '23-4',
            rep_notation: '4-6',
            rpe_notation: '8-9',
            rest_notation: '~3-5 min',
            coaching_cue:
              'Allow your knees to come forward (past your toes), focus the tension on your quads.',
            substitution_1: 'Machine Squat',
            substitution_2: 'Hack Squat',
          },
          {
            name: 'Goblet Squat',
            set_code: '23',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Do 4-6 reps with each leg (8-12 total strides). Straps may be helpful if your grip becomes limiting.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Dumbbell Walking Lunge',
          },
          {
            name: 'Nordic Ham Curl',
            set_code: '22',
            rep_notation: '4-6',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Focus on squeezing your hamstrings to move the weight.',
            substitution_1: 'Lying Leg Curl',
            substitution_2: 'Seated Leg Curl',
          },
          {
            name: 'Leg Press Toe Press',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Seated Calf Raise',
            substitution_2: 'Standing Calf Raise',
          },
          {
            name: 'Machine Crunch',
            set_code: '22',
            rep_notation: '6-8',
            rpe_notation: '10',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Hold a plate or DB to your chest and crunch hard!',
            substitution_1: 'Cable Crunch',
            substitution_2: 'Decline Plate Weighted Crunch',
          },
        ]),
      ],
    },
    {
      phase_number: 3,
      name: 'Supercompensation',
      description: 'High Volume, Moderate Intensity',
      num_weeks: 3,
      days: [
        day(1, 'Push #1', 'push', null, [
          {
            name: 'Low Incline Smith Machine Press',
            set_code: '32',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              '15° bench angle, tuck your elbows on the negative, flare as you press.',
            substitution_1: 'Low Incline Machine Press',
            substitution_2: 'Low Incline DB Press',
          },
          {
            name: 'Standing DB Arnold Press',
            set_code: '32',
            rep_notation: '15',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Don't stop in between reps, keep smooth and controlled tension on the delts.",
            substitution_1: 'DB Shoulder Press',
            substitution_2: 'Machine Shoulder Press',
          },
          {
            name: 'Pec Deck',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Do one set with low cable position, one set with medium-height cable position, and one set with a high cable position.',
            substitution_1: 'Flat-To-Incline DB Flye',
            substitution_2: 'Cable Crossover Ladder',
          },
          {
            name: 'Constant-Tension Machine Lateral Raise',
            set_code: '31',
            rep_notation: '15',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              "Lean into a bench and do lateral raises. Keep tension - don't rest your arm against your side at the bottom.",
            substitution_1: 'Constant-Tension Cable Lateral Raise',
            substitution_2: 'A1: Lean-In Constant Tension DB Lateral Raise',
            group_id: 'A',
            group_order: 1,
          },
          {
            name: 'Side Delt Static Stretch (30s)',
            set_code: '30',
            rep_notation: '30s HOLD',
            rpe_notation: 'N/A',
            rest_notation: '0 min',
            coaching_cue:
              'Hold a side delt stretch for 30 seconds. The stretch should be held at about a 7/10 intensity.',
            substitution_2: 'A2: Side Delt Static Stretch (30s)',
            group_id: 'A',
            group_order: 2,
            muscle: 'shoulders',
          },
          {
            name: 'DB French Press',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Do both arms at once, resist the negative.',
            substitution_1: 'DB Floor Skull Crusher',
            substitution_2: 'Overhead Triceps Extension',
          },
          {
            name: 'Kneeling Modified Push Up',
            set_code: '10',
            rep_notation: 'AMRAP',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              'Place your hands on a medicine ball and do smooth, controlled pushups.',
            substitution_1: 'Close-Grip Push Up',
            substitution_2: 'Med-Ball Close Grip Pushup',
          },
        ]),
        day(2, 'Pull #1', 'pull', null, [
          {
            name: 'Cable Lat Pullover',
            set_code: '21',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Keep chest tall, keep elbow tucked in close to your torso, focus on squeezing your lat to move the weight.',
            substitution_1: '1-Arm Lat Pull-In',
            substitution_2: '1-Arm Half Kneeling Lat Pulldown',
          },
          {
            name: 'Chin-Up',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'One set wide grip (overhand), 1 set middle grip (overhand), 1 set close grip (underhand).',
            substitution_1: 'Omni-Grip Pull-Up',
            substitution_2: 'Omni-Grip Lat Pulldown',
          },
          {
            name: 'Incline Chest-Supported DB Row',
            set_code: '42',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Focus on squeezing your shoulder blades together on each rep.',
            substitution_1: 'Helms Row',
            substitution_2: 'Machine Low Row',
          },
          {
            name: 'Plate Shrug',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Set up two cable handles low and shrug up and in. Squeeze your upper traps to move the weight.',
            substitution_1: 'DB Shrug',
            substitution_2: 'Cable Shrug-In',
          },
          {
            name: 'Bent-Over Reverse DB Flye',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Swing the weight out, not back.',
            substitution_1: 'Reverse Cable Flye',
            substitution_2: 'Reverse Pec Deck',
            muscle: 'shoulders',
          },
          {
            name: 'Cable Curl',
            set_code: '12',
            rep_notation: '4-6',
            rpe_notation: '9',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Arc the bar out not up, focus on squeezing your biceps.',
            substitution_1: 'DB Curl',
            substitution_2: 'EZ-Bar Curl (Heavy)',
          },
          {
            name: "Cable Curl 21's",
            set_code: '20',
            rep_notation: '21',
            rpe_notation: '10',
            rest_notation: '0 min',
            coaching_cue:
              '7 reps seated, 7 reps standing full ROM, 7 reps bottom-half curls.',
            substitution_1: "DB Curl 21's",
            substitution_2: "A1: EZ-Bar Modified Bicep 21's",
            group_id: 'A',
            group_order: 1,
          },
          {
            name: 'Bicep Static Stretch (30s)',
            set_code: '20',
            rep_notation: '30s HOLD',
            rpe_notation: 'N/A',
            rest_notation: '0 min',
            coaching_cue:
              'Hold a bicep stretch for 30 seconds. The stretch should be held at about a 7/10 intensity.',
            substitution_2: 'A2: Bicep Static Stretch (30s)',
            group_id: 'A',
            group_order: 2,
          },
        ]),
        day(3, 'Legs #1', 'legs', 'Optional Rest Day', [
          {
            name: 'Goblet Squat',
            set_code: '32-3',
            rep_notation: '15',
            rpe_notation: '7-8',
            rest_notation: '~2-3 min',
            coaching_cue:
              "These will be challenging, let's push. Don't go so heavy that you miss reps. Be humble with your weight and focus on keeping your torso upright.",
            substitution_1: 'High-Bar Box Squat',
            substitution_2: 'Front Squat',
          },
          {
            name: '45° Hyperextension',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Emphasize the stretch in your hamstrings, prevent your lower back from rounding.",
            substitution_1: 'Barbell RDL',
            substitution_2: 'Dumbbell RDL',
            equipment: 'other',
          },
          {
            name: 'Goblet Squat',
            set_code: '31',
            rep_notation: '10',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Take medium strides, minimize the amount you push off your rear leg.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Walking Lunge',
          },
          {
            name: 'Nordic Ham Curl',
            set_code: '31',
            rep_notation: '8',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Lift with a slow tempo. The positive should take 3 seconds and the negative should take 3 seconds.',
            substitution_1: 'Lying Leg Curl',
            substitution_2: 'SLOW Seated Leg Curl (3 up, 3 down)',
          },
          {
            name: 'Standing Calf Raise',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Seated Calf Raise',
            substitution_2: 'Leg Press Toe Press',
          },
          {
            name: 'Plank',
            set_code: '30',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Contract your glutes and position your elbows under your eyes to make the plank more difficult.',
            substitution_1: 'Ab Wheel Rollout',
            substitution_2: 'LLPT Plank',
            equipment: 'bodyweight',
            muscle: 'abs',
          },
        ]),
        day(4, 'Upper #1', 'upper', null, [
          {
            name: 'Machine Chest Press',
            set_code: '13-4',
            rep_notation: '2-4',
            rpe_notation: '8-9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Set up a comfortable arch, quick pause on the chest and explode up on each rep.',
            substitution_1: 'DB Bench Press',
            substitution_2: 'Bench Press (Top Set)',
          },
          {
            name: 'Machine Chest Press',
            set_code: '10',
            rep_notation: 'AMRAP',
            rpe_notation: '10',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Use about 60% of the weight you used on your top set and do it for as many reps as possible. You should be in the range of 10-20+ reps on this set. Use a spotter and safety bars.',
            substitution_1: 'DB Bench Press',
            substitution_2: 'Bench Press (Back Off AMRAP)',
          },
          {
            name: 'Machine Pulldown',
            set_code: '62',
            rep_notation: '3',
            rpe_notation: '7-8',
            rest_notation: '~15 sec',
            coaching_cue:
              '6 cluster sets: 3 reps, rest 15s, repeat 6x. Keep form smooth and controlled.',
            substitution_1: 'Lat Pulldown',
            substitution_2: 'Pull-Up',
          },
          {
            name: 'Machine Shoulder Press',
            set_code: '32',
            rep_notation: '15',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              'Start with your elbows in front of you and palms facing in. Rotate the dumbbells so that your palms face forward as you press.',
            substitution_1: 'Seated DB Shoulder Press',
            substitution_2: 'Standing Dumbbell Arnold Press',
          },
          {
            name: 'Wide-Grip T-Bar Row',
            set_code: '102',
            rep_notation: '3',
            rpe_notation: '7-8',
            rest_notation: '~15 sec',
            coaching_cue:
              '10 cluster sets: 3 reps, rest 15s, repeat 10x. Keep form tight.',
            substitution_1: 'Wide-Grip Machine Row',
            substitution_2: 'Wide-Grip Cable Row',
          },
          {
            name: 'DB Triceps Kickback',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Focus on squeezing your triceps to move the weight.',
            substitution_1: 'Cable Triceps Kickback',
            substitution_2: 'Triceps Pressdown',
          },
          {
            name: 'DB Curl',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Keep your elbow behind your torso throughout the range of motion, focus on squeezing your bicep. Sets are per arm.',
            substitution_1: 'DB Incline Curl',
            substitution_2: 'Bayesian Cable Curl',
          },
        ]),
        day(5, 'Lower #1', 'lower', 'Mandatory 1-2 Rest Days', [
          {
            name: 'Barbell Hip Thrust',
            set_code: '23-4',
            rep_notation: '8',
            rpe_notation: '9',
            rest_notation: '~3-4 min',
            coaching_cue:
              'Brace your lats, chest tall, pull the slack out of the bar before lifting.',
            substitution_1: 'Trap Bar Deadlift',
            substitution_2: 'Deadlift',
            muscle: 'glutes',
          },
          {
            name: 'Walking Lunge',
            set_code: '22-3',
            rep_notation: '20',
            rpe_notation: '9',
            rest_notation: '~2-3 min',
            coaching_cue:
              "Medium width feet placement on the platform, don't allow your lower back to round.",
            substitution_1: 'Goblet Squat',
            substitution_2: 'Leg Press',
            muscle: 'quads',
          },
          {
            name: 'Goblet Squat',
            set_code: '51',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Focus on squeezing your quads to make the weight move.',
            substitution_1: 'DB Step-Up',
            substitution_2: 'Leg Extension',
          },
          {
            name: 'Nordic Ham Curl',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              'Focus on squeezing your hamstrings to make the weight move.',
            substitution_1: 'Seated Leg Curl',
            substitution_2: 'Lying Leg Curl',
          },
          {
            name: 'Leg Press Toe Press',
            set_code: '31',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Press all the way up to your toes, stretch your calves at the bottom, don't bounce.",
            substitution_1: 'Standing Calf Raise',
            substitution_2: 'Seated Calf Raise',
          },
          {
            name: 'Cable Crunch',
            set_code: '30',
            rep_notation: '20',
            rpe_notation: '10',
            rest_notation: '~1-2 min',
            coaching_cue:
              "Clear your upper back off the floor when you crunch, hold for 1-2 seconds and then go back down. Don't yank with your neck.",
            substitution_1: 'Plate-Weighted Crunch',
            substitution_2: 'Corpse Crunch',
            muscle: 'abs',
          },
        ]),
      ],
    },
  ],
}

const program = applyVideoUrls(baseProgram)

mkdirSync(resolve(SCRIPT_DIR, '../extracted'), { recursive: true })
writeFileSync(OUTPUT_PATH, `${JSON.stringify(program, null, 2)}\n`, 'utf8')

console.log(`Wrote ${OUTPUT_PATH}`)
