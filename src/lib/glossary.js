import glossaryDatasetRaw from '../data/ultimate_ppl_glossary_dataset.jsonl?raw'

function toTitleCase(value = '') {
  return value.replace(/\b\w/g, (character) => character.toUpperCase())
}

function slugify(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeLookupKey(value = '') {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitInlineList(value = '') {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function createAppEntry(entry) {
  return {
    aliases: [],
    relatedTerms: [],
    sourceSection: null,
    kind: 'app',
    ...entry,
  }
}

function createDatasetEntry(entry) {
  return {
    id: slugify(entry.term),
    label: entry.term.trim(),
    category: toTitleCase(entry.category.trim()),
    short: entry.definition.trim(),
    detail: null,
    aliases: splitInlineList(entry.aliases),
    relatedTerms: splitInlineList(entry.related_terms),
    sourceSection: entry.source_section?.trim() || null,
    kind: 'dataset',
  }
}

const DATASET_GLOSSARY_ENTRIES = glossaryDatasetRaw
  .trim()
  .split(/\n+/)
  .filter(Boolean)
  .map((line) => JSON.parse(line))
  .map(createDatasetEntry)

const APP_GLOSSARY_ENTRIES = [
  createAppEntry({
    id: 'workout_os',
    label: 'Workout OS',
    category: 'Interface Language',
    short: 'The app framed as a full operating system for training.',
    detail:
      'Workout OS is product language. It means the app is meant to behave like a full control environment for planning, tracking, and reviewing training, not just a simple logbook.',
  }),
  createAppEntry({
    id: 'command_deck',
    label: 'Command Deck',
    category: 'Interface Language',
    short: 'The main home screen for live training status.',
    detail:
      'Command Deck is the central dashboard. It surfaces the current phase, today’s training day, progress through the program, and recent session history in one place.',
  }),
  createAppEntry({
    id: 'program',
    label: 'Program',
    category: 'Program Structure',
    short: 'A full training plan made up of phases, weeks, and days.',
    detail:
      'In IRON, a program is the whole training system you are running. It contains every phase, week, day, and prescribed exercise in the cycle.',
  }),
  createAppEntry({
    id: 'phase',
    label: 'Phase',
    category: 'Program Structure',
    short: 'A block inside a program with its own goal and length.',
    detail:
      'A phase is a focused chunk of training, such as hypertrophy, strength, or peak work. It usually lasts several weeks before the program moves into the next block.',
  }),
  createAppEntry({
    id: 'week',
    label: 'Week',
    category: 'Program Structure',
    short: 'One seven-day slice of the current phase.',
    detail:
      'Weeks are the main pacing unit inside a phase. They help you track where you are in the block and when exercise stress or load changes.',
  }),
  createAppEntry({
    id: 'working_sets',
    label: 'Working Sets',
    category: 'Session Flow',
    short: 'The sets that count toward the actual training stimulus.',
    detail:
      'Working sets are the main sets of the lift, after warm-ups are done. These are the sets that usually drive strength, muscle, and most of your meaningful volume.',
    aliases: ['Hard Set', 'Working Set'],
  }),
  createAppEntry({
    id: 'warmup_sets',
    label: 'Warm-Up Sets',
    category: 'Session Flow',
    short: 'Prep sets used to ramp into the main work.',
    detail:
      'Warm-up sets help you prepare joints, technique, and effort before the heavier working sets. They are not usually counted as training volume in the same way.',
    aliases: ['Warm-Up Set', 'Warmup Set'],
  }),
  createAppEntry({
    id: 'superset',
    label: 'Superset',
    category: 'Session Flow',
    short: 'Two exercises alternated before resting.',
    detail:
      'A superset means you perform one exercise, move to the paired exercise, and only then take the prescribed rest. It is often shown with labels like A1 and A2.',
  }),
  createAppEntry({
    id: 'ghost_data',
    label: 'Ghost Data',
    category: 'Session Flow',
    short: 'Your most recent numbers for the same lift and day.',
    detail:
      'Ghost data is a memory prompt. It shows what you last did on that exercise so you can judge whether to match it, beat it, or hold steady.',
  }),
  createAppEntry({
    id: 'volume',
    label: 'Volume',
    category: 'Performance Metrics',
    short: 'The total load moved, usually weight times reps.',
    detail:
      'In this app, volume is calculated from working sets only. It is the sum of weight multiplied by reps, which gives a rough picture of total training work.',
    aliases: ['Training Volume'],
  }),
  createAppEntry({
    id: 'pr',
    label: 'PR',
    category: 'Performance Metrics',
    short: 'A personal record on a lift or metric.',
    detail:
      'A PR is a new best. That could mean the heaviest weight ever used, a stronger estimated one-rep max, or the best weight at a specific rep count.',
    aliases: ['Personal Record'],
  }),
  createAppEntry({
    id: 'estimated_1rm',
    label: 'Estimated 1RM',
    category: 'Performance Metrics',
    short: 'A calculated estimate of your one-rep max.',
    detail:
      'Estimated 1RM, often shortened to e1RM, uses the weight and reps from a set to estimate what you could lift for a single rep. It helps track strength without maxing out.',
    aliases: ['e1RM'],
  }),
  createAppEntry({
    id: 'inol',
    label: 'INOL',
    category: 'Performance Metrics',
    short: 'A training stress score built from reps and relative intensity.',
    detail:
      'INOL stands for intensity number of lifts. It is a compact way to estimate how stressful a set or session was based on how heavy the load was relative to your max and how many reps you performed.',
    aliases: ['Intensity Number of Lifts'],
  }),
  createAppEntry({
    id: 'sfr',
    label: 'Strength-to-Fatigue Ratio',
    category: 'Performance Metrics',
    short: 'A snapshot of how much performance dropped from the first set to the last.',
    detail:
      'SFR compares your estimated strength on the first working set against the last working set of the same exercise. Bigger drops suggest more fatigue accumulated during the session.',
    aliases: ['SFR'],
  }),
  createAppEntry({
    id: 'dots',
    label: 'DOTS',
    category: 'Performance Metrics',
    short: 'A relative strength score that adjusts total lifted for bodyweight.',
    detail:
      'DOTS is a coefficient-based strength score used in powerlifting. It helps compare strength performance while accounting for bodyweight rather than looking only at raw kilos lifted.',
  }),
  createAppEntry({
    id: 'rest_discipline',
    label: 'Rest Discipline',
    category: 'Performance Metrics',
    short: 'How closely your actual rest matched the prescribed rest.',
    detail:
      'Rest discipline is a compliance score. If you rest close to what the program asked for, the score stays high. Long overruns pull it down.',
  }),
  createAppEntry({
    id: 'rpe',
    label: 'RPE',
    category: 'Recovery & Effort',
    short: 'Rate of Perceived Exertion, a 1-10 effort scale.',
    detail:
      'RPE describes how hard a set felt. An RPE 10 set means no reps were left in the tank, while lower values suggest you could have done more.',
    aliases: ['Rate of Perceived Exertion'],
  }),
  createAppEntry({
    id: 'session_rpe',
    label: 'Session RPE',
    category: 'Recovery & Effort',
    short: 'Your overall effort rating for the whole workout.',
    detail:
      'Session RPE is the single effort score you assign to the full session, rather than to one set. It helps compare how demanding different days felt.',
    aliases: ['Session Effort'],
  }),
  createAppEntry({
    id: 'overrun',
    label: 'Rest Overrun',
    category: 'Recovery & Effort',
    short: 'Extra rest taken beyond the prescribed rest window.',
    detail:
      'An overrun happens when actual rest goes past the planned rest time. Small overruns can be harmless, but repeated large ones can change the session stimulus.',
    aliases: ['Overrun'],
  }),
]

const mergedEntries = [...DATASET_GLOSSARY_ENTRIES, ...APP_GLOSSARY_ENTRIES].reduce((map, entry) => {
  map.set(entry.id, entry)
  return map
}, new Map())

export const GLOSSARY_TERMS = Object.freeze(Object.fromEntries(mergedEntries.entries()))

const CATEGORY_PRIORITY = [
  'Interface Language',
  'Program Structure',
  'Session Flow',
  'Performance Metrics',
  'Recovery & Effort',
]

function compareCategories(left, right) {
  const leftIndex = CATEGORY_PRIORITY.indexOf(left)
  const rightIndex = CATEGORY_PRIORITY.indexOf(right)

  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  }

  return left.localeCompare(right)
}

export const GLOSSARY_CATEGORIES = Object.freeze(
  Array.from(new Set(Object.values(GLOSSARY_TERMS).map((entry) => entry.category))).sort(
    compareCategories,
  ),
)

const GLOSSARY_LOOKUP = Object.values(GLOSSARY_TERMS).reduce((lookup, entry) => {
  const keys = [entry.id, entry.label, ...entry.aliases]

  keys.forEach((key) => {
    const normalizedKey = normalizeLookupKey(key)

    if (normalizedKey && !lookup.has(normalizedKey)) {
      lookup.set(normalizedKey, entry)
    }
  })

  return lookup
}, new Map())

export function getGlossaryEntry(termId) {
  if (!termId) {
    return null
  }

  const directMatch = GLOSSARY_TERMS[termId]

  if (directMatch) {
    return directMatch
  }

  return GLOSSARY_LOOKUP.get(normalizeLookupKey(termId)) ?? null
}

export function getGlossaryEntries() {
  return Object.values(GLOSSARY_TERMS).sort((left, right) => left.label.localeCompare(right.label))
}

export function groupGlossaryEntries() {
  const entries = getGlossaryEntries()

  return GLOSSARY_CATEGORIES.map((category) => ({
    category,
    entries: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.entries.length)
}
