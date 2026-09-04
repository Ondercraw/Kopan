import { NavigationError } from '@angular/router';

const RELOAD_KEY = 'kopan:stale-deployment-reload';
const RETRY_WINDOW_MS = 60_000;

export function isLazyChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? messageWithCause(error)
      : typeof error === 'string'
        ? error
        : '';

  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export function recoverFromStaleDeployment(event: NavigationError): void {
  if (!isLazyChunkLoadError(event.error)) return;

  const now = Date.now();
  const previousAttempt = readPreviousAttempt();
  if (
    previousAttempt?.url === event.url &&
    now - previousAttempt.timestamp < RETRY_WINDOW_MS
  ) {
    console.error('No se pudo cargar la pantalla después de actualizar la aplicación.', event.error);
    return;
  }

  try {
    sessionStorage.setItem(
      RELOAD_KEY,
      JSON.stringify({ url: event.url, timestamp: now }),
    );
  } catch {
    // El modo privado puede bloquear sessionStorage; la recarga sigue siendo segura.
  }
  window.location.replace(event.url);
}

function messageWithCause(error: Error): string {
  const cause = 'cause' in error ? String(error.cause ?? '') : '';
  return `${error.name} ${error.message} ${cause}`;
}

function readPreviousAttempt(): { url: string; timestamp: number } | null {
  try {
    const stored = sessionStorage.getItem(RELOAD_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<{ url: string; timestamp: number }>;
    return typeof value.url === 'string' && typeof value.timestamp === 'number'
      ? { url: value.url, timestamp: value.timestamp }
      : null;
  } catch {
    return null;
  }
}
