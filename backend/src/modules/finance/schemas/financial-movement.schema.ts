import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  FinancialMovementCategory,
  FinancialMovementKind,
  FinancialPaymentMethod,
} from '../enums/financial-movement.enum';

export type FinancialMovementDocument = HydratedDocument<FinancialMovement>;

@Schema({ collection: 'financial_movements', timestamps: true })
export class FinancialMovement {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) sourceKey: string;
  @Prop({ required: true, type: String, enum: FinancialMovementKind, index: true })
  tipo: FinancialMovementKind;
  @Prop({ required: true, type: String, enum: FinancialMovementCategory, index: true })
  categoria: FinancialMovementCategory;
  @Prop({ required: true, min: 0 }) montoCentavos: number;
  @Prop({ required: true, trim: true, maxlength: 160 }) concepto: string;
  @Prop({ trim: true, maxlength: 500, default: '' }) detalle: string;
  @Prop({ type: String, enum: FinancialPaymentMethod, default: null, index: true })
  medioPago: FinancialPaymentMethod | null;
  @Prop({ type: String, enum: [FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER], default: null, index: true })
  acreditadoEn: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER | null;
  @Prop({ required: true, default: false }) disponible: boolean;
  @Prop({ required: true, default: false }) pagado: boolean;
  @Prop({ type: Date, default: null }) pagadoAt: Date | null;
  @Prop({ required: true, default: false, index: true }) cancelado: boolean;
  @Prop({ trim: true, maxlength: 300, default: '' }) motivoCancelacion: string;
  @Prop({ type: Date, default: null }) canceladoAt: Date | null;
  @Prop({ default: '' }) canceladoPorId: string;
  @Prop({ trim: true, default: '' }) canceladoPorNombre: string;
  @Prop({ required: true, default: Date.now, index: true }) fechaMovimiento: Date;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Sale', default: null, index: true })
  ventaId: Types.ObjectId | null;
  @Prop({ type: Number, default: null }) ventaCodigo: number | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', default: null, index: true })
  clienteId: Types.ObjectId | null;
  @Prop({ trim: true, maxlength: 120, default: '' }) clienteNombre: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Supplier', default: null, index: true })
  proveedorId: Types.ObjectId | null;
  @Prop({ trim: true, maxlength: 120, default: '' }) proveedorNombre: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BankCheck', default: null, index: true })
  chequeId: Types.ObjectId | null;
  @Prop({ trim: true, maxlength: 50, default: '' }) chequeNumero: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'StockMovement', default: null, index: true })
  stockMovementId: Types.ObjectId | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', default: null, index: true })
  productoId: Types.ObjectId | null;
  @Prop({ type: Number, min: 1, default: null }) unidadesReposicion: number | null;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const FinancialMovementSchema = SchemaFactory.createForClass(FinancialMovement);
FinancialMovementSchema.index({ fechaMovimiento: -1, tipo: 1 });
