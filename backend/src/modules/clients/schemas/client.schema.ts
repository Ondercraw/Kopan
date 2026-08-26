import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { TaxCondition } from '../enums/tax-condition.enum';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ _id: false })
export class ClientChange {
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  @Prop({ required: true }) action: string;
  @Prop({ required: true }) detail: string;
  @Prop({ required: true, default: Date.now }) date: Date;
}
const ClientChangeSchema = SchemaFactory.createForClass(ClientChange);

@Schema({ collection: 'clients', timestamps: true })
export class Client {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, min: 1 }) codigo: number;
  @Prop({ required: true, trim: true, maxlength: 120, index: true })
  nombre: string;
  @Prop({ trim: true, maxlength: 120, default: '' }) nombreFantasia: string;
  @Prop({ trim: true, maxlength: 20, default: '' }) cuit: string;
  @Prop({ trim: true, maxlength: 40, default: '' }) telefono: string;
  @Prop({ trim: true, lowercase: true, maxlength: 254, default: '' })
  email: string;
  @Prop({ trim: true, maxlength: 180, default: '' }) direccion: string;
  @Prop({ trim: true, maxlength: 80, default: '', index: true })
  localidad: string;
  @Prop({ trim: true, maxlength: 80, default: '', index: true }) grupo: string;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Employee',
    default: null,
    index: true,
  })
  vendedorId: Types.ObjectId | null;
  @Prop({ type: String, enum: TaxCondition, default: TaxCondition.NOT_DEFINED })
  condicionIva: TaxCondition;
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'PriceList',
    default: null,
    index: true,
  })
  listaPreciosId: Types.ObjectId | null;
  @Prop({ default: false }) permiteCuentaCorriente: boolean;
  @Prop({ required: true, min: 0, default: 0 }) limiteCreditoCentavos: number;
  // Saldo consumido por ventas a crédito. El disponible es límite menos saldo.
  @Prop({ required: true, min: 0, default: 0 })
  saldoCuentaCorrienteCentavos: number;
  @Prop({ trim: true, maxlength: 500, default: '' }) observaciones: string;
  @Prop({ default: true, index: true }) activo: boolean;
  @Prop({ type: [ClientChangeSchema], default: [] })
  historialCambios: ClientChange[];

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);
ClientSchema.index(
  { cuit: 1 },
  { unique: true, partialFilterExpression: { cuit: { $gt: '' } } },
);
