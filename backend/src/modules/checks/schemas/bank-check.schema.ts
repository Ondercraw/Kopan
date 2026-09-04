import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CheckStatus } from '../enums/check-status.enum';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export type BankCheckDocument = HydratedDocument<BankCheck>;

@Schema({ collection: 'checks', timestamps: true })
export class BankCheck {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, min: 1 }) codigo: number;
  @Prop({ required: true, trim: true, unique: true, index: true, maxlength: 50 }) numero: string;
  @Prop({ required: true, trim: true, maxlength: 80 }) banco: string;
  @Prop({ required: true, trim: true, maxlength: 180 }) domicilioPago: string;
  @Prop({ required: true, trim: true, maxlength: 120 }) titular: string;
  @Prop({ required: true, trim: true, maxlength: 180 }) domicilioTitular: string;
  @Prop({ required: true, trim: true, maxlength: 11 }) libradorCuit: string;
  @Prop({ required: true, min: 1 }) montoCentavos: number;
  @Prop({ required: true, trim: true, maxlength: 500 }) montoLetras: string;
  @Prop({ type: Date, default: null }) fechaEmision: Date | null;
  @Prop({ trim: true, maxlength: 80, default: '' }) lugarEmision: string;
  @Prop({ required: true, default: false }) diferido: boolean;
  @Prop({ type: Date, default: null, index: true }) fechaCobro: Date | null;
  @Prop({ required: true, type: String, enum: CheckStatus, default: CheckStatus.PENDING, index: true })
  estado: CheckStatus;
  @Prop({ type: Date, default: null }) cobradoAt: Date | null;
  @Prop({ type: String, enum: [FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER], default: null })
  destinoCobro: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', default: null, index: true })
  clienteId: Types.ObjectId | null;
  @Prop({ trim: true, maxlength: 120, default: '' }) clienteNombre: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Sale', default: null, index: true })
  ventaId: Types.ObjectId | null;
  @Prop({ type: Number, default: null }) ventaCodigo: number | null;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const BankCheckSchema = SchemaFactory.createForClass(BankCheck);
