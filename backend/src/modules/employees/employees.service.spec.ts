import { Model, Types } from 'mongoose';
import { UserRole } from '../../common/enums/user-role.enum';
import { EmployeesService } from './employees.service';
import { EmployeeDocument } from './schemas/employee.schema';

describe('EmployeesService', () => {
  let findById: jest.Mock;
  let service: EmployeesService;

  beforeEach(() => {
    findById = jest.fn();
    const model = { findById } as unknown as Model<EmployeeDocument>;
    service = new EmployeesService(model);
  });

  it('impide desactivar a cualquier empleado con rol jefe', async () => {
    const { empleado: jefe, save } = crearEmpleado([UserRole.JEFE]);
    findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(jefe) });

    await expect(service.desactivar(jefe._id.toString())).rejects.toMatchObject(
      {
        response: { code: 'BOSS_DEACTIVATION_FORBIDDEN' },
      },
    );
    expect(save).not.toHaveBeenCalled();
  });

  it('realiza la baja lógica de un empleado que no es jefe', async () => {
    const { empleado, save } = crearEmpleado([UserRole.VENDEDOR]);
    findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(empleado) });

    await expect(service.desactivar(empleado._id.toString())).resolves.toBe(
      empleado,
    );
    expect(empleado.activo).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
  });

  function crearEmpleado(roles: UserRole[]): {
    empleado: EmployeeDocument;
    save: jest.Mock;
  } {
    const save = jest.fn().mockResolvedValue(undefined);
    const empleado = {
      _id: new Types.ObjectId(),
      nombre: 'Empleado Prueba',
      email: 'empleado@kopan.com',
      roles,
      passwordHash: 'hash',
      activo: true,
      save,
    } as unknown as EmployeeDocument;
    return { empleado, save };
  }
});
