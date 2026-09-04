import { describe, expect, it } from 'vitest';
import { isLazyChunkLoadError } from './navigation-error-recovery';

describe('isLazyChunkLoadError', () => {
  it.each([
    'ChunkLoadError: Loading chunk 123 failed',
    'Failed to fetch dynamically imported module: /chunk-old.js',
    'Importing a module script failed',
  ])('detecta un archivo obsoleto del despliegue: %s', (message) => {
    expect(isLazyChunkLoadError(new Error(message))).toBe(true);
  });

  it('no recarga ante un error funcional común', () => {
    expect(isLazyChunkLoadError(new Error('No se pudo cargar la lista de proveedores'))).toBe(
      false,
    );
  });
});
