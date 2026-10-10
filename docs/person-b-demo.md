# Person B: demo notes

## What you built

The buyer's voice or typed answer now changes the actual quote, rather than only appearing in a conversation log.

1. Gemini Live understands the buyer and requests a tool action (`record_answers`, `note_unsupported`, or `note_price_request`). It explains terminology neutrally, but does not recommend engineering specifications or choose for the buyer.
2. The call page sends that action to our answer-saving endpoint. An endpoint is simply a server URL that receives a request and does work.
3. Our server verifies the buyer's link and checks the answers against rules. Gemini does not get to choose arbitrary materials, change the drawing dimensions, or invent prices.
4. Supabase stores the updated specification and an event recording the tool request and result. Repeating a completed tool call returns its existing result instead of applying it twice.
5. Once all required details are present, ordinary code computes economy, standard, and rush options.
6. The estimator screen watches Supabase updates, with a two-second refresh fallback. The estimator can approve the provisional quote. A later correction clears approval and requires review again.

## Demo script

For the simple company scenario, say: “I work at a company building desks. We need 25 brackets. Our engineer specified 6061 aluminum, but what does as-machined finish mean?” After the explanation, say “Use as-machined.” These are fictional buyer requirements, not a recommendation for desk construction.

If asked to choose specifications, the agent should explain that the buyer's engineer or vendor must decide, leave undecided fields missing, and collect other known details. Its job is to move a manufacturing request forward, not act as a professional engineer.

When the screen updates, say: “Those answers are validated and saved in Supabase, our database. It keeps the buyer conversation and vendor screen in sync, and stores a history of the buyer's answers and price requests.”

If time allows, ask: “Can you do $100 total?” Point to the vendor-review note and explain that the request is saved without accepting a discount or changing calculated prices.

### Predictable direct-answer fallback

Say: “Gemini handles the conversation, Supabase stores the shared quote, and our code handles validation and pricing. The AI asks for missing information, but it cannot invent a manufacturing price. The estimator stays in control of approval.”

On the buyer page, say or type:

- “6061 aluminum, 50 pieces, clear anodize.”
- Look at the estimator screen: three prices should appear.
- “Actually, make that 75 pieces.” The quantity and prices should change.
- “Can you use titanium?” The system should explain that titanium is unsupported and retain the last valid material. The requested material is recorded as a note; it is not silently substituted.
- On the estimator screen, click **Approve quote**.

Only run the correction/unsupported examples if time permits. For a smooth short demo, use the first answer and approval.

## Pricing: be honest about its limits

These are invented hackathon rates, not a production machining estimator. Prices are provisional, in USD, and delivery times are business days.

The calculation estimates oversized stock volume from drawing dimensions, applies a material cost and a fixed machining allowance, adds finish cost, applies a quantity discount, and adds a $120 setup charge. Economy is 10% below the standard total; rush is 30% above it. Base delivery times are 15, 10, and 5 business days; anodizing adds 3 days.

For the demo's 120 × 60 × 8 mm bracket, 6061 aluminum, 50 pieces, clear anodize:

- Economy: $644.85 total / 18 business days.
- Standard: $716.50 total / 13 business days.
- Rush: $931.45 total / 8 business days.

Supported materials: 6061 aluminum, 7075 aluminum, 304 stainless. Quantity: whole numbers 1–5000. Finishes: as-machined, clear anodize, black anodize. Stainless cannot be anodized in this demo.

This is a browser conversation opened through the QR/link, not an outgoing telephone call or automatic email. Estimator approval uses the demo's shared quote token, not production employee authentication. Do not describe it as production-ready access control.

## Local checks and deployment

Automated local checks: `npm run check`.

Integration test: `npm run test:integration`. Keep the local app running first. This creates and deletes only a temporary test quote and its events in Supabase.

Before the demo, push the `person_b` branch, merge the pull request into the team's deployment branch, and wait for Vercel to finish. Local success does not mean the public deployment has these changes. Then create a fresh quote on the public site and run the first-answer example once on the phone.

No additional Supabase schema change or environment variable is required for this implementation in the currently tested project.
