import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type PriceListItemDocument = HydratedDocument<PriceListItem>;

@Schema({ collection: 'price_list_items', timestamps: true })
export class PriceListItem {
  declare _id: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'PriceList', index: true }) listaId: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Product', index: true }) productoId: Types.ObjectId;
  @Prop({ required: true, min: 0 }) precioCentavos: number;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true, trim: true }) actorName: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PriceListItemSchema = SchemaFactory.createForClass(PriceListItem);
PriceListItemSchema.index({ listaId: 1, productoId: 1 }, { unique: true });
