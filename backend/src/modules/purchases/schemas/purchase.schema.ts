import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  PurchaseKind,
  PurchasePaymentMethod,
  PurchaseStatus,
} from '../enums/purchase.enum';

@Schema({ _id: false })
export class PurchaseItem {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  productId: Types.ObjectId;
  @Prop({ required: true, min: 1 }) productCode: number;
  @Prop({ required: true, trim: true }) productName: string;
  @Prop({ required: true, min: 1 }) quantity: number;
  @Prop({ required: true, min: 0 }) unitCostCents: number;
  @Prop({ required: true, min: 0 }) subtotalCents: number;
  @Prop({ required: true, min: 0 }) previousStock: number;
  @Prop({ required: true, min: 0 }) currentStock: number;
  @Prop({ required: true, min: 0 }) previousAverageCostCents: number;
  @Prop({ required: true, min: 0 }) currentAverageCostCents: number;
  @Prop({ required: true, min: 1 }) lineNumber: number;
}

const PurchaseItemSchema = SchemaFactory.createForClass(PurchaseItem);
export type PurchaseDocument = HydratedDocument<Purchase>;

@Schema({ collection: 'purchases', timestamps: true })
export class Purchase {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, min: 1 }) codigo: number;
  @Prop({
    required: true,
    type: String,
    enum: Object.values(PurchaseKind),
    index: true,
  })
  tipo: PurchaseKind;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Supplier',
    index: true,
  })
  proveedorId: Types.ObjectId;
  @Prop({ required: true, trim: true }) proveedorNombre: string;
  @Prop({ required: true, type: [PurchaseItemSchema] }) items: PurchaseItem[];
  @Prop({ required: true, min: 0 }) totalCentavos: number;
  @Prop({
    required: true,
    type: String,
    enum: Object.values(PurchasePaymentMethod),
    index: true,
  })
  medioPago: PurchasePaymentMethod;
  @Prop({ required: true, default: false, index: true }) pagada: boolean;
  @Prop({ type: Date, default: null }) pagadaAt: Date | null;
  @Prop({ type: Date, default: null, index: true }) vencimiento: Date | null;
  @Prop({ trim: true, maxlength: 80, default: '' }) numeroComprobante: string;
  @Prop({ trim: true, maxlength: 500, default: '' }) observaciones: string;
  @Prop({ required: true, type: Date, index: true }) fechaCompra: Date;
  @Prop({
    required: true,
    type: String,
    enum: Object.values(PurchaseStatus),
    index: true,
  })
  estado: PurchaseStatus;
  @Prop({ trim: true, maxlength: 300, default: '' }) motivoCancelacion: string;
  @Prop({ type: Date, default: null }) canceladaAt: Date | null;
  @Prop({ default: '' }) canceladaPorId: string;
  @Prop({ trim: true, default: '' }) canceladaPorNombre: string;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true, trim: true }) actorName: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PurchaseSchema = SchemaFactory.createForClass(Purchase);
PurchaseSchema.index({ proveedorId: 1, fechaCompra: -1 });
