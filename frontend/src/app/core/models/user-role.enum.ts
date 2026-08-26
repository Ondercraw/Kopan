// Debe reflejar exactamente el enum del backend (common/enums/user-role.enum.ts)
// Para agregar un rol nuevo: sumarlo acá y también en el backend
// (backend/src/common/enums/user-role.enum.ts), y agregar su etiqueta
// legible en ETIQUETAS_ROL más abajo.
export enum UserRole {
  JEFE = 'jefe',
  VENDEDOR = 'vendedor',
  EMPLEADO_GALPON = 'empleado_galpon',
  EMPLEADO_STOCK = 'empleado_stock',
  ADMINISTRATIVO = 'administrativo',
}

// Etiquetas legibles para mostrar en UI (tags de rol, dashboard, etc.)
// Si agregás un rol nuevo arriba, agregar acá también su etiqueta.
export const ETIQUETAS_ROL: Record<UserRole, string> = {
  [UserRole.JEFE]: 'Dueño',
  [UserRole.ADMINISTRATIVO]: 'Dueño',
  [UserRole.VENDEDOR]: 'Vendedor',
  [UserRole.EMPLEADO_GALPON]: 'Empleado de stock',
  [UserRole.EMPLEADO_STOCK]: 'Empleado de stock',
};

// Los roles antiguos se conservan sólo para interpretar usuarios ya cargados.
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
  roles: UserRole[]; // un empleado puede tener varios roles a la vez
}
