import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { EmployeesService } from '../../employees/employees.service';

// Extrae el JWT desde la cookie httpOnly en vez del header Authorization
const cookieExtractor = (req: Request): string | null => {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }

  const token = (cookies as Record<string, unknown>).access_token;
  return typeof token === 'string' ? token : null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly employeesService: EmployeesService,
  ) {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret')!,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const empleado = await this.employeesService.findById(payload.sub);

    if (!empleado?.activo) {
      throw new UnauthorizedException({
        code: 'SESSION_INVALID',
        message: 'La sesión ya no es válida',
      });
    }

    // Roles y datos se obtienen de Mongo en cada solicitud protegida para que
    // una baja o cambio de permisos tenga efecto inmediato.
    return {
      sub: empleado._id.toString(),
      email: empleado.email,
      nombre: empleado.nombre,
      roles: empleado.roles,
    };
  }
}
