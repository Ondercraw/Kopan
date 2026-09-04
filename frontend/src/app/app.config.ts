import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { recoverFromStaleDeployment } from './core/utils/navigation-error-recovery';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withNavigationErrorHandler(recoverFromStaleDeployment),
    ),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
