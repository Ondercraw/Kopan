import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsString,
  MinLength,
} from 'class-validator';
import {
  ASSIGNABLE_USER_ROLES,
  UserRole,
} from '../../../common/enums/user-role.enum';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  nombre: string;

  @IsEmail({}, { message: 'El email no es válido' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  // Un empleado puede tener uno o varios roles a la vez.
  // Para sumar un rol nuevo: agregarlo en UserRole
  // (common/enums/user-role.enum.ts), @IsEnum lo valida automáticamente
  // sin tocar nada más acá.
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe asignar al menos un rol' })
  @ArrayUnique({ message: 'No se puede repetir el mismo rol' })
  @IsIn(ASSIGNABLE_USER_ROLES, { each: true, message: 'Rol inválido' })
  roles: UserRole[];

  // Para sumar un campo nuevo al alta de empleado (ej. dni, cuit, edad):
  // agregarlo acá con su validador de class-validator correspondiente,
  // y también en el schema de Mongo (schemas/employee.schema.ts).
}
