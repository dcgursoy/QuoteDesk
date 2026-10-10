// lib/types.ts
// The shared vocabulary for the whole team. Change it only after telling everyone.

export type MaterialGrade = 'AL6061' | 'AL7075' | 'SS304';
export type Finish = 'AS_MACHINED' | 'ANODIZE_CLEAR' | 'ANODIZE_BLACK';
export type FieldStatus = 'extracted' | 'missing' | 'confirmed';
export type FieldSource = 'drawing' | 'email' | 'buyer_call';

// One detail of the quote, such as the material or the length.
export interface SpecField<T> {
  value: T | null; // null whenever status is 'missing'
  status: FieldStatus;
  source: FieldSource | null;
  evidence?: string; // exact text read from the drawing or email
  note?: string; // for example 'buyer asked for titanium'
}

// Everything the shop needs to know to price the part.
export interface QuoteSpec {
  partNumber: SpecField<string>;
  revision: SpecField<string>;
  lengthMm: SpecField<number>;
  widthMm: SpecField<number>;
  thicknessMm: SpecField<number>;
  holeCount: SpecField<number>;
  generalToleranceMm: SpecField<number>;
  materialGrade: SpecField<MaterialGrade>;
  quantity: SpecField<number>;
  finish: SpecField<Finish>;
}

// The three details only the buyer can give us.
export const BUYER_FIELDS = ['materialGrade', 'quantity', 'finish'] as const;

export type QuoteStatus = 'extracting' | 'clarifying' | 'quoted' | 'approved' | 'error';

export interface PriceOption {
  id: 'economy' | 'standard' | 'rush';
  businessDays: number;
  unitCents: number;
  totalCents: number;
}

export interface BuyerPriceRequest {
  heard: string;
  requestedAmountCents: number | null;
  basis: 'total' | 'per_part' | null;
  lowestOfferedCents: number | null;
  belowLowest: boolean | null;
  recordedAt: string;
}

// One row of the quotes table in Supabase.
export interface QuoteRow {
  // Loaded from quote_events; not a quotes table column.
  priceRequests?: BuyerPriceRequest[];
  id: string;
  join_token: string;
  status: QuoteStatus;
  email_text: string;
  spec: QuoteSpec;
  missing: (keyof QuoteSpec)[];
  options: PriceOption[] | null;
  version: number;
  intake_at: string;
  quoted_at: string | null;
  approved_at: string | null;
}

// What the answers route sends back to the voice agent.
export interface AnswerResult {
  priceRequest?: BuyerPriceRequest;
  accepted: Partial<Record<(typeof BUYER_FIELDS)[number], string | number>>;
  rejected: { field: string; reason: string; allowed: string[] }[];
  missing: string[];
  status: QuoteStatus;
  options: PriceOption[] | null;
}
