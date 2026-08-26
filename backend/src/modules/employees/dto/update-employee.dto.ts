import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import {
  ASSIGNABLE_USER_ROLES,
  UserRole,
} from '../../../common/enums/user-role.enum';

export class UpdateEmployeeDto {
  @IsString()
  @MinLength(2, {
    message: 'El nombre debe tener al menos 2 caracteres',
  })
  nombre: string;

  @IsEmail(
    {},
    {
      message: 'El email no es válido',
    },
  )
  email: string;

  @IsArray({
    message: 'Los roles deben ser un array',
  })
  @ArrayNotEmpty({
    message: 'El empleado debe tener al menos un rol',
  })
  @ArrayUnique({ message: 'No se puede repetir el mismo rol' })
  @IsIn(ASSIGNABLE_USER_ROLES, {
    each: true,
    message: 'Uno o más roles son inválidos',
  })
  roles: UserRole[];

  @IsOptional()
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  password?: string;
}
