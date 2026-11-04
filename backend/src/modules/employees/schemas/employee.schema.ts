import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { UserRole } from '../../../common/enums/user-role.enum';

export type EmployeeDocument = HydratedDocument<Employee>;

export interface SellerCommissionRule {
  _id?: Types.ObjectId;
  scope: 'RUBRO' | 'PRODUCTO';
  rubro?: string;
  productoId?: Types.ObjectId;
  mode: 'PORCENTAJE' | 'MONTO_FIJO';
  value: number;
}

@Schema({ timestamps: true })
export class Employee {
  declare _id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  nombre: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // Nunca se devuelve en las respuestas (select: false por defecto en las queries)
  @Prop({ required: true, select: false })
  passwordHash: string;

  // Un empleado puede tener uno o varios roles a la vez.
  // Para sumar un rol nuevo: agregarlo en UserRole
  // (common/enums/user-role.enum.ts). No hace falta tocar nada más acá,
  // el array acepta cualquier valor del enum automáticamente.
  @Prop({ type: [String], enum: UserRole, required: true })
  roles: UserRole[];

  @Prop({ default: true })
  activo: boolean;

  // El porcentaje se guarda en puntos base (10000 = 100 %); el monto fijo en centavos.
  @Prop({ type: [{ scope: String, rubro: String, productoId: MongooseSchema.Types.ObjectId,
    mode: String, value: Number }], default: [] })
  comisiones: SellerCommissionRule[];

  // Para sumar un campo nuevo al empleado (ej. dni, cuit, edad):
  // agregar acá un @Prop() con su tipo, y también en CreateEmployeeDto
  // (dto/create-employee.dto.ts) y en el formulario del modal de alta.
}

export const EmployeeSchema = SchemaFactory.createForClass(Employee);
