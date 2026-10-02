/**
 * Shared presentational controls.
 *
 * These are deliberately free of laboratory data so they can be reused by
 * every screen and by any future installation.
 */

import type { FormEvent, ReactNode } from "react"
import { AlertCircle, CheckCircle2, Search, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

export function IconButton({
  icon: Icon,
  label,
  onClick,
  className = "",
  title,
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  className?: string
  title?: string
}) {
  return (
    <button
      type="button"
      title={title || label}
      aria-label={label}
      className={`icon-button ${className}`}
      onClick={(event) => {
        // Action buttons usually sit inside a clickable table row. Without this,
        // acting on a record would also fire the row's "open record" handler.
        event.stopPropagation()
        onClick?.()
      }}
    >
      <Icon size={19} strokeWidth={1.9} />
    </button>
  )
}

export function Button({
  children,
  icon: Icon,
  variant = "primary",
  onClick,
  disabled = false,
  type = "button",
  className = "",
}: {
  children: ReactNode
  icon?: LucideIcon
  variant?: "primary" | "secondary" | "ghost" | "danger"
  onClick?: () => void
  disabled?: boolean
  type?: "button" | "submit"
  className?: string
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant} ${className}`}
    >
      {Icon && <Icon size={18} strokeWidth={2} />}
      {children}
    </button>
  )
}

const BADGE_TONES: Record<string, string> = {
  Paid: "green",
  Ready: "green",
  Completed: "green",
  Verified: "green",
  Normal: "green",
  Active: "green",
  Negative: "green",
  Partial: "amber",
  Processing: "amber",
  Collected: "amber",
  High: "amber",
  Low: "amber",
  Positive: "amber",
  Unpaid: "red",
  Critical: "red",
  Rejected: "red",
  Disabled: "red",
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const text = String(children)
  const resolved = tone || BADGE_TONES[text] || "blue"
  return (
    <span className={`badge badge-${resolved}`}>
      <span className="badge-dot" />
      {children}
    </span>
  )
}

/**
 * Options are written as `Label (storedValue)` when the operator should read a
 * friendly name but the database needs an id. A plain string is used as both the
 * label and the value.
 *
 * The parenthesized part only counts as a stored value when it looks like an
 * identifier, i.e. it has no whitespace. Payment methods and sample types are
 * free text that a customer can edit, and a method such as `Cash (Official
 * Receipt)` must keep its full wording instead of silently being stored as
 * `Official Receipt`.
 */
const splitOption = (option: string): { label: string; value: string } => {
  const match = /^(.*?)\s*\(([^()\s]+)\)$/.exec(option)
  if (match && match[1].trim()) return { label: match[1].trim(), value: match[2].trim() }
  return { label: option, value: option }
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  options,
  hint,
  error,
  min,
  max,
  step,
  disabled,
  autoFocus,
  list,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  options?: readonly string[]
  hint?: string
  error?: string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  autoFocus?: boolean
  list?: string
}) {
  return (
    <label className={`field ${error ? "field-error" : ""}`}>
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          {!value && <option value="">Select {label.toLowerCase()}</option>}
          {options.map((option) => {
            const { label: text, value: stored } = splitOption(option)
            return (
              <option key={stored} value={stored}>
                {text}
              </option>
            )
          })}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          autoFocus={autoFocus}
          list={list}
        />
      )}
      {error ? <small className="field-error-text">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  required,
  hint,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  disabled?: boolean
  required?: boolean
  hint?: string
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required"> *</span>}
      </span>
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function SearchField({
  value,
  onChange,
  placeholder,
  id,
  autoFocus,
  wide,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  id?: string
  autoFocus?: boolean
  wide?: boolean
}) {
  return (
    <div className={`search-field ${wide ? "search-field-wide" : ""}`}>
      <Search size={20} />
      <input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="switch-row">
      <div>
        <strong>{label}</strong>
        {description && <p>{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch ${checked ? "on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Empty({
  title,
  detail,
  action,
  onAction,
}: {
  title: string
  detail: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Search size={26} />
      </div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action && (
        <Button icon={AlertCircle} onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  )
}

export type Toast = { message: string; tone: "success" | "warning" | "error" }

export function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  return (
    <div role="status" className={`toast toast-${toast.tone}`}>
      {toast.tone === "success" ? (
        <CheckCircle2 size={19} />
      ) : (
        <AlertCircle size={19} />
      )}
      {toast.message}
      <button aria-label="Dismiss notification" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  )
}

export type ConfirmRequest = {
  title: string
  body: string
  confirm: string
  onConfirm: () => void
  danger?: boolean
}

export function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest
  onCancel: () => void
}) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className={`modal-icon ${request.danger ? "danger" : ""}`}>
          {request.danger ? <AlertCircle size={25} /> : <CheckCircle2 size={25} />}
        </div>
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.body}</p>
        <div className="modal-actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={request.danger ? "danger" : "primary"} onClick={request.onConfirm}>
            {request.confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  )
}

export { AlertCircle, CheckCircle2 }
export type { FormEvent }
