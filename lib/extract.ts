// lib/extract.ts
import { GoogleGenAI } from '@google/genai';
import { RawSpecZ, specJsonSchema, type RawSpec } from './schema';
import type { Finish, MaterialGrade, QuoteSpec, SpecField } from './types';

const MODEL = 'gemini-3.8-flash';

const EXTRACTION_PROMPT = `You are reading a quote request sent to a machine shop.
Use only the email text below and the attached drawing.

For every field, return three things.
- value is what the documents state.
- evidence is the exact text you read the value from, copied as written.
- source is "drawing" or "email", depending on where that text appears.

If neither the email nor the drawing states a field, return null for value, null for evidence and "none" for source.
Never infer material, quantity or finish from the part shape, from common practice or from a template.
A title block entry such as SEE RFQ, TBD or a blank means the field is not stated.
All dimensions are in millimeters.`;

const MATERIALS: MaterialGrade[] = ['AL6061', 'AL7075', 'SS304'];
const FINISHES: Finish[] = ['AS_MACHINED', 'ANODIZE_CLEAR', 'ANODIZE_BLACK'];

// Words that mean the document left a field open.
const PLACEHOLDERS = ['SEE RFQ', 'TBD', 'N/A', 'NA', 'NONE', 'UNKNOWN', '-', ''];

// Sends the email and the PDF to Gemini and returns a checked spec.
// pdfBase64 is the PDF file's bytes written as base64 text.
export async function extractSpec(emailText: string, pdfBase64: string): Promise<QuoteSpec> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  const ai = new GoogleGenAI({ apiKey: apiKey });

  const interaction = await ai.interactions.create({
    model: MODEL,
    input: [
      { type: 'document', data: pdfBase64, mime_type: 'application/pdf' },
      { type: 'text', text: EXTRACTION_PROMPT + '\n\nEMAIL:\n' + emailText },
    ],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: specJsonSchema,
    },
  });

  const text = interaction.output_text;
  if (!text) {
    throw new Error('Gemini returned no text');
  }

  // JSON.parse throws if the text is not JSON.
  // RawSpecZ.parse throws if the JSON has the wrong shape.
  const raw = RawSpecZ.parse(JSON.parse(text));
  return toQuoteSpec(raw);
}

// Turns the model's raw answer into our QuoteSpec.
// The model reports what it read. This code decides the status of each field.
export function toQuoteSpec(raw: RawSpec): QuoteSpec {
  return {
    partNumber: textField(raw.partNumber),
    revision: textField(raw.revision),
    lengthMm: numberField(raw.lengthMm, false),
    widthMm: numberField(raw.widthMm, false),
    thicknessMm: numberField(raw.thicknessMm, false),
    holeCount: numberField(raw.holeCount, true),
    generalToleranceMm: numberField(raw.generalToleranceMm, false),
    materialGrade: choiceField(raw.materialGrade, MATERIALS),
    quantity: numberField(raw.quantity, true),
    finish: choiceField(raw.finish, FINISHES),
  };
}

function missingField<T>(note?: string): SpecField<T> {
  const field: SpecField<T> = { value: null, status: 'missing', source: null };
  if (note) {
    field.note = note;
  }
  return field;
}

// True only when the model gave a value and showed where it read it.
function isSupported(raw: { value: string | number | null; evidence: string | null; source: string }): boolean {
  if (raw.value === null) return false;
  if (raw.source === 'none') return false;
  if (raw.evidence === null || raw.evidence.trim() === '') return false;
  return true;
}

function textField(raw: RawSpec['partNumber']): SpecField<string> {
  if (!isSupported(raw)) return missingField();
  const value = raw.value!.trim();
  if (PLACEHOLDERS.includes(value.toUpperCase())) return missingField();
  return {
    value: value,
    status: 'extracted',
    source: raw.source as 'drawing' | 'email',
    evidence: raw.evidence!.trim(),
  };
}

function numberField(raw: RawSpec['lengthMm'], mustBeWhole: boolean): SpecField<number> {
  if (!isSupported(raw)) return missingField();
  const value = raw.value!;
  if (!Number.isFinite(value) || value <= 0) return missingField();
  if (mustBeWhole && !Number.isInteger(value)) return missingField();
  return {
    value: value,
    status: 'extracted',
    source: raw.source as 'drawing' | 'email',
    evidence: raw.evidence!.trim(),
  };
}

// For fields that must be one of a fixed list, such as material.
function choiceField<T extends string>(raw: RawSpec['materialGrade'], allowed: T[]): SpecField<T> {
  if (!isSupported(raw)) return missingField();
  const value = raw.value!.trim().toUpperCase();
  if (PLACEHOLDERS.includes(value)) return missingField();
  if (!allowed.includes(value as T)) {
    // The documents name something this shop does not offer.
    // Keep the field missing and remember what was written.
    return missingField('The request says ' + raw.value!.trim() + ', which is not an option this shop offers');
  }
  return {
    value: value as T,
    status: 'extracted',
    source: raw.source as 'drawing' | 'email',
    evidence: raw.evidence!.trim(),
  };
}