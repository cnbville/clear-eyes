import { useState } from 'react'
import PdfUpload from '../components/programs/PdfUpload.jsx'
import { saveProgram } from '../lib/programSaver.js'
import { isConfigured, supabase } from '../lib/supabase.js'
import ImportPreviewPage from './ImportPreviewPage.jsx'

function HomePage() {
  const [extractedData, setExtractedData] = useState(null)
  const [status, setStatus] = useState({
    tone: 'neutral',
    message: '',
  })

  async function handleConfirm(editedData) {
    if (!isConfigured) {
      const result = {
        success: false,
        program_id: null,
        error: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before saving.',
      }

      setStatus({
        tone: 'error',
        message: result.error,
      })

      return result
    }

    setStatus({
      tone: 'loading',
      message: 'Saving imported program to Supabase...',
    })

    const result = await saveProgram(supabase, editedData)

    if (result.success) {
      setExtractedData(null)
      setStatus({
        tone: 'success',
        message: `Program imported successfully. Active program id: ${result.program_id}`,
      })
    } else {
      setStatus({
        tone: 'error',
        message: result.error,
      })
    }

    return result
  }

  function handleCancel() {
    setExtractedData(null)
  }

  const statusClassName = {
    neutral: 'border-white/[0.04] bg-iron-800 text-zinc-300',
    loading: 'border-gold/20 bg-gold-dim text-gold-light',
    success: 'border-mint/20 bg-mint/10 text-mint',
    error: 'border-coral/20 bg-coral/10 text-coral',
  }[status.tone]

  if (extractedData) {
    return (
      <section className="space-y-4">
        <div className="rounded-[1.75rem] border border-white/[0.04] bg-iron-800 p-5">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-gold-light">
            Import Preview
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
            Review every phase, day, and exercise before the importer writes the
            program backbone into Supabase.
          </p>
        </div>

        {status.message ? (
          <div className={`rounded-2xl border px-4 py-3 text-[13px] ${statusClassName}`}>
            {status.message}
          </div>
        ) : null}

        <ImportPreviewPage
          extractedData={extractedData}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <article className="rounded-[2rem] border border-iron-600 bg-iron-800/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.3)] sm:p-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-gold-light">
          Program Import
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">
          Turn any training PDF into a structured, editable program.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-300">
          Upload a program PDF, let Claude extract the structure, review the result,
          and save the confirmed version into your Supabase schema as the active plan.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <span className="rounded-full border border-gold/20 bg-gold-dim px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-gold-light">
            Claude PDF extraction
          </span>
          <span className="rounded-full border border-sky/20 bg-sky/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-sky">
            Editable review step
          </span>
          <span className="rounded-full border border-mint/20 bg-mint/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em] text-mint">
            Supabase persistence
          </span>
        </div>
      </article>

      {status.message ? (
        <div className={`rounded-2xl border px-4 py-3 text-[13px] ${statusClassName}`}>
          {status.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <PdfUpload
          onExtracted={(programData) => {
            setStatus({
              tone: 'neutral',
              message: '',
            })
            setExtractedData(programData)
          }}
        />

        <aside className="rounded-[2rem] border border-iron-600 bg-iron-800/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-zinc-500">
            Import Checklist
          </p>
          <div className="mt-5 space-y-3">
            {[
              'Upload a PDF and let Claude read the program structure.',
              'Review the extracted phases, days, and exercises before saving.',
              isConfigured
                ? 'Supabase is configured and ready to receive the imported program.'
                : 'Supabase save is not configured yet. Upload and review still work.',
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/5 bg-iron-700/70 px-4 py-3 text-sm leading-6 text-zinc-200"
              >
                {item}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}

export default HomePage
