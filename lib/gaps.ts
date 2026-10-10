// lib/gaps.ts
import type { QuoteSpec } from './types';

// The order the fields are shown and checked in.
// Do not rely on Object.keys(spec) for order. The database stores the spec
// as jsonb, and jsonb does not keep the order of keys.
export const FIELD_ORDER: (keyof QuoteSpec)[] = [
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
];

// Returns the names of the fields that still have no value.
// This is plain code on purpose. The model never decides what is missing.
export function findMissing(spec: QuoteSpec): (keyof QuoteSpec)[] {
  const missing: (keyof QuoteSpec)[] = [];
  for (const name of FIELD_ORDER) {
    if (spec[name].status === 'missing') {
      missing.push(name);
    }
  }
  return missing;
}