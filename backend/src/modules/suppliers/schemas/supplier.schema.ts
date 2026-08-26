import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SupplierDocument = HydratedDocument<Supplier>;

@Schema({ collection: 'suppliers', timestamps: true })
export class Supplier {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, min: 1 })
  codigo: number;

  @Prop({ required: true, trim: true, maxlength: 120, index: true })
  nombre: string;

  @Prop({ trim: true, maxlength: 20, default: '' })
  cuit: string;

  @Prop({ trim: true, maxlength: 80, default: '' })
  contacto: string;

  @Prop({ trim: true, maxlength: 40, default: '' })
  telefono: string;

  @Prop({ trim: true, lowercase: true, maxlength: 254, default: '' })
  email: string;

  @Prop({ trim: true, maxlength: 180, default: '' })
  direccion: string;

  @Prop({ trim: true, maxlength: 80, default: '' })
  localidad: string;

  @Prop({ trim: true, maxlength: 500, default: '' })
  observaciones: string;

  @Prop({ default: true, index: true })
  activo: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
SupplierSchema.index(
  { cuit: 1 },
  { unique: true, partialFilterExpression: { cuit: { $gt: '' } } },
);
