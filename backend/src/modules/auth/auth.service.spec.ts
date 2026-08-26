import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { EmployeesService } from '../employees/employees.service';
import { EmployeeDocument } from '../employees/schemas/employee.schema';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let findByEmailWithPassword: jest.Mock;
  let jwtSign: jest.Mock;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('password-segura', 4);
  });

  beforeEach(() => {
    findByEmailWithPassword = jest.fn();
    jwtSign = jest.fn().mockReturnValue('token-firmado');

    const employeesService = {
      findByEmailWithPassword,
    } as unknown as EmployeesService;
    const jwtService = { sign: jwtSign } as unknown as JwtService;
    service = new AuthService(employeesService, jwtService);
  });

  it('permite ingresar a un empleado activo con contraseña válida', async () => {
    const empleado = crearEmpleado(true);
    findByEmailWithPassword.mockResolvedValue(empleado);

    await expect(
      service.validarCredenciales(empleado.email, 'password-segura'),
    ).resolves.toBe(empleado);
  });

  it('no revela si el email o la contraseña son incorrectos', async () => {
    findByEmailWithPassword.mockResolvedValue(null);

    await expect(
      service.validarCredenciales('inexistente@kopan.com', 'incorrecta'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('notifica específicamente una cuenta desactivada sólo tras validar su contraseña', async () => {
    findByEmailWithPassword.mockResolvedValue(crearEmpleado(false));

    try {
      await service.validarCredenciales(
        'empleado@kopan.com',
        'password-segura',
      );
      fail('La autenticación debía fallar');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ForbiddenException);
      const response = (error as ForbiddenException).getResponse();
      expect(response).toMatchObject({ code: 'ACCOUNT_DISABLED' });
    }
  });

  function crearEmpleado(activo: boolean): EmployeeDocument {
    return {
      _id: new Types.ObjectId(),
      nombre: 'Empleado Prueba',
      email: 'empleado@kopan.com',
      roles: [UserRole.VENDEDOR],
      passwordHash,
      activo,
    } as EmployeeDocument;
  }
});
