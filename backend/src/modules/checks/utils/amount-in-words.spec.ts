import { amountInWords } from './amount-in-words';

describe('amountInWords', () => {
  it('convierte pesos y centavos al texto guardado en el cheque', () => {
    expect(amountInWords(100_000_50)).toBe('cien mil pesos con cincuenta centavos');
  });

  it('conserva el formato de centavos cuando no hay parte decimal', () => {
    expect(amountInWords(8_000)).toBe('ochenta pesos con cero centavos');
  });
});
