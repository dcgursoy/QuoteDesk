import type { PriceOption, QuoteSpec } from './types';

// Invented hackathon rates, not a production manufacturing estimate.
export function priceQuote(spec: QuoteSpec): PriceOption[] {
  const material = spec.materialGrade.value;
  const finish = spec.finish.value;
  const quantity = spec.quantity.value;
  if (!material || !finish || !quantity) throw new Error('Buyer details are incomplete');
  const rates = { AL6061: [270, 800, 100], AL7075: [281, 1400, 110], SS304: [800, 1200, 180] };
  const [density, centsPerKg, factor] = rates[material];
  const dimensions = [spec.lengthMm.value, spec.widthMm.value, spec.thicknessMm.value];
  if (dimensions.some(n => n === null || !Number.isFinite(n) || n <= 0)) throw new Error('Drawing dimensions are incomplete');
  if (material === 'SS304' && finish !== 'AS_MACHINED') throw new Error('Anodize requires aluminum');
  const [length, width, thickness] = dimensions as number[];
  const volume = (length + 5) * (width + 5) * (thickness + 2);
  const materialCents = Math.round(volume * density / 100 * centsPerKg / 1_000_000);
  const machineCents = Math.round(60 * factor * 150 / 1000);
  const finishCents = { AS_MACHINED: 0, ANODIZE_CLEAR: 250, ANODIZE_BLACK: 300 }[finish];
  const discount = quantity >= 250 ? 20 : quantity >= 100 ? 15 : quantity >= 50 ? 10 : quantity >= 10 ? 5 : 0;
  const unit = Math.round((materialCents + machineCents + finishCents) * (100 - discount) / 100);
  const subtotal = unit * quantity + 12000;
  const leads = [ ['economy', 15, 9000], ['standard', 10, 10000], ['rush', 5, 13000] ] as const;
  return leads.map(([id, days, multiplier]) => {
    const totalCents = Math.round(subtotal * multiplier / 10000);
    return { id, totalCents, unitCents: Math.round(totalCents / quantity), businessDays: days + (finish === 'AS_MACHINED' ? 0 : 3) };
  });
}
