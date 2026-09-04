import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Model } from 'mongoose';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee, EmployeeDocument } from './schemas/employee.schema';
import {
  normalizeUserRoles,
  UserRole,
} from '../../common/enums/user-role.enum';

const BCRYPT_COST = 12;

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async create(
    dto: CreateEmployeeDto,
  ): Promise<Omit<Employee, 'passwordHash'>> {
    const existente = await this.employeeModel.findOne({
      email: this.normalizarEmail(dto.email),
    });

    if (existente) {
      throw new ConflictException('Ya existe un empleado con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    let creado: EmployeeDocument;
    try {
      creado = await this.employeeModel.create({
        nombre: dto.nombre,
        email: this.normalizarEmail(dto.email),
        passwordHash,
        roles: dto.roles,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('Ya existe un empleado con ese email');
      }
      throw error;
    }

    // No devolver nunca el hash, ni siquiera en la respuesta del alta
    return this.sinPassword(creado);
  }

  findAll() {
    return this.employeeModel.find().sort({ nombre: 1 }).lean().exec();
  }

  /**
   * Trae el empleado CON el hash de password incluido.
   * Se usa únicamente desde AuthService para validar el login.
   */
  async findByEmailWithPassword(
    email: string,
  ): Promise<EmployeeDocument | null> {
    return this.employeeModel
      .findOne({ email: this.normalizarEmail(email) })
      .select('+passwordHash')
      .exec();
  }

  async findById(id: string): Promise<EmployeeDocument | null> {
    return this.employeeModel.findById(id).exec();
  }

  /**
   * Baja lógica: nunca borramos el empleado, solo lo desactivamos.
   * Esto preserva el historial (ventas, comisiones, etc.) asociado a su id.
   */
  async desactivar(id: string): Promise<Employee> {
    const actualizado = await this.employeeModel.findById(id).exec();

    if (!actualizado) {
      throw new NotFoundException('Empleado no encontrado');
    }

    if (normalizeUserRoles(actualizado.roles).includes(UserRole.JEFE)) {
      throw new ForbiddenException({
        code: 'BOSS_DEACTIVATION_FORBIDDEN',
        message: 'Un dueño no puede desactivar la cuenta de otro dueño',
      });
    }

    actualizado.activo = false;
    await actualizado.save();

    return actualizado;
  }

  /**
   * Reactivación, por si se dan de baja por error o vuelve a trabajar.
   * No hay botón en el frontend todavía, pero queda listo el endpoint.
   */
  async reactivar(id: string): Promise<Employee> {
    const actualizado = await this.employeeModel
      .findByIdAndUpdate(id, { activo: true }, { new: true })
      .exec();

    if (!actualizado) {
      throw new NotFoundException('Empleado no encontrado');
    }

    return actualizado;
  }

  async actualizar(
    id: string,
    dto: UpdateEmployeeDto,
  ): Promise<Omit<Employee, 'passwordHash'>> {
    const empleado = await this.employeeModel
      .findById(id)
      .select('+passwordHash')
      .exec();

    if (!empleado) {
      throw new NotFoundException('Empleado no encontrado');
    }

    const email = this.normalizarEmail(dto.email);

    const emailEnUso = await this.employeeModel.findOne({
      email,
      _id: { $ne: id },
    });

    if (emailEnUso) {
      throw new ConflictException('Ya existe un empleado con ese email');
    }

    const eraJefe = normalizeUserRoles(empleado.roles).includes(UserRole.JEFE);

    empleado.nombre = dto.nombre;
    empleado.email = email;
    empleado.roles = [...new Set(dto.roles)];

    if (eraJefe && empleado.roles.includes(UserRole.JEFE) === false) {
      const jefesActivos = await this.employeeModel.countDocuments({
        activo: true,
        roles: { $in: [UserRole.JEFE, UserRole.ADMINISTRATIVO] },
      });
      if (jefesActivos <= 1) {
        throw new ForbiddenException({
          code: 'LAST_BOSS_REQUIRED',
          message: 'El sistema debe conservar al menos un dueño activo',
        });
      }
    }

    // Solo modificamos la contraseña si
    // el usuario escribió una nueva.
    if (dto.password) {
      empleado.passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
    }

    let actualizado: EmployeeDocument;
    try {
      actualizado = await empleado.save();
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('Ya existe un empleado con ese email');
      }
      throw error;
    }

    return this.sinPassword(actualizado);
  }

  private sinPassword(
    empleado: EmployeeDocument,
  ): Omit<Employee, 'passwordHash'> {
    const resultado = empleado.toObject();
    Reflect.deleteProperty(resultado, 'passwordHash');
    return resultado;
  }

  private isDuplicateKey(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private normalizarEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
