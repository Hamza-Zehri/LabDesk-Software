/**
 * About screen.
 *
 * Reports the product identity, the developer credit, the licence status and
 * the facts about this installation. There is deliberately no "check for
 * updates" control, because this build has no update mechanism to check.
 */

import { Cloud, Database, Globe, Info, KeyRound, MonitorSmartphone, ShieldCheck } from "lucide-react"
import { useLab } from "../app/LabProvider"
import { describeDatabase } from "../core/database"
import { formatDateTime } from "../core/format"
import { summarizeLicense } from "../core/license"
import { PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_SUBTITLE, PRODUCT_VERSION, VENDOR } from "../core/product"
import { SCHEMA_VERSION } from "../core/defaults"
import { ProductMark } from "./Brand"
import { Badge } from "./controls"

export default function AboutScreen() {
  const { db, storage } = useLab()
  const license = summarizeLicense(db)

  const rows: { label: string; value: string }[] = [
    { label: "Database version", value: String(SCHEMA_VERSION) },
    { label: "Build version", value: db.buildVersion || PRODUCT_VERSION },
    { label: "Installation code", value: db.installation.code },
    { label: "Installed on", value: formatDateTime(db.installation.createdAt) },
    { label: "Last opened", value: formatDateTime(db.installation.lastOpenedAt) },
    { label: "Workspace mode", value: "Production" },
  ]

  return (
    <div className="about-screen">
      <div className="about-hero">
        <div className="about-mark">
          <ProductMark size="lg" />
        </div>
        <h2>{PRODUCT_NAME}</h2>
        <p className="about-subtitle">{PRODUCT_SUBTITLE}</p>
        <p className="about-description">{PRODUCT_DESCRIPTION}</p>
        <span className="about-version">Version {PRODUCT_VERSION}</span>
      </div>

      <div className="about-grid">
        <section className="panel about-section">
          <h3>
            <Info size={18} /> Product
          </h3>
          <dl className="about-list">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="panel about-section">
          <h3>
            <KeyRound size={18} /> Licence
          </h3>
          <div className="about-licence">
            <Badge tone={license.isOperatingAllowed ? "green" : "blue"}>{license.label}</Badge>
            <p>{license.detail}</p>
          </div>
          <dl className="about-list">
            <div>
              <dt>Licensed to</dt>
              <dd>{license.licensedTo || "—"}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{license.plan || "—"}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{license.expiresAt}</dd>
            </div>
            <div>
              <dt>Last cloud check</dt>
              <dd>{license.lastCheckInAt}</dd>
            </div>
            <div>
              <dt>Installation ID</dt>
              <dd className="font-mono text-xs">{license.installationId}</dd>
            </div>
          </dl>
        </section>

        <section className="panel about-section">
          <h3>
            <Database size={18} /> Data
          </h3>
          <dl className="about-list">
            <div>
              <dt>Stored in</dt>
              <dd>{describeDatabase(db, storage)}</dd>
            </div>
            <div>
              <dt>Persistence</dt>
              <dd>{storage.persistent ? "Local installation storage" : "In-memory (this session)"}</dd>
            </div>
            <div>
              <dt>Offline operation</dt>
              <dd>
                <ShieldCheck size={14} /> No network services are used
              </dd>
            </div>
            <div>
              <dt>Installations on this device</dt>
              <dd>
                <MonitorSmartphone size={14} /> One laboratory
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <footer className="about-footer">
        <div>
          <strong>{VENDOR.credit}</strong>
          <span>
            <Globe size={14} /> {VENDOR.websiteLine}
          </span>
        </div>
        <p>
          © {new Date().getFullYear()} {VENDOR.developer}. {PRODUCT_NAME} is
          supplied as software only; all laboratory names, logos and data belong
          to the laboratory that installs it.
        </p>
      </footer>
    </div>
  )
}
