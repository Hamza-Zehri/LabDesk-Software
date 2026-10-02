/**
 * A4 laboratory report template.
 *
 * Renders a `ReportModel`. It contains no laboratory name, no contact detail
 * and no fixed disclaimer: every one of those arrives through the model, which
 * is built from the installation's configuration.
 */

import type { ReportModel } from "./reportModel"

type Props = {
  model: ReportModel
  /** Compact scaling for the live settings preview. */
  preview?: boolean
}

const FlagCell = ({ flag }: { flag: string }) => (
  <td>
    {flag && flag !== "Pending" ? (
      <span className={`paper-flag paper-flag-${flag.toLowerCase()}`}>{flag.toUpperCase()}</span>
    ) : (
      ""
    )}
  </td>
)

export default function ReportDocument({ model, preview = false }: Props) {
  const contact = [
    ...model.addressLines,
    model.phoneLine,
    model.email,
    model.website,
    model.licenseLine,
    model.taxLine,
  ].filter(Boolean)

  return (
    <div className={`paper-report ${preview ? "paper-preview" : ""}`}>
      <header className={`report-header align-${model.headerAlignment}`}>
        <div className="report-brand">
          {model.logo ? <img className="report-logo" src={model.logo} alt="" /> : null}
          <div>
            {model.laboratoryName && <strong className="report-lab-name">{model.laboratoryName}</strong>}
            {model.tagline && <span className="report-lab-tagline">{model.tagline}</span>}
          </div>
        </div>
        {contact.length > 0 && (
          <address className="report-contact">
            {contact.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </address>
        )}
      </header>

      <div className="report-title">
        <div>
          <small>{model.documentTitle.toUpperCase()}</small>
          <h2>{model.documentSubtitle}</h2>
        </div>
        <span className={`report-status status-${model.statusLabel.toLowerCase()}`}>
          {model.statusLabel}
        </span>
      </div>

      <div className="report-info">
        {[
          ["PATIENT NAME", model.patient.name],
          ["PATIENT CODE", model.patient.code],
          ["REPORT ID", model.patient.reportId],
          ["SAMPLE ID", model.patient.sampleId],
          ["AGE / GENDER", `${model.patient.age} years / ${model.patient.gender}`],
          [
            "BLOOD GROUP",
            model.patient.bloodGroup
              ? model.patient.bloodGroup
              : "Not provided",
          ],
          ["REFERRED BY", model.patient.referredBy || "Walk-in"],
          ["SAMPLE DATE", model.patient.collectedOn],
          ["REPORTED ON", model.patient.reportedOn],
        ]
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <strong>{value}</strong>
            </div>
          ))}
      </div>

      {model.sections.map((section) => (
        <section className="report-section" key={section.test.code}>
          <div className="report-section-title">
            {section.test.category.toUpperCase()}{" "}
            <span>
              {section.test.name} ({section.test.code})
            </span>
            {section.test.method ? <em>{section.test.method}</em> : null}
          </div>
          <table className="paper-table">
            <thead>
              <tr>
                {model.resultColumns.parameter && <th>TEST / PARAMETER</th>}
                {model.resultColumns.result && <th>RESULT</th>}
                {model.resultColumns.unit && <th>UNIT</th>}
                {model.resultColumns.referenceRange && <th>REFERENCE RANGE</th>}
                {model.resultColumns.flag && <th>FLAG</th>}
              </tr>
            </thead>
            <tbody>
              {section.parameters.map((row) => (
                <tr key={row.parameter.id}>
                  {model.resultColumns.parameter && <td>{row.parameter.name}</td>}
                  {model.resultColumns.result && (
                    <td>
                      <strong>{row.value || "—"}</strong>
                    </td>
                  )}
                  {model.resultColumns.unit && <td>{row.parameter.unit}</td>}
                  {model.resultColumns.referenceRange && (
                    <td>{row.parameter.referenceRange}</td>
                  )}
                  {model.resultColumns.flag && <FlagCell flag={row.flag} />}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {model.technicianNote && (
        <div className="report-note">
          <strong>Technician notes</strong>
          <p>{model.technicianNote}</p>
        </div>
      )}

      {model.disclaimer && (
        <div className="report-note">
          <strong>{model.notesLabel}</strong>
          <p>{model.disclaimer}</p>
        </div>
      )}

      {model.signatures.length > 0 && (
        <div className="report-signatures">
          {model.signatures.map((signature) => (
            <div key={signature.slot}>
              <span>________________________</span>
              <strong>{signature.label}</strong>
            </div>
          ))}
        </div>
      )}

      <footer className="report-footer">
        <span>
          {model.footerText}
          {model.showProductName ? ` · Powered by ${model.productName}` : ""}
        </span>
        {model.showVendorCredit ? (
          <span className="report-vendor">
            {model.vendorCredit} · {model.vendorWebsite}
          </span>
        ) : (
          <span className="report-report-id">Report {model.patient.reportId}</span>
        )}
      </footer>
    </div>
  )
}
