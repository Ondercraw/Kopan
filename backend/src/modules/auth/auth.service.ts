import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EmployeesService } from '../employees/employees.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly jwtService: JwtService,
  ) {}

  async validarCredenciales(email: string, password: string) {
    const empleado = await this.employeesService.findByEmailWithPassword(email);

    // Mensaje genérico a propósito: no revelar si el email existe o no
    const credencialesInvalidas = new UnauthorizedException(
      'Email o contraseña incorrectos',
    );

    if (!empleado) {
      throw credencialesInvalidas;
    }

    const passwordValido = await bcrypt.compare(
      password,
      empleado.passwordHash,
    );

    if (!passwordValido) {
      throw credencialesInvalidas;
    }

    if (!empleado.activo) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DISABLED',
        message:
          'Tu cuenta fue desactivada. Consultá con un superior para volver a ingresar.',
      });
    }

    return empleado;
  }

  generarToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }
}
