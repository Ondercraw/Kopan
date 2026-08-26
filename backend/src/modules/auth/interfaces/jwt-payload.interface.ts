import { UserRole } from '../../../common/enums/user-role.enum';

export interface JwtPayload {
  sub: string; // id del empleado
  email: string;
  nombre: string;
  roles: UserRole[]; // un empleado puede tener varios roles
}
