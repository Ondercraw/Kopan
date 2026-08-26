import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
  HostListener,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ETIQUETAS_ROL,
  normalizeUserRoles,
  UserRole,
} from '../../../../core/models/user-role.enum';
import { Employee } from '../../models/employee.model';
import { EmployeesService } from '../../services/employees.service';

// Roles disponibles para elegir.
const ROLES_DISPONIBLES: UserRole[] = [UserRole.JEFE, UserRole.VENDEDOR, UserRole.EMPLEADO_STOCK];

@Component({
  selector: 'app-employee-form-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './employee-form-modal.html',
  styleUrl: './employee-form-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeFormModal implements OnChanges {
  private readonly fb = inject(FormBuilder);
  private readonly employeesService = inject(EmployeesService);

  /**
   * Si llega un empleado, el modal funciona en modo edición.
   * Si es null/undefined, funciona en modo creación.
   */
  @Input() empleadoAEditar: Employee | null = null;

  @Output() cerrado = new EventEmitter<void>();

  /**
   * Se emite tanto después de crear como después de modificar.
   */
  @Output() guardado = new EventEmitter<void>();

  readonly rolesDisponibles = ROLES_DISPONIBLES;
  readonly etiquetasRol = ETIQUETAS_ROL;

  readonly guardando = signal(false);
  readonly errorMensaje = signal<string | null>(null);

  readonly rolesSeleccionados = signal<UserRole[]>([]);

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.minLength(8)]],
  });

  /**
   * Permite saber fácilmente si estamos editando.
   */
  get modoEdicion(): boolean {
    return !!this.empleadoAEditar;
  }

  get rolesInvalidos(): boolean {
    return this.rolesSeleccionados().length === 0;
  }

  /**
   * Cuando Angular recibe/cambia el empleado a editar,
   * precargamos el formulario.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['empleadoAEditar']) {
      this.cargarDatosEmpleado();
    }
  }

  private cargarDatosEmpleado(): void {
    this.errorMensaje.set(null);
    this.guardando.set(false);

    if (!this.empleadoAEditar) {
      // Modo creación.
      this.form.reset({
        nombre: '',
        email: '',
        password: '',
      });

      this.form.controls.password.setValidators([Validators.required, Validators.minLength(8)]);

      this.form.controls.password.updateValueAndValidity();

      this.rolesSeleccionados.set([]);

      return;
    }

    // Modo edición.
    this.form.reset({
      nombre: this.empleadoAEditar.nombre,
      email: this.empleadoAEditar.email,
      password: '',
    });

    // En edición la contraseña NO es obligatoria.
    this.form.controls.password.setValidators([Validators.minLength(8)]);

    this.form.controls.password.updateValueAndValidity();

    this.rolesSeleccionados.set(normalizeUserRoles(this.empleadoAEditar.roles));
  }

  toggleRol(rol: UserRole): void {
    const actuales = this.rolesSeleccionados();
    const yaEstaba = actuales.includes(rol);

    this.rolesSeleccionados.set(yaEstaba ? actuales.filter((r) => r !== rol) : [...actuales, rol]);
  }

  quitarRol(rol: UserRole): void {
    this.rolesSeleccionados.update((actuales) => actuales.filter((r) => r !== rol));
  }

  onSubmit(): void {
    if (this.form.invalid || this.rolesInvalidos || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    this.errorMensaje.set(null);

    const valores = this.form.getRawValue();

    if (this.modoEdicion && this.empleadoAEditar) {
      this.modificarEmpleado(valores);
      return;
    }

    this.crearEmpleado(valores);
  }

  private crearEmpleado(valores: { nombre: string; email: string; password: string }): void {
    this.employeesService
      .create({
        nombre: valores.nombre,
        email: valores.email,
        password: valores.password,
        roles: this.rolesSeleccionados(),
      })
      .subscribe({
        next: () => {
          this.guardado.emit();
        },
        error: (err) => {
          const mensaje =
            err.status === 409
              ? 'Ya existe un empleado con ese email'
              : 'No se pudo crear el empleado';

          this.errorMensaje.set(mensaje);
          this.guardando.set(false);
        },
      });
  }

  private modificarEmpleado(valores: { nombre: string; email: string; password: string }): void {
    const id = this.empleadoAEditar!._id;

    this.employeesService
      .actualizar(id, {
        nombre: valores.nombre,
        email: valores.email,
        roles: this.rolesSeleccionados(),

        // Si el campo está vacío, el backend no modifica
        // la contraseña.
        ...(valores.password ? { password: valores.password } : {}),
      })
      .subscribe({
        next: () => {
          this.guardado.emit();
        },
        error: (err) => {
          const mensaje =
            err.status === 409
              ? 'Ya existe un empleado con ese email'
              : 'No se pudo modificar el empleado';

          this.errorMensaje.set(mensaje);
          this.guardando.set(false);
        },
      });
  }

  onCancelar(): void {
    if (this.guardando()) {
      return;
    }

    this.cerrado.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.onCancelar();
  }
}
