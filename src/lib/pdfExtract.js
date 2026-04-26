const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY?.trim() ?? ''
const ANTHROPIC_API_KEY_PLACEHOLDER = 'your-claude-api-key'

const EXTRACTION_PROMPT = `You are a workout program data extractor. Analyze this training program PDF and extract its COMPLETE structure.

Return ONLY a valid JSON object with NO markdown formatting, NO backticks, NO explanation. Just raw JSON.

Schema:
{
  "program_name": "string",
  "author": "string or null",
  "phases": [
    {
      "phase_number": 1,
      "name": "Phase name (e.g. Base Hypertrophy)",
      "description": "Phase description (e.g. Moderate Volume, Moderate Intensity)",
      "num_weeks": 4,
      "days": [
        {
          "day_number": 1,
          "name": "Day name exactly as written (e.g. Push #1, Upper A)",
          "day_type": "push|pull|legs|upper|lower|full_body|other",
          "rest_note": "Any rest day annotation after this day, or null",
          "exercises": [
            {
              "display_order": 1,
              "name": "Exercise name exactly as written",
              "warmup_sets": 0,
              "working_sets": 3,
              "rep_notation": "Reps exactly as written: 3-5, 10, 10+5, 8+8, 30s HOLD, AMRAP, 8,5,12 etc.",
              "rpe_notation": "RPE exactly as written: 8-9, 10, N/A, See Notes etc.",
              "rest_notation": "Rest exactly as written: ~3-4 min, ~1-2 min, 0 min etc.",
              "coaching_cue": "The notes/instructions column content, or null",
              "substitution_1": "First substitution option, or null",
              "substitution_2": "Second substitution option, or null",
              "group_id": "Superset letter (A, B, C) if exercise is part of a superset, or null",
              "group_order": 1,
              "equipment": "barbell|dumbbell|cable|machine|bodyweight|other",
              "muscle": "Primary muscle group"
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Extract EVERY exercise from EVERY day from EVERY week/phase
- If the program has phases (Phase 1, Phase 2, etc.), create separate phase objects
- If the program repeats the same exercises across weeks within a phase (just with different loads), only extract ONE week of exercises per phase — note the num_weeks
- If exercises change week to week, create separate weeks within the phase
- Supersets are indicated by A1/A2, B1/B2 notation — set group_id to the letter, group_order to the number
- Keep rep_notation exactly as written in the program — do not normalize
- Extract warm-up sets and working sets as SEPARATE numbers
- Include ALL coaching cues/notes from the program`

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const base64 = result.includes(',') ? result.split(',')[1] : result

      if (!base64) {
        reject(new Error('Failed to convert PDF to base64.'))
        return
      }

      resolve(base64)
    }

    reader.onerror = () => {
      reject(new Error('Failed to read the PDF file.'))
    }

    reader.readAsDataURL(file)
  })
}

function getApiKey() {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === ANTHROPIC_API_KEY_PLACEHOLDER) {
    return null
  }

  return ANTHROPIC_API_KEY
}

function extractTextContent(responseBody) {
  const firstBlock = responseBody?.content?.[0]

  if (typeof firstBlock?.text === 'string') {
    return firstBlock.text
  }

  const textBlock = responseBody?.content?.find((block) => typeof block?.text === 'string')

  return textBlock?.text ?? null
}

export async function extractProgramFromPdf(file) {
  try {
    if (!(file instanceof File)) {
      return { error: 'A valid PDF file is required.' }
    }

    const apiKey = getApiKey()

    if (!apiKey) {
      return { error: 'Missing Anthropic API key. Set VITE_ANTHROPIC_API_KEY.' }
    }

    const base64 = await readFileAsBase64(file)

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    })

    const responseBody = await response.json()

    if (!response.ok) {
      const apiMessage =
        responseBody?.error?.message ??
        responseBody?.message ??
        'Anthropic API request failed.'

      return { error: apiMessage }
    }

    const rawText = extractTextContent(responseBody)

    if (!rawText) {
      return { error: 'Anthropic response did not include text content.' }
    }

    return JSON.parse(rawText)
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown extraction error.' }
  }
}

export { EXTRACTION_PROMPT }
