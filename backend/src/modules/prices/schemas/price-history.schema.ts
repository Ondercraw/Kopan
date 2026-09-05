import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PriceHistoryDocument = HydratedDocument<PriceHistory>;

@Schema({ collection: 'price_history', timestamps: true })
export class PriceHistory {
  declare _id: Types.ObjectId;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'PriceList',
    index: true,
  })
  listaId: Types.ObjectId;
  @Prop({
    required: true,
    type: MongooseSchema.Types.ObjectId,
    ref: 'Product',
    index: true,
  })
  productoId: Types.ObjectId;
  @Prop({ required: true, min: 0 }) precioCentavos: number;
  @Prop({ type: Number, min: 0, default: null }) precioAnteriorCentavos:
    number | null;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true, trim: true }) actorName: string;
  @Prop({ required: true, type: Date, index: true }) vigenteDesde: Date;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);
PriceHistorySchema.index({ listaId: 1, productoId: 1, vigenteDesde: -1 });
