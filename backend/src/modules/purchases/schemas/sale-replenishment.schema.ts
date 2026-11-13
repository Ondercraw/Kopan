import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SaleReplenishmentDocument = HydratedDocument<SaleReplenishment>;

@Schema({ collection: 'sale_replenishments', timestamps: true })
export class SaleReplenishment {
  declare _id: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Sale', index: true })
  saleId: Types.ObjectId;
  @Prop({ required: true, min: 0 }) saleItemIndex: number;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product', index: true })
  productId: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Purchase', default: null, index: true })
  purchaseId: Types.ObjectId | null;
  @Prop({ type: Number, default: null }) purchaseLineNumber: number | null;
  @Prop({ type: Number, min: 1, default: null }) manualUnitCostCents: number | null;
  @Prop({ required: true, min: 1 }) quantity: number;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  declare createdAt: Date;
}

export const SaleReplenishmentSchema = SchemaFactory.createForClass(SaleReplenishment);
SaleReplenishmentSchema.index({ saleId: 1, saleItemIndex: 1, purchaseId: 1, purchaseLineNumber: 1 },
  { unique: true, partialFilterExpression: { purchaseId: { $type: 'objectId' } } });
