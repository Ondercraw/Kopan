import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PriceListDocument = HydratedDocument<PriceList>;

@Schema({ collection: 'price_lists', timestamps: true })
export class PriceList {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true, min: 1 }) codigo: number;
  @Prop({ required: true, trim: true, maxlength: 100 }) nombre: string;
  @Prop({ trim: true, maxlength: 300, default: '' }) descripcion: string;
  @Prop({ default: true, index: true }) activo: boolean;
  declare createdAt: Date;
  declare updatedAt: Date;
}

export const PriceListSchema = SchemaFactory.createForClass(PriceList);
PriceListSchema.index({ nombre: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } });
