import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';

import {
  ETIQUETAS_ROL,
  normalizeUserRoles,
  UserRole,
} from '../../../../core/models/user-role.enum';

import { AuthService } from '../../../../core/services/auth.service';

import { EmployeeFormModal } from '../../components/employee-form-modal/employee-form-modal';
import { ConfirmationModal } from '../../../../shared/components/confirmation-modal/confirmation-modal';

import { Employee } from '../../models/employee.model';

import { EmployeesService } from '../../services/employees.service';

interface RoleGroup {
  rol: UserRole;
  etiqueta: string;
  empleados: Employee[];
}

// Orden de prioridad de los roles.
//
// Si un empleado tiene varios roles, aparecerá solamente
// en el primer rol que encuentre en este listado.
const ORDEN_ROLES: {
  rol: UserRole;
  etiqueta: string;
}[] = [
  {
    rol: UserRole.JEFE,
    etiqueta: 'Dueños',
  },
  {
    rol: UserRole.VENDEDOR,
    etiqueta: 'Vendedores',
  },
  {
    rol: UserRole.EMPLEADO_STOCK,
    etiqueta: 'Empleados de stock',
  },
];

@Component({
  selector: 'app-employees-list',
  standalone: true,
  imports: [EmployeeFormModal, ConfirmationModal],
  templateUrl: './employees-list.html',
  styleUrl: './employees-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeesList implements OnInit {
  private readonly employeesService = inject(EmployeesService);

  private readonly authService = inject(AuthService);

  readonly cargando = signal(true);

  readonly error = signal<string | null>(null);

  readonly grupos = signal<RoleGroup[]>([]);

  readonly modalAbierto = signal(false);

  readonly empleadoAConfirmar = signal<Employee | null>(null);

  readonly accionConfirmar = signal<'deactivate' | 'activate'>('deactivate');

  readonly accionEnCurso = signal(false);

  readonly etiquetasRol = ETIQUETAS_ROL;

  /**
   * Empleado que se está modificando.
   *
   * null = modo agregar
   * Employee = modo modificar
   */
  readonly empleadoAEditar = signal<Employee | null>(null);

  readonly currentUser = this.authService.currentUser;

  ngOnInit(): void {
    this.cargarEmpleados();
  }

  private cargarEmpleados(): void {
    this.cargando.set(true);
    this.error.set(null);

    this.employeesService.findAll().subscribe({
      next: (empleados) => {
        this.grupos.set(this.agruparPorRol(empleados));

        this.cargando.set(false);
      },

      error: () => {
        this.error.set('No se pudo cargar la lista de empleados');

        this.cargando.set(false);
      },
    });
  }

  /**
   * Agrupa cada empleado solamente en su rol
   * de mayor prioridad.
   */
  private agruparPorRol(empleados: Employee[]): RoleGroup[] {
    const empleadosAsignados = new Set<string>();

    return ORDEN_ROLES.map(({ rol, etiqueta }) => {
      const delRol = empleados.filter((empleado) => {
        if (empleadosAsignados.has(empleado._id)) {
          return false;
        }

        if (!normalizeUserRoles(empleado.roles).includes(rol)) {
          return false;
        }

        empleadosAsignados.add(empleado._id);

        return true;
      });

      const ordenados = [...delRol].sort((a, b) => Number(b.activo) - Number(a.activo));

      return {
        rol,
        etiqueta,
        empleados: ordenados,
      };
    }).filter((grupo) => grupo.empleados.length > 0);
  }

  /**
   * Comprueba si el empleado es el usuario
   * actualmente logueado.
   */
  esUsuarioActual(empleado: Employee): boolean {
    const usuario = this.authService.currentUser();

    if (!usuario) {
      return false;
    }

    return String(usuario.id) === String(empleado._id);
  }

  esJefe(empleado: Employee): boolean {
    return normalizeUserRoles(empleado.roles).includes(UserRole.JEFE);
  }

  /**
   * Abre el modal en modo creación.
   */
  onAgregarEmpleado(): void {
    this.empleadoAEditar.set(null);
    this.modalAbierto.set(true);
  }

  /**
   * Abre el modal en modo edición
   * con los datos del empleado seleccionado.
   */
  onModificarEmpleado(empleado: Employee): void {
    this.empleadoAEditar.set(empleado);
    this.modalAbierto.set(true);
  }

  /**
   * Cierra el modal y limpia el empleado
   * que se estaba editando.
   */
  onCerrarModal(): void {
    this.modalAbierto.set(false);
    this.empleadoAEditar.set(null);
  }

  /**
   * Se ejecuta después de crear o modificar.
   */
  onEmpleadoGuardado(): void {
    this.modalAbierto.set(false);
    this.empleadoAEditar.set(null);
    this.cargarEmpleados();
  }

  onDarDeBaja(empleado: Employee): void {
    // Segunda protección en frontend.
    if (this.esUsuarioActual(empleado)) {
      return;
    }

    if (this.esJefe(empleado)) {
      this.error.set('Un dueño no puede desactivar la cuenta de otro dueño');
      return;
    }

    this.accionConfirmar.set('deactivate');
    this.empleadoAConfirmar.set(empleado);
  }

  onReactivar(empleado: Employee): void {
    this.accionConfirmar.set('activate');
    this.empleadoAConfirmar.set(empleado);
  }

  confirmarCambioEstado(): void {
    const empleado = this.empleadoAConfirmar();
    if (!empleado) return;

    this.accionEnCurso.set(true);
    const request =
      this.accionConfirmar() === 'deactivate'
        ? this.employeesService.desactivar(empleado._id)
        : this.employeesService.activar(empleado._id);

    request.subscribe({
      next: () => {
        this.empleadoAConfirmar.set(null);
        this.accionEnCurso.set(false);
        this.cargarEmpleados();
      },

      error: () => {
        this.empleadoAConfirmar.set(null);
        this.accionEnCurso.set(false);
        this.error.set(
          this.accionConfirmar() === 'deactivate'
            ? 'No se pudo dar de baja al empleado'
            : 'No se pudo reactivar al empleado',
        );
      },
    });
  }
}
