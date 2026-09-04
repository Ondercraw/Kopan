const UNITS = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const SPECIAL = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince'];
const TENS = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

function underThousand(value: number): string {
  if (value === 0) return '';
  if (value === 100) return 'cien';
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest < 10) parts.push(UNITS[rest]);
  else if (rest < 16) parts.push(SPECIAL[rest - 10]);
  else if (rest < 20) parts.push(`dieci${UNITS[rest - 10]}`);
  else if (rest < 30) parts.push(rest === 20 ? 'veinte' : `veinti${UNITS[rest - 20]}`);
  else {
    const tens = Math.floor(rest / 10);
    const units = rest % 10;
    parts.push(`${TENS[tens]}${units ? ` y ${UNITS[units]}` : ''}`);
  }
  return parts.filter(Boolean).join(' ');
}

function integerInWords(value: number): string {
  if (value === 0) return 'cero';
  if (value > 999_999_999_999) return String(value);
  const parts: string[] = [];
  const millions = Math.floor(value / 1_000_000);
  const thousands = Math.floor((value % 1_000_000) / 1000);
  const rest = value % 1000;
  if (millions) {
    parts.push(millions === 1 ? 'un millón' : `${integerInWords(millions)} millones`);
  }
  if (thousands) parts.push(thousands === 1 ? 'mil' : `${underThousand(thousands)} mil`);
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ');
}

export function amountInWords(cents: number): string {
  const pesos = Math.floor(cents / 100);
  const fraction = cents % 100;
  const words = integerInWords(pesos).replace(/uno$/, 'un');
  const fractionWords = integerInWords(fraction).replace(/uno$/, 'un');
  return `${words} pesos con ${fractionWords} ${fraction === 1 ? 'centavo' : 'centavos'}`;
}
