import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { extractProgramFromPdf } from '../../lib/pdfExtract.js'

function isPdfFile(file) {
  return Boolean(file) && (
    file.type === 'application/pdf' ||
    file.name?.toLowerCase().endsWith('.pdf')
  )
}

function PdfUpload({ onExtracted }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSelectedFile(file) {
    if (!isPdfFile(file)) {
      setError('Please upload a PDF file.')
      return
    }

    setIsLoading(true)
    setError('')

    const result = await extractProgramFromPdf(file)

    setIsLoading(false)

    if (result?.error) {
      setError(result.error)
      return
    }

    onExtracted?.(result)
  }

  function openFilePicker() {
    if (isLoading) {
      return
    }

    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.click()
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)

    const [file] = event.dataTransfer.files ?? []

    if (file) {
      void handleSelectedFile(file)
    }
  }

  const containerClassName = [
    'bg-iron-800 rounded-2xl border-2 border-dashed border-iron-600 p-10 text-center transition-colors duration-200',
    isDragging ? 'border-gold bg-gold/5' : '',
    !isLoading ? 'cursor-pointer hover:border-gold hover:bg-gold/5' : 'pointer-events-none',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(event) => {
          const [file] = event.target.files ?? []

          if (file) {
            void handleSelectedFile(file)
          }
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={containerClassName}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            openFilePicker()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          setIsDragging(false)
        }}
        onDrop={handleDrop}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-gold">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-gold/25 border-t-gold" />
            <p className="animate-pulse text-[15px] font-medium">
              Extracting program structure...
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4">
            <p className="max-w-md text-[15px] leading-6 text-coral">{error}</p>
            <button
              type="button"
              className="rounded-full border border-coral/30 bg-coral/10 px-4 py-2 text-[13px] font-semibold text-coral transition hover:border-coral/50 hover:bg-coral/15"
              onClick={(event) => {
                event.stopPropagation()
                setError('')
                openFilePicker()
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <Upload size={40} className="text-zinc-600" />
            <p className="text-[15px] text-zinc-400">Drop your program PDF here</p>
            <p className="text-[13px] text-zinc-600">or click to browse</p>
          </div>
        )}
      </div>
    </>
  )
}

export default PdfUpload
