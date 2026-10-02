/**
 * Thermal receipt template.
 *
 * Renders a `ReceiptModel`. Every lab-specific line — name, logo, address,
 * phone, licence, footer, thank-you and collection instructions — is decided by
 * the installation's receipt configuration.
 */

import type { ReceiptModel } from "./receiptModel"

type Props = {
  model: ReceiptModel
  /** Compact rendering for the live settings preview. */
  preview?: boolean
}

export default function ReceiptDocument({ model, preview = false }: Props) {
  return (
    <div
      className={`thermal-receipt receipt-${model.paper} ${preview ? "paper-preview" : ""}`}
    >
      <div className="receipt-logo">
        {model.showLogo && model.logo ? <img className="receipt-logo-img" src={model.logo} alt="" /> : null}
        {model.showLaboratoryName && <strong>{model.laboratoryName}</strong>}
        {model.showTagline && model.tagline ? <small>{model.tagline}</small> : null}
        {model.showAddress && model.address ? <span>{model.address}</span> : null}
        {model.showPhone && model.phoneLine ? <span>{model.phoneLine}</span> : null}
        {model.showLicenseNumber && model.licenseLine ? <span>{model.licenseLine}</span> : null}
      </div>

      <div className="receipt-dash" />

      <div className="receipt-info">
        <div>
          <span>Receipt No.</span>
          <strong>{model.receiptNumber}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{model.issuedAt}</strong>
        </div>
        <div>
          <span>Patient</span>
          <strong>{model.customer.name}</strong>
        </div>
        <div>
          <span>Patient ID</span>
          <strong>{model.customer.code}</strong>
        </div>
        {model.sampleId ? (
          <div>
            <span>Sample ID</span>
            <strong>{model.sampleId}</strong>
          </div>
        ) : null}
        {model.customer.referredBy ? (
          <div>
            <span>Referred by</span>
            <strong>{model.customer.referredBy}</strong>
          </div>
        ) : null}
      </div>

      {model.showTests && (
        <>
          <div className="receipt-dash" />
          <strong className="receipt-heading">TESTS</strong>
          <div className="receipt-tests">
            {model.lines.map((line) => (
              <div key={line.code}>
                <span>
                  {line.code} <small>{line.name}</small>
                </span>
                <strong>{line.priceText}</strong>
              </div>
            ))}
          </div>
        </>
      )}

      {model.showPaymentSummary && (
        <>
          <div className="receipt-dash" />
          <div className="receipt-totals">
            {model.discount > 0 && (
              <div>
                <span>Discount</span>
                <strong>{model.discountText}</strong>
              </div>
            )}
            <div className="receipt-grand">
              <span>TOTAL</span>
              <strong>{model.totalText}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{model.paidText}</strong>
            </div>
            <div>
              <span>Remaining</span>
              <strong>{model.balanceText}</strong>
            </div>
            {model.showPaymentMethod && model.paymentMethod ? (
              <div>
                <span>Method</span>
                <strong>{model.paymentMethod}</strong>
              </div>
            ) : null}
          </div>
        </>
      )}

      <div className={`receipt-status receipt-${model.paymentState.toLowerCase()}`}>
        {model.paymentState}
      </div>

      {model.showExpectedReport && (
        <div className="receipt-expected">
          Expected report: <strong>{model.expectedReport}</strong>
        </div>
      )}

      <div className="receipt-dash" />

      {model.collectionInstructions && (
        <p className="receipt-message">{model.collectionInstructions}</p>
      )}

      {model.showBarcode && (
        <div className="receipt-barcode">
          <span>|||| ||| |||| || ||||| ||| |||| |||</span>
          <small>{model.receiptNumber}</small>
        </div>
      )}

      {model.showThankYou && model.thankYou ? (
        <small className="receipt-thanks">{model.thankYou}</small>
      ) : null}
      {model.footerText ? <small className="receipt-thanks">{model.footerText}</small> : null}
      {model.showVendorCredit ? (
        <small className="receipt-thanks receipt-vendor">
          {model.vendorCredit} · {model.vendorWebsite}
        </small>
      ) : null}
    </div>
  )
}
