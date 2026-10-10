// lib/schema.ts
import { z } from 'zod';

// This file describes the JSON we ask Gemini to return.
// It does that twice on purpose.
// specJsonSchema is sent to Gemini so it knows what shape to write.
// RawSpecZ checks the reply, because we never trust a model's output blindly.

// Every field comes back as a small object with three parts.
//   value     what the documents say, or null when they do not say
//   evidence  the exact text the value was read from, or null
//   source    where that text was found

const RawText = z.object({
  value: z.string().nullable(),
  evidence: z.string().nullable(),
  source: z.enum(['drawing', 'email', 'none']),
});

const RawNumber = z.object({
  value: z.number().nullable(),
  evidence: z.string().nullable(),
  source: z.enum(['drawing', 'email', 'none']),
});

export const RawSpecZ = z.object({
  partNumber: RawText,
  revision: RawText,
  lengthMm: RawNumber,
  widthMm: RawNumber,
  thicknessMm: RawNumber,
  holeCount: RawNumber,
  generalToleranceMm: RawNumber,
  materialGrade: RawText,
  quantity: RawNumber,
  finish: RawText,
});

export type RawSpec = z.infer<typeof RawSpecZ>;

// Builds the JSON Schema for one field.
function field(valueType: 'string' | 'number', description: string) {
  return {
    type: 'object',
    description: description,
    properties: {
      value: { type: [valueType, 'null'] },
      evidence: { type: ['string', 'null'] },
      source: { type: 'string', enum: ['drawing', 'email', 'none'] },
    },
    required: ['value', 'evidence', 'source'],
  };
}

export const specJsonSchema = {
  type: 'object',
  properties: {
    partNumber: field('string', 'Part number, for example QD-1001.'),
    revision: field('string', 'Drawing revision letter, for example B.'),
    lengthMm: field('number', 'Overall length of the part in millimeters. The longest outside dimension.'),
    widthMm: field('number', 'Overall width of the part in millimeters.'),
    thicknessMm: field('number', 'Thickness of the part in millimeters.'),
    holeCount: field('number', 'Number of holes. A callout such as 4X means four holes.'),
    generalToleranceMm: field('number', 'General tolerance in millimeters as a positive number. Plus or minus 0.1 is 0.1.'),
    materialGrade: field(
      'string',
      'Material. Use exactly AL6061, AL7075 or SS304 when the documents name that material. Use null when no material is named.'
    ),
    quantity: field('number', 'How many parts the buyer wants. Use null when no quantity is stated.'),
    finish: field(
      'string',
      'Surface finish. Use exactly AS_MACHINED, ANODIZE_CLEAR or ANODIZE_BLACK when the documents name that finish. Use null when no finish is named.'
    ),
  },
  required: [
    'partNumber',
    'revision',
    'lengthMm',
    'widthMm',
    'thicknessMm',
    'holeCount',
    'generalToleranceMm',
    'materialGrade',
    'quantity',
    'finish',
  ],
};