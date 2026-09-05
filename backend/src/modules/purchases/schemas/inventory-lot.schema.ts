import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { PurchaseKind } from '../enums/purchase.enum';

export type InventoryLotDocument = HydratedDocument<InventoryLot>;

@Schema({ collection: 'inventory_lots', timestamps: true })
export class InventoryLot {
  declare _id: Types.ObjectId;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    index: true,
  })
  productId: Types.ObjectId;
  @Prop({
    default: null,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Purchase',
    index: true,
  })
  purchaseId: Types.ObjectId;
  @Prop({ type: Number, default: null }) purchaseCode: number | null;
  @Prop({ min: 1, default: 1 }) lineNumber: number;
  @Prop({
    default: null,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Supplier',
    index: true,
  })
  supplierId: Types.ObjectId;
  @Prop({ default: '', trim: true }) supplierName: string;
  @Prop({ required: true, min: 1 }) initialQuantity: number;
  @Prop({ required: true, min: 0 }) remainingQuantity: number;
  @Prop({ required: true, min: 0 }) unitCostCents: number;
  @Prop({
    required: true,
    type: String,
    enum: [...Object.values(PurchaseKind), 'AJUSTE'],
  })
  kind: PurchaseKind | 'AJUSTE';
  @Prop({ required: true, type: Date, index: true }) receivedAt: Date;
  @Prop({ required: true, default: false, index: true }) cancelled: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const InventoryLotSchema = SchemaFactory.createForClass(InventoryLot);
InventoryLotSchema.index({ productId: 1, receivedAt: 1, createdAt: 1 });
InventoryLotSchema.index(
  { purchaseId: 1, lineNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { purchaseId: { $type: 'objectId' } },
  },
);
