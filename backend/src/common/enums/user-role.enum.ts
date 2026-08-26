export enum UserRole {
  JEFE = 'jefe',
  VENDEDOR = 'vendedor',
  EMPLEADO_GALPON = 'empleado_galpon',
  EMPLEADO_STOCK = 'empleado_stock',
  ADMINISTRATIVO = 'administrativo',
}

export const ASSIGNABLE_USER_ROLES = [
  UserRole.JEFE,
  UserRole.VENDEDOR,
  UserRole.EMPLEADO_STOCK,
] as const;

// Compatibilidad de transición para cuentas creadas con los roles eliminados.
export function normalizeUserRoles(roles: UserRole[]): UserRole[] {
  return [
    ...new Set(
      roles.map((role) => {
        if (role === UserRole.ADMINISTRATIVO) return UserRole.JEFE;
        if (role === UserRole.EMPLEADO_GALPON) return UserRole.EMPLEADO_STOCK;
        return role;
      }),
    ),
  ];
}

export interface AuthUser {
  id: string;
  email: string;
  nombre: string;
  roles: UserRole;
}
