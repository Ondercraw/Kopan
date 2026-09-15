import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export type AccountPaymentDocument = HydratedDocument<AccountPayment>;

@Schema({ collection: 'account_payments', timestamps: true })
export class AccountPayment {
  declare _id: Types.ObjectId;
  @Prop({ required: true, enum: ['CLIENTE', 'PROVEEDOR'], index: true })
  tipoCuenta: 'CLIENTE' | 'PROVEEDOR';
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  entidadId: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 120 }) entidadNombre: string;
  @Prop({ required: true, enum: ['VENTA', 'COMPRA'] }) comprobanteTipo: 'VENTA' | 'COMPRA';
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  comprobanteId: Types.ObjectId;
  @Prop({ required: true, min: 1 }) comprobanteCodigo: number;
  @Prop({ required: true, min: 1 }) montoCentavos: number;
  @Prop({ required: true, enum: [FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER] })
  medioPago: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
  @Prop({ required: true, default: Date.now, index: true }) fecha: Date;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true, trim: true }) actorName: string;
  declare createdAt: Date;
}

export const AccountPaymentSchema = SchemaFactory.createForClass(AccountPayment);
AccountPaymentSchema.index({ comprobanteId: 1, fecha: -1 });
