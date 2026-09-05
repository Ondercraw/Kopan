import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ETIQUETAS_ROL, normalizeUserRoles, UserRole } from '../../core/models/user-role.enum';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  // Si queda vacío, la sección es visible para cualquier rol logueado.
  // Cuando el cliente defina accesos reales, cada item declara acá sus roles permitidos.
  rolesPermitidos?: UserRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  { label: 'Principal', items: [{ label: 'Inicio', icon: 'ti-home', path: '/' }] },
  {
    label: 'Gestión',
    items: [
      {
        label: 'Proveedores',
        icon: 'ti-truck',
        path: '/proveedores',
        rolesPermitidos: [UserRole.JEFE, UserRole.EMPLEADO_STOCK],
      },
      {
        label: 'Gestión de stock',
        icon: 'ti-package',
        path: '/stock',
        rolesPermitidos: [UserRole.JEFE, UserRole.EMPLEADO_STOCK],
      },
      {
        label: 'Precios y costos',
        icon: 'ti-tag',
        path: '/precios',
        rolesPermitidos: [UserRole.JEFE, UserRole.VENDEDOR],
      },
      {
        label: 'Compras',
        icon: 'ti-shopping-cart',
        path: '/compras',
        rolesPermitidos: [UserRole.JEFE],
      },
      {
        label: 'Clientes',
        icon: 'ti-users',
        path: '/clientes',
        rolesPermitidos: [UserRole.JEFE, UserRole.VENDEDOR],
      },
      {
        label: 'Vendedores',
        icon: 'ti-user-check',
        path: '/vendedores',
        rolesPermitidos: [UserRole.JEFE],
      },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      {
        label: 'Ventas',
        icon: 'ti-invoice',
        path: '/ventas',
        rolesPermitidos: [UserRole.JEFE, UserRole.VENDEDOR],
      },
      { label: 'Caja', icon: 'ti-cash', path: '/caja', rolesPermitidos: [UserRole.JEFE] },
      {
        label: 'Ingresos y gastos',
        icon: 'ti-arrows-exchange',
        path: '/ingresos-gastos',
        rolesPermitidos: [UserRole.JEFE],
      },
      {
        label: 'Cheques',
        icon: 'ti-file-text',
        path: '/cheques',
        rolesPermitidos: [UserRole.JEFE],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Empleados',
        icon: 'ti-user',
        path: '/empleados',
        rolesPermitidos: [UserRole.JEFE],
      },
    ],
  },
  {
    label: 'Informes',
    items: [
      {
        label: 'Informes operativos',
        icon: 'ti-report-analytics',
        path: '/informes-operativos',
        rolesPermitidos: [UserRole.JEFE],
      },
      {
        label: 'Informes financieros',
        icon: 'ti-currency-dollar',
        path: '/informes-financieros',
        rolesPermitidos: [UserRole.JEFE],
      },
    ],
  },
];

// Ocultos hasta definir con el cliente el circuito fiscal real.
// { label: 'Listados de IVA', icon: 'ti-report-money', path: '/iva' }
// { label: 'Impresora fiscal', icon: 'ti-printer', path: '/impresora-fiscal' }

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard {
  private readonly authService = inject(AuthService);

  readonly currentUser = this.authService.currentUser;
  readonly mobileMenuOpen = signal(false);

  get navGroups(): NavGroup[] {
    const roles = normalizeUserRoles(this.currentUser()?.roles ?? []);
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.rolesPermitidos || item.rolesPermitidos.some((rol) => roles.includes(rol)),
      ),
    })).filter((group) => group.items.length > 0);
  }

  get iniciales(): string {
    const nombre = this.currentUser()?.nombre ?? '';
    return nombre
      .split(' ')
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() ?? '')
      .join('');
  }

  get rolesLabel(): string {
    const roles = normalizeUserRoles(this.currentUser()?.roles ?? []);
    return roles.map((rol) => ETIQUETAS_ROL[rol]).join(', ');
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  onLogout(): void {
    this.closeMobileMenu();
    this.authService.logout().subscribe();
  }
}
