/**
 * Logo upload control.
 *
 * The image is read into a data URL and stored with the laboratory profile, so
 * it travels inside backups and restores with the laboratory. Validation keeps
 * the profile within a sensible size and rejects anything that is not an
 * image.
 */

import { useRef, useState } from "react"
import { FileUp, Trash2, Upload } from "lucide-react"

const MAX_BYTES = 512 * 1024

export const ACCEPTED_LOGO_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
]

export type LogoCheck = { ok: boolean; error?: string }

/** Validates a candidate logo file without reading it. Shared with the wizard. */
export const validateLogoFile = (file: File): LogoCheck => {
  if (!ACCEPTED_LOGO_TYPES.includes(file.type)) {
    return { ok: false, error: "Choose a PNG, JPG, JPEG, SVG or WEBP image." }
  }
  if (file.size > MAX_BYTES) {
    return {
      ok: false,
      error: "That image is larger than 512 KB. Please use a smaller file.",
    }
  }
  return { ok: true }
}

export const readLogoFile = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("The image could not be read."))
    reader.readAsDataURL(file)
  })

type LogoUploadProps = {
  logo: string
  onChange: (logo: string) => void
  onError?: (message: string) => void
  /** Rendered when no logo is set. */
  fallback?: React.ReactNode
  id?: string
}

export default function LogoUpload({
  logo,
  onChange,
  onError,
  fallback,
  id = "logo-upload",
}: LogoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const check = validateLogoFile(file)
    if (!check.ok) return onError?.(check.error ?? "That file cannot be used as a logo.")
    try {
      onChange(await readLogoFile(file))
    } catch (error) {
      onError?.((error as Error).message)
    } finally {
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="logo-upload">
      <div
        className={`logo-dropzone ${dragging ? "dragging" : ""} ${logo ? "has-logo" : ""}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFile(e.dataTransfer.files?.[0])
        }}
      >
        <div className="logo-preview">
          {logo ? <img src={logo} alt="Laboratory logo preview" /> : (fallback ?? <FileUp size={26} />)}
        </div>
        <div className="logo-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={16} /> {logo ? "Replace logo" : "Upload logo"}
          </button>
          {logo && (
            <button type="button" className="btn btn-ghost" onClick={() => onChange("")}>
              <Trash2 size={16} /> Remove
            </button>
          )}
          <small>PNG, JPG, SVG or WEBP · up to 512 KB</small>
        </div>
      </div>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(",")}
        className="hidden-file"
        aria-label="Upload laboratory logo"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  )
}
