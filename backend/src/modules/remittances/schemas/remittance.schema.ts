import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

@Schema({ _id: false })
export class RemittanceItem {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Product', required: true }) productoId: Types.ObjectId;
  @Prop({ required: true }) productoNombre: string;
  @Prop({ required: true, min: 1 }) cantidad: number;
  @Prop({ required: true, min: 0 }) precioFinalUnitarioCentavos: number;
  @Prop({ required: true, min: 0 }) totalCentavos: number;
}

export type RemittanceDocument = HydratedDocument<Remittance>;
@Schema({ collection: 'remittances', timestamps: true })
export class Remittance {
  declare _id: Types.ObjectId;
  @Prop({ required: true, unique: true, index: true }) codigo: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Client', required: true }) clienteId: Types.ObjectId;
  @Prop({ required: true }) clienteCodigo: number;
  @Prop({ required: true }) clienteNombre: string;
  @Prop({ default: '' }) clienteDireccion: string;
  @Prop({ default: '' }) clienteLocalidad: string;
  @Prop({ type: [SchemaFactory.createForClass(RemittanceItem)], required: true }) items: RemittanceItem[];
  @Prop({ required: true, default: 0 }) transporteDescargaCentavos: number;
  @Prop({ required: true }) totalCentavos: number;
  @Prop({ default: '' }) observaciones: string;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
  declare createdAt: Date;
}
export const RemittanceSchema = SchemaFactory.createForClass(Remittance);
