import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { normalizeUserRoles, UserRole } from '../models/user-role.enum';

/**
 * Uso en las rutas:
 *   { path: 'estadisticas', canActivate: [roleGuard([UserRole.JEFE])], ... }
 */
export const roleGuard = (rolesPermitidos: UserRole[]): CanActivateFn => {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    const usuario = authService.currentUser();
    const tieneAcceso =
      !!usuario && normalizeUserRoles(usuario.roles).some((rol) => rolesPermitidos.includes(rol));

    return tieneAcceso ? true : router.createUrlTree(['/']);
  };
};
