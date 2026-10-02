import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Field } from "./controls"

/**
 * `Field` renders both the visible label and the value that is stored, so these
 * tests pin down the one heuristic the component relies on.
 */
describe("Field options", () => {
  it("shows a plain string as both label and value", async () => {
    const onChange = vi.fn()
    render(<Field label="Gender" value="Female" onChange={onChange} options={["Male", "Female"]} />)

    await userEvent.selectOptions(screen.getByLabelText("Gender"), "Female")
    expect(onChange).toHaveBeenCalledWith("Female")
  })

  it("reads a friendly label but stores the identifier for Label (id)", async () => {
    const onChange = vi.fn()
    render(
      <Field
        label="Referring doctor"
        value="doc_1"
        onChange={onChange}
        options={["Dr Aslam, Pathology (doc_1)", "Walk-in (none)"]}
      />,
    )

    const select = screen.getByLabelText("Referring doctor") as HTMLSelectElement
    const option = [...select.options].find((o) => o.textContent === "Dr Aslam, Pathology")
    expect(option?.value).toBe("doc_1")

    await userEvent.selectOptions(select, "doc_1")
    expect(onChange).toHaveBeenCalledWith("doc_1")
  })

  it("keeps a free-text option with words in parentheses intact", async () => {
    const onChange = vi.fn()
    // Payment methods are customer-editable free text, so a method that happens
    // to contain a bracketed phrase must not be truncated into a different value.
    render(
      <Field
        label="Payment method"
        value="Cash (Official Receipt)"
        onChange={onChange}
        options={["Cash (Official Receipt)", "Card", "Cash"]}
      />,
    )

    const select = screen.getByLabelText("Payment method") as HTMLSelectElement
    const option = [...select.options].find((o) => o.textContent === "Cash (Official Receipt)")
    expect(option?.value).toBe("Cash (Official Receipt)")

    await userEvent.selectOptions(select, "Cash (Official Receipt)")
    expect(onChange).toHaveBeenCalledWith("Cash (Official Receipt)")
  })

  it("does not treat a fully parenthesized option as a label/value pair", async () => {
    const onChange = vi.fn()
    render(<Field label="Type" value="(Clinic)" onChange={onChange} options={["(Clinic)"]} />)
    const select = screen.getByLabelText("Type") as HTMLSelectElement
    expect([...select.options][0].value).toBe("(Clinic)")
    await userEvent.selectOptions(select, "(Clinic)")
    expect(onChange).toHaveBeenCalledWith("(Clinic)")
  })
})
