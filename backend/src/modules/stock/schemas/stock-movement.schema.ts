import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { StockMovementType } from '../enums/stock-movement-type.enum';

export type StockMovementDocument = HydratedDocument<StockMovement>;

@Schema({ collection: 'stock_movements', timestamps: true })
export class StockMovement {
  declare _id: Types.ObjectId;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productCode: number;

  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(StockMovementType),
  })
  type: StockMovementType;

  @Prop({ required: true, min: 0 })
  previousStock: number;

  @Prop({ required: true, min: 0 })
  currentStock: number;

  @Prop({ min: 0 })
  previousMinimumStock?: number;

  @Prop({ min: 0 })
  currentMinimumStock?: number;

  @Prop({ type: Number, min: 0, default: null })
  previousAverageCostCents: number | null;

  @Prop({ type: Number, min: 0, default: null })
  currentAverageCostCents: number | null;

  @Prop({ required: true, trim: true, maxlength: 350 })
  reason: string;

  @Prop({ trim: true, default: '' })
  referenceType: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, default: null, index: true })
  referenceId: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  referenceCode: number | null;

  @Prop({ required: true })
  actorId: string;

  @Prop({ required: true, trim: true })
  actorName: string;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ productId: 1, createdAt: -1 });
