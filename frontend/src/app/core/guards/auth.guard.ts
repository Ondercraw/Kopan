import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const usuarioActual = authService.currentUser();

  // Si ya sabemos que hay sesión (o no), resolvemos directo sin pegarle de nuevo al backend
  if (usuarioActual !== undefined) {
    return usuarioActual ? true : router.createUrlTree(['/auth/login']);
  }

  // Recién arrancando la app: todavía no se consultó /auth/me
  return authService
    .cargarSesion()
    .pipe(map((user) => (user ? true : router.createUrlTree(['/auth/login']))));
};
