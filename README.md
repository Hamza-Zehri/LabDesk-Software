# LabDesk-Software

**LabDesk** — a white-label Laboratory Management System for diagnostic laboratories, pathology centers, hospital laboratories and private diagnostic centers.

LabDesk covers the full day-to-day workflow of a working lab: registering patients, collecting samples, entering and verifying results, printing reports and thermal receipts, taking payments, and keeping an audit trail — all running locally with no server required.

> Software by Engr. Hamza Asad — [Brightpixel.vercel.app](https://brightpixel.vercel.app)

---

## Features

**Patients & orders**
- Patient registration with demographics, referring doctor, notes and clinical history
- Automatic per-installation patient and sample ID sequences
- Patient profiles with test history, payments and status
- Add, detach, re-price and remove ordered tests with integrity rules that protect finalized reports

**Laboratory workflow**
- Test catalog with parameters, units, reference ranges, categories, sample types and pricing
- Sample collection tracking with collection and rejection states
- Result entry per parameter with automatic range evaluation (low / normal / high flags)
- Technician notes captured alongside results
- Verification workflow: submit for verification, verify, or return for correction
- Finalization that locks a report and records who verified it and when

**Reporting & printing**
- Branded A4 report preview and print layout
- 80mm thermal receipt layout
- Configurable report and receipt templates with `{{token}}` placeholders
- Optional vendor credit line on printed output (off by default — output stays white-label)
- Browser-native printing, no external print service

**Billing**
- Order totals, discounts and running balances
- Partial and full payment recording with payment method
- Overpayment handling with honest balance display
- Payment adjustments with a recorded reason
- Billing dashboard and per-patient payment detail

**Administration**
- Role-based access (Administrator and staff roles)
- Staff management: create, edit, enable/disable, remove, with last-administrator protection
- Password policy with PBKDF2-SHA256 hashing and salted digests
- Audit log of key actions, with CSV export and administrator-only clearing
- Backup and restore of the complete installation as a single JSON file
- Factory reset and multi-installation support
- Light and dark themes, responsive layout

**Demo mode**
- A fully isolated synthetic demonstration installation, kept separate from real customer data

---

## Tech stack

| Area | Choice |
| --- | --- |
| UI | React 19 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 |
| Language | TypeScript 5.7 |
| Storage | Browser storage adapter (installation-namespaced, local) |
| Unit tests | Vitest 5 + Testing Library (jsdom) |
| End-to-end tests | Playwright (Chromium) |
| Formatting | oxfmt |

---

## Requirements

- Node.js 22
- pnpm 10

Versions are pinned in `.mise.toml`. With [mise](https://mise.jdx.dev/) installed, `mise install` sets up both.

---

## Getting started

```bash
pnpm install
pnpm dev
```

The development server runs on port `8443` by default (override with the `PORT` environment variable).

On first launch, LabDesk shows a setup wizard that collects the laboratory's details and creates the administrator account. Setup signs that administrator straight in.

### Build and preview

```bash
pnpm run build
pnpm run preview
```

---

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm run build` | Production build to `dist/` |
| `pnpm run preview` | Serve the production build |
| `pnpm run typecheck` | Type-check the whole project (`tsc --noEmit`) |
| `pnpm test` | Run the unit and integration suite once |
| `pnpm test:watch` | Run unit tests in watch mode |
| `pnpm e2e` | Run the Playwright end-to-end suite in a real browser |
| `pnpm run format` | Format the codebase with oxfmt |

---

## Testing

The project is verified at two levels:

- **Unit and integration** — Vitest with Testing Library over a jsdom environment. Covers pricing, payments, sample lifecycle, result completeness, password hashing, backup/restore, report and receipt view models, white-label guarantees, provider CRUD, and an application-level smoke test.
- **End-to-end** — Playwright drives the real production build in Chromium: first-run setup, patient registration with pricing, persistence across a reload, and authentication. The suite fails on any console error or unhandled exception.

```bash
pnpm test        # unit + integration
pnpm e2e         # real browser, against the built app
pnpm run typecheck
```

The first `pnpm e2e` run downloads a Chromium binary automatically.

---

## Project structure

```
src/
  main.tsx              React entry point
  App.tsx               Application shell and all page workflows
  index.css             Global styles and Tailwind v4 import
  app/
    LabProvider.tsx     State, persistence, actions, auth, setup
  core/                 Domain types, storage, records, backup, passwords,
                        formatting, templates and product identity
  reports/              Report and thermal-receipt view models
  ui/                   Shared UI controls, login and splash screens
  settings/             Settings and staff management
  setup/                First-run setup wizard
  demo/                 Isolated demonstration data
  test/                 Test setup
e2e/                    Playwright end-to-end tests
```

---

## White-labeling and configuration

LabDesk distinguishes the *software* from the *laboratory that installs it*.

- **Product identity** (`src/core/product.ts`) — name, subtitle, version and vendor attribution. Fixed, never derived from customer configuration.
- **Laboratory identity** — name, logo, address, phone, report and receipt wording, and all other customer-facing details live in configuration and are editable in **Settings**.
- **Currency** — defaults to `PKR` with the `Rs.` symbol, and is configurable per installation.
- **Printed output** — report and receipt templates support `{{token}}` placeholders and stay white-label by default; the vendor credit line is opt-in.

---

## Data, privacy and storage

- All data is stored **locally** in the browser's storage under an installation-namespaced key (`labdesk:<installation-id>:…`). No data leaves the machine and there is no cloud sync.
- Each installation is isolated, so customer data never mixes with another installation or with the demo installation.
- **Backup** exports the entire installation as a single JSON file; **Restore** validates and replaces it safely.
- **Factory reset** wipes the current installation without touching others.
- Passwords are stored only as salted PBKDF2-SHA256 digests.

---

## Vendor

Software by **Engr. Hamza Asad**
Website: [Brightpixel.vercel.app](https://brightpixel.vercel.app)
