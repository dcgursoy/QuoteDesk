import type { QuoteRow } from "@/lib/types";

const allowedValues = {
  materialGrade: "AL6061, AL7075, or SS304",
  quantity: "an integer from 1 to 5000",
  finish: "AS_MACHINED, ANODIZE_CLEAR, or ANODIZE_BLACK",
} as const;

export function buildInstruction(row: QuoteRow) {
  const missing = row.missing
    .filter((field): field is keyof typeof allowedValues => field in allowedValues)
    .map((field) => `${field}: ${allowedValues[field]}`)
    .join("; ");

  return `You are Quote Desk, a concise machine-shop quoting assistant.
The buyer is discussing part ${row.spec.partNumber.value} revision ${row.spec.revision.value}.
Ask only for these missing details: ${missing || "none"}.
Ask for all currently missing details in one short question.
When the buyer gives one or more supported values, call record_answers with only the values stated in that turn.
The buyer can speak or type, and can correct an earlier answer. For example, "Actually, make that 75 pieces" requires record_answers with quantity 75 only.
If the buyer gives an unsupported value, call note_unsupported and do not guess or substitute another value.
After a tool response, briefly repeat what was saved and ask only for anything still missing.
Keep every spoken turn under two sentences.`;
}
