/**
 * Sign-in screen.
 *
 * The laboratory identity shown here comes from configuration. Credentials are
 * checked against the accounts this installation created during setup — there
 * is no default user and no universal password.
 */

import { useState, type FormEvent } from "react"
import { AlertCircle, Eye, FlaskConical, KeyRound, LogIn, UserCheck } from "lucide-react"
import { useLab } from "../app/LabProvider"
import { PRODUCT_NAME, PRODUCT_SUBTITLE, PRODUCT_VERSION, VENDOR } from "../core/product"
import Brand, { ProductMark } from "./Brand"
import { Button, Field } from "./controls"

export default function LoginScreen() {
  const { db, signIn } = useLab()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const labName = db.profile.name

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!username.trim()) return setError("Enter your username.")
    if (!password) return setError("Enter your password.")
    setBusy(true)
    const result = await signIn(username, password)
    setBusy(false)
    if (!result.ok) setError(result.error ?? "Sign-in failed.")
  }

  return (
    <div className="login-page">
      <div className="login-brand-panel">
        <div className="login-brand-inner">
          <Brand context="login" size="lg" />
          <div className="login-illustration">
            <div className="illustration-orbit orbit-one" />
            <div className="illustration-orbit orbit-two" />
            <div className="illustration-center">
              <FlaskConical size={64} strokeWidth={1.2} />
            </div>
            <div className="illustration-cross cross-one">+</div>
            <div className="illustration-cross cross-two">+</div>
          </div>
          <h1>
            Care begins with
            <br />
            clarity.
          </h1>
          <p>
            A simpler way to manage your laboratory, from registration to final
            report.
          </p>
        </div>
        <div className="login-copyright">
          {labName ? `© ${new Date().getFullYear()} ${labName}` : `© ${new Date().getFullYear()}`}{" "}
          · {PRODUCT_NAME} {PRODUCT_VERSION}
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <Brand context="login" size="md" />
          </div>

          <div className="login-eyebrow">
            <span className="live-dot" /> SECURE STAFF ACCESS
          </div>
          <h2>Welcome back</h2>
          <p>
            {labName
              ? `Sign in to the ${labName} workspace.`
              : "Sign in to your workspace to get started."}
          </p>
          <form onSubmit={submit}>
            <Field
              label="Username"
              value={username}
              onChange={setUsername}
              placeholder="Enter your username"
              required
              autoFocus
            />
            {/*
             * A div, not a wrapping label: the show/hide button must sit
             * outside the label. A button inside a label inherits the
             * label's text as its accessible name and its click also
             * triggers label behaviour, so assistive technology sees two
             * controls both called "Password".
             */}
            <div className="field">
              <label className="field-label" htmlFor="login-password">
                Password <span className="required">*</span>
              </label>
              <span className="password-wrap">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <Eye size={18} />
                </button>
              </span>
            </div>
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={16} /> {error}
              </div>
            )}
            <Button type="submit" className="login-submit" disabled={busy} icon={LogIn}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="login-secondary-actions">
            <span className="login-hint">
              <UserCheck size={14} /> Forgot your password? Ask an administrator to
              reset it from Staff management.
            </span>
          </div>

          <div className="authorized">
            <KeyRound size={15} /> Authorized personnel only
          </div>

          <p className="login-product-credit">
            <ProductMark size="sm" /> {PRODUCT_SUBTITLE} · {PRODUCT_NAME}{" "}
            {PRODUCT_VERSION} · {VENDOR.credit} · {VENDOR.websiteLine}
          </p>
        </div>
      </div>
    </div>
  )
}
