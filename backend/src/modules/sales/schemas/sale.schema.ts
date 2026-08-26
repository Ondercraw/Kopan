import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { VatRate } from '../../stock/enums/vat-rate.enum';
import { FiscalStatus, SaleStatus } from '../enums/sale-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

@Schema({ _id: false })
export class SaleItem {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product' })
  productoId: Types.ObjectId;
  @Prop({ required: true }) productoCodigo: number;
  @Prop({ required: true }) productoNombre: string;
  @Prop({ required: true, min: 1 }) cantidad: number;
  @Prop({ required: true, min: 0 }) precioUnitarioCentavos: number;
  @Prop({ required: true, min: 0, max: 10000, default: 0 })
  bonificacionPuntosBase: number;
  @Prop({ required: true, type: Number, enum: [0, 10.5, 21] })
  alicuotaIva: VatRate;
  @Prop({ required: true, min: 0, default: 0 }) netoCentavos: number;
  @Prop({ required: true, min: 0, default: 0 }) ivaCentavos: number;
  @Prop({ required: true, min: 0, default: 0 }) costoUnitarioCentavos: number;
  @Prop({ required: true, min: 0 }) totalCentavos: number;
}
const SaleItemSchema = SchemaFactory.createForClass(SaleItem);

export type SaleDocument = HydratedDocument<Sale>;
@Schema({ collection: 'sales', timestamps: true })
export class Sale {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, min: 1 }) codigo: number;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Client',
    index: true,
  })
  clienteId: Types.ObjectId;
  @Prop({ required: true }) clienteCodigo: number;
  @Prop({ required: true }) clienteNombre: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Employee', default: null })
  vendedorId: Types.ObjectId | null;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'PriceList',
  })
  listaPreciosId: Types.ObjectId;
  @Prop({ required: true }) listaPreciosNombre: string;
  @Prop({ type: [SaleItemSchema], required: true }) items: SaleItem[];
  @Prop({ required: true, min: 0, default: 0 }) netoCentavos: number;
  @Prop({ required: true, min: 0, default: 0 }) ivaCentavos: number;
  @Prop({ required: true, min: 0, default: 0 }) costoCentavos: number;
  @Prop({ required: true, min: 0 }) totalCentavos: number;
  @Prop({ required: true, type: String, enum: PaymentMethod })
  medioPago: PaymentMethod;
  @Prop({ trim: true, maxlength: 100, default: '' })
  referenciaTransferencia: string;
  @Prop({
    required: true,
    type: String,
    enum: SaleStatus,
    default: SaleStatus.PROCESSING,
    index: true,
  })
  estado: SaleStatus;
  // La factura se confecciona fuera del sistema con el contador en ARCA.
  @Prop({
    required: true,
    type: String,
    enum: FiscalStatus,
    default: FiscalStatus.PENDING_EXTERNAL,
  })
  estadoFiscal: FiscalStatus;
  @Prop({ trim: true, maxlength: 500, default: '' }) observaciones: string;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}
export const SaleSchema = SchemaFactory.createForClass(Sale);
SaleSchema.index({ medioPago: 1, createdAt: -1 });
