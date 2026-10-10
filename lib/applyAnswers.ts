import { BUYER_FIELDS, type AnswerResult, type QuoteRow, type QuoteSpec } from './types';
import { FIELD_ORDER } from './gaps';
import { priceQuote } from './pricing';

const allowed = {
  materialGrade: ['AL6061', 'AL7075', 'SS304'],
  finish: ['AS_MACHINED', 'ANODIZE_CLEAR', 'ANODIZE_BLACK'],
  quantity: ['integer from 1 to 5000'],
};

export function applyAnswers(original: QuoteRow, tool: string, args: Record<string, unknown>) {
  const row = structuredClone(original);
  if (tool === 'note_price_request') {
    if (typeof args.heard !== 'string' || !args.heard.trim() || args.heard.length > 1000) throw new Error('Provide the buyer price request (1–1000 characters)');
    if (Object.keys(args).some(key => !['heard', 'requestedAmountCents', 'basis'].includes(key))) throw new Error('Invalid price request fields');
    const hasAmount = args.requestedAmountCents !== undefined;
    const hasBasis = args.basis !== undefined;
    if (hasAmount !== hasBasis || (hasAmount && (!Number.isSafeInteger(args.requestedAmountCents) || (args.requestedAmountCents as number) <= 0 || !['total', 'per_part'].includes(String(args.basis))))) throw new Error('Provide a positive amount in USD cents and a total or per_part basis together');
    const basis = hasBasis ? args.basis as 'total' | 'per_part' : null;
    const amount = hasAmount ? args.requestedAmountCents as number : null;
    const lowest = basis && row.options?.length ? Math.min(...row.options.map(option => basis === 'total' ? option.totalCents : option.unitCents)) : null;
    const result: AnswerResult = {
      accepted: {}, rejected: [], missing: row.missing, status: row.status, options: row.options,
      priceRequest: { heard: args.heard.trim(), requestedAmountCents: amount, basis, lowestOfferedCents: lowest, belowLowest: amount !== null && lowest !== null ? amount < lowest : null, recordedAt: new Date().toISOString() },
    };
    // Persist the note through quote_events, leaving specs, prices and approval unchanged.
    return { row, result, changed: false };
  }
  const accepted: AnswerResult['accepted'] = {};
  const rejected: AnswerResult['rejected'] = [];
  const reject = (field: keyof typeof allowed, reason: string) => rejected.push({ field, reason, allowed: allowed[field] });
  const set = (field: typeof BUYER_FIELDS[number], value: string | number) => {
    // Assignment is restricted to these three buyer fields and validated below.
    (row.spec as unknown as Record<string, unknown>)[field] = { value, status: 'confirmed', source: 'buyer_call', evidence: 'Stated by buyer on call' };
    accepted[field] = value;
  };
  if (tool === 'note_unsupported') {
    const field = args.field;
    if (typeof field !== 'string' || !BUYER_FIELDS.includes(field as typeof BUYER_FIELDS[number]) || typeof args.heard !== 'string') throw new Error('Invalid unsupported-answer arguments');
    const key = field as typeof BUYER_FIELDS[number];
    row.spec[key].note = `Buyer requested: ${args.heard.slice(0, 300)}`;
    reject(key, 'Requested value is not offered. Previous confirmed values, if any, remain unchanged.');
  } else if (tool === 'record_answers') {
    if (args.materialGrade !== undefined) {
      if (typeof args.materialGrade === 'string' && allowed.materialGrade.includes(args.materialGrade)) set('materialGrade', args.materialGrade);
      else { row.spec.materialGrade.note = `Unsupported material: ${String(args.materialGrade).slice(0, 300)}`; reject('materialGrade', 'Choose an offered material grade'); }
    }
    // A material correction can invalidate an earlier finish.
    if (row.spec.materialGrade.value === 'SS304' && row.spec.finish.value && row.spec.finish.value !== 'AS_MACHINED') {
      row.spec.finish = { value: null, status: 'missing', source: null, note: 'Anodize is offered on aluminum only' };
      reject('finish', 'Anodize is offered on aluminum only');
    }
    if (args.quantity !== undefined) {
      if (typeof args.quantity === 'number' && Number.isInteger(args.quantity) && args.quantity >= 1 && args.quantity <= 5000) set('quantity', args.quantity);
      else reject('quantity', 'Quantity must be an integer from 1 to 5000');
    }
    if (args.finish !== undefined) {
      if (typeof args.finish !== 'string' || !allowed.finish.includes(args.finish)) reject('finish', 'Choose an offered finish');
      else if (args.finish !== 'AS_MACHINED' && row.spec.materialGrade.value === 'SS304') reject('finish', 'Anodize is offered on aluminum only');
      else set('finish', args.finish);
    }
    if (Object.keys(args).some(key => !BUYER_FIELDS.includes(key as typeof BUYER_FIELDS[number]))) throw new Error('Only buyer fields can be changed');
  } else throw new Error('Unknown tool');

  row.missing = FIELD_ORDER.filter(key => row.spec[key]?.value == null || row.spec[key]?.status === 'missing');
  const changed = JSON.stringify(row.spec) !== JSON.stringify(original.spec);
  if (changed) {
    row.version++;
    row.approved_at = null;
    row.options = null;
    row.status = 'clarifying';
    if (!row.missing.length) {
      try {
        row.options = priceQuote(row.spec as QuoteSpec);
        row.status = 'quoted';
        row.quoted_at ||= new Date().toISOString();
      } catch { row.status = 'error'; }
    }
  }
  const result: AnswerResult = { accepted, rejected, missing: row.missing, status: row.status, options: row.options };
  return { row, result, changed };
}
