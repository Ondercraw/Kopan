import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { UserRole } from './core/models/user-role.enum';
import { PlaceholderPage } from './shared/components/placeholder-page/placeholder-page';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/dashboard/dashboard').then((m) => m.Dashboard),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/home/pages/home-hub/home-hub').then((m) => m.HomeHub),
        data: { titulo: 'Inicio' },
      },
      {
        path: 'ventas',
        loadComponent: () =>
          import('./features/sales/pages/sales-entry/sales-entry').then((m) => m.SalesEntryPage),
        data: { titulo: 'Ventas' },
        canActivate: [roleGuard([UserRole.JEFE, UserRole.VENDEDOR])],
      },
      {
        path: 'comprobantes',
        redirectTo: 'ventas',
        pathMatch: 'full',
      },
      {
        path: 'stock',
        loadComponent: () =>
          import('./features/stock/pages/stock-list/stock-list').then((m) => m.StockList),
        data: { titulo: 'Gestión de stock' },
        canActivate: [roleGuard([UserRole.JEFE, UserRole.EMPLEADO_STOCK])],
      },
      {
        path: 'precios',
        loadComponent: () =>
          import('./features/prices/pages/price-lists/price-lists').then((m) => m.PriceListsPage),
        data: { titulo: 'Precios y costos' },
        canActivate: [roleGuard([UserRole.JEFE, UserRole.VENDEDOR])],
      },
      {
        path: 'clientes',
        loadComponent: () =>
          import('./features/clients/pages/clients-list/clients-list').then((m) => m.ClientsList),
        data: { titulo: 'Clientes' },
        canActivate: [roleGuard([UserRole.JEFE, UserRole.VENDEDOR])],
      },
      {
        path: 'vendedores',
        loadComponent: () =>
          import('./features/sellers/pages/sellers-list/sellers-list').then((m) => m.SellersList),
        data: { titulo: 'Vendedores' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'proveedores',
        loadComponent: () =>
          import('./features/suppliers/pages/suppliers-list/suppliers-list').then(
            (m) => m.SuppliersList,
          ),
        data: { titulo: 'Proveedores' },
        canActivate: [roleGuard([UserRole.JEFE, UserRole.EMPLEADO_STOCK])],
      },
      {
        path: 'informes-operativos',
        loadComponent: () =>
          import('./features/reports/pages/operational-reports/operational-reports').then(
            (m) => m.OperationalReports,
          ),
        data: { titulo: 'Informes operativos' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'informes-financieros',
        loadComponent: () =>
          import('./features/reports/pages/financial-reports/financial-reports').then(
            (m) => m.FinancialReports,
          ),
        data: { titulo: 'Informes financieros' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'estadisticas',
        redirectTo: 'informes-operativos',
        pathMatch: 'full',
      },
      {
        path: 'iva',
        component: PlaceholderPage,
        data: { titulo: 'Listados de IVA' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'cheques',
        loadComponent: () =>
          import('./features/checks/pages/checks-list/checks-list').then((m) => m.ChecksListPage),
        data: { titulo: 'Cheques' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'caja',
        loadComponent: () =>
          import('./features/sales/pages/payment-movements/payment-movements').then(
            (m) => m.PaymentMovementsPage,
          ),
        data: { titulo: 'Caja' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'ingresos-gastos',
        loadComponent: () =>
          import('./features/finance/pages/income-expenses/income-expenses').then(
            (m) => m.IncomeExpensesPage,
          ),
        data: { titulo: 'Ingresos y gastos' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'impresora-fiscal',
        component: PlaceholderPage,
        data: { titulo: 'Impresora fiscal' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'facturacion-electronica',
        component: PlaceholderPage,
        data: { titulo: 'Facturación electrónica' },
        canActivate: [roleGuard([UserRole.JEFE])],
      },
      {
        path: 'empleados',
        loadComponent: () =>
          import('./features/employees/pages/employees-list/employees-list').then(
            (m) => m.EmployeesList,
          ),
        data: { titulo: 'Empleados' },
        // La gestión de empleados es exclusiva de los Dueños.
        canActivate: [roleGuard([UserRole.JEFE])],
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'auth/login',
  },
];
