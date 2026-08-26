import { UserRole } from '../../../core/models/user-role.enum';

export interface Employee {
  _id: string;
  nombre: string;
  email: string;
  roles: UserRole[]; // un empleado puede tener uno o varios roles
  activo: boolean;
  // Para sumar un campo nuevo al empleado (ej. dni, cuit, edad):
  // 1. agregarlo acá
  // 2. agregarlo en CreateEmployeeDto (backend) y en el schema de Mongo
  // 3. agregarlo al formulario del modal de alta (employee-form-modal)
}

// DTO que viaja al backend al crear un empleado (ver CreateEmployeeDto)
export interface CreateEmployeePayload {
  nombre: string;
  email: string;
  password: string;
  roles: UserRole[];
  // Mismo comentario que arriba: si se suma un campo nuevo al alta,
  // agregarlo también acá.
}

export interface UpdateEmployeePayload {
  nombre: string;
  email: string;
  roles: UserRole[];
  password?: string;
  // Mismo comentario que arriba: si se suma un campo nuevo al editar un empleado,
  // agregarlo también acá.
}
