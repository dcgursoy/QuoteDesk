# QuoteDesk

From an incomplete manufacturing request to a provisional quote, through a live buyer conversation.

QuoteDesk helps a machine-shop estimator read a buyer's email and PDF drawing, collect missing details through **Gemini Live**, and review three price and delivery options. **Supabase** keeps the conversation and estimator workspace connected through a shared quote and answer history.

Built as a hackathon MVP. Prices are illustrative; final quotes require human approval.

## The workflow

1. **Read the request.** Paste an email and attach a PDF. Gemini extracts specifications with evidence; application code identifies missing fields.
2. **Invite the buyer.** A quote-specific QR code opens a browser voice session. Typed answers are available too.
3. **Clarify the details.** The agent collects material, quantity, and finish. It explains terminology and available options neutrally, but does not make engineering recommendations or choose specifications for the buyer.
4. **Save and validate.** The backend validates answers, stores them in Supabase, and records tool results. Corrections update the specification; unsupported choices are noted rather than silently substituted.
5. **Price and review.** Code generates economy, standard, and rush options. Lower-price requests are recorded for vendor review without changing prices. The estimator approves the provisional quote.

## What Supabase does

| Component | Purpose |
| --- | --- |
| `quotes` | Shared specification, missing fields, prices, approval state, timestamps, and buyer join token |
| `quote_events` | Extraction history, tool requests/results, and price-review requests |
| Version checks | Detect conflicting updates instead of overwriting newer answers |
| Unique quote/call IDs | Return a completed call's saved result instead of applying it twice |
| Realtime subscription | Listen for quote updates when publication and access policies allow it |

The estimator also refreshes through the backend every two seconds, so updates work without browser Realtime access. Price-request notes are loaded from event history through this refresh path. Server operations use the secret key; the browser receives only the publishable key.

Supabase Auth and persistent PDF Storage are **not implemented** in this MVP.

## Run locally

Use Node.js **22 or newer** and npm. You need Gemini access to the configured models and a Supabase project with the tables described in [setup notes](docs/setup.md).

```bash
git clone https://github.com/dcgursoy/quote-desk.git
cd quote-desk
npm ci
cp .env.example .env.local
```

Fill in `.env.local`, then run:

```bash
npm run db:check
npm run dev
```

Open [localhost:3000](http://localhost:3000). The intake includes an example email and uses the bundled bracket drawing when no PDF is selected.

### Environment variables

| Variable | Used by |
| --- | --- |
| `GEMINI_API_KEY` | Server extraction and short-lived Live token creation |
| `SUPABASE_URL` | Server database client; use the project URL, not `/rest/v1/` |
| `SUPABASE_SECRET_KEY` | Server database operations; never expose to the browser |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser Realtime client |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser Realtime client |
| `NEXT_PUBLIC_APP_URL` | Base address encoded into buyer QR links |

Use `http://localhost:3000` for same-computer testing. For a phone demo, use the deployed HTTPS address: a phone's `localhost` is not your laptop. `.env.local` is ignored by Git; `.env.example` contains placeholders only.

## Try the demo

1. Start a fresh request with the bundled drawing.
2. Open the buyer link on the same computer, or scan the QR against the HTTPS deployment.
3. Choose **Start call** or **Start with typing**.
4. Say: “I work at a company building desks. We need 25 brackets. Our engineer specified 6061 aluminum, but what does as-machined finish mean?”
5. After the explanation, explicitly choose “Use as-machined.” Watch the specification and three prices appear.
6. Optionally say “Actually, make that 75 pieces” to show correction and repricing, or ask for titanium to show unsupported-value handling.
7. Ask “Can you do $100 total?” to show a vendor-review note.
8. Approve the provisional quote on the estimator screen.

The agent automates clarification, not engineering decisions. If a buyer asks what specification to use, it directs that choice to their engineer or vendor while collecting other known details. The demo choices above are fictional buyer requirements, not recommendations for desk construction.

If the microphone fails, use typed input in the same Gemini Live conversation. If extraction fails, the intake offers a **saved demo extraction**, not live extraction of a different uploaded drawing. See [Person B's demo notes](docs/person-b-demo.md) for narration and fallback guidance.

## Checks

```bash
npm run check           # Lint, TypeScript, deterministic logic/prompt tests
npm run build           # Production compilation
npm run test:integration
```

The integration test requires `.env.local` and a running local server. It writes to the configured Supabase project, creates a temporary quote, tests saves/pricing/approval/price requests, then deletes only that quote and its events. Use a test project when possible. Set `TEST_APP_URL` to test another server.

`npm run test:extract` sends the bundled PDF to Gemini and compares extraction with the fixture; it consumes API usage. Prompt tests check instructions, not live model behavior. Voice latency, instruction adherence, and concurrency still need real-session testing.

## Pricing model

The demo uses **invented rates**, not production manufacturing estimates:

- Oversized stock volume from dimensions, material cost, and a fixed machining allowance.
- Finish charges, quantity discounts, and a $120 setup fee.
- Economy: 10% below standard / 15 business days.
- Standard: base price / 10 business days.
- Rush: 30% above standard / 5 business days.
- Anodizing adds three business days.

Rates live in [`lib/pricing.ts`](lib/pricing.ts). Hole count and tolerance do not affect price. Vendor-specific rates, machining-time estimation, taxes, and shipping are future work. Manufacturing prices are separate from any proposed subscription price for QuoteDesk.

## Repository map

```text
app/                 Intake, estimator workspace, buyer call, and API routes
components/          Intake form, quote workspace, and QR invitation
lib/                 Extraction, validation, pricing, Gemini tools, and audio
fixtures/            Saved demo specification for fallback and tests
public/demo/         Bundled bracket PDF
scripts/             Database checks, extraction check, and automated tests
docs/                Setup and demo guidance
```

Stack: Next.js App Router, React, TypeScript, Tailwind CSS, Gemini SDK, Supabase, and Zod. See [setup and API notes](docs/setup.md) for table requirements and route contracts.

## Deploy and known limits

Deploy to Vercel, configure the same environment variables, and set `NEXT_PUBLIC_APP_URL` to the deployment's HTTPS address. The shared branch is `master`. After merging, wait for deployment and test a **fresh quote and fresh call**; existing Live sessions retain their original instructions.

Current models are `gemini-3.8-flash` for extraction and `gemini-3.8-live` for conversation. Availability depends on your Gemini account; names are defined in the extraction and voice-token code.

- Browser conversation only: no outbound dialing, email sending, or supplier outreach.
- No production employee authentication or tenant isolation. Reads and reset are not protected by an estimator login; approval uses the demo's shared join token.
- Uploaded PDFs are processed, not retained in Storage. The estimator's drawing link is the bundled demo reference.
- Saves and event history span multiple operations, not one atomic database transaction.
- No established latency benchmark, load-test result, or measured per-request cost.

Before production, add authenticated vendor access, protected routes, scoped database policies, durable drawing storage, transactional saves, monitoring, and validated shop-specific pricing.
