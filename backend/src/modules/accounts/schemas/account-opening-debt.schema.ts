import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type AccountOpeningDebtDocument = HydratedDocument<AccountOpeningDebt>;
@Schema({ collection: 'account_opening_debts', timestamps: true })
export class AccountOpeningDebt {
  declare _id: Types.ObjectId;
  @Prop({ required: true, enum: ['CLIENTE', 'PROVEEDOR'], index: true })
  tipoCuenta: 'CLIENTE' | 'PROVEEDOR';
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, index: true })
  entidadId: Types.ObjectId;
  @Prop({ required: true, trim: true }) entidadNombre: string;
  @Prop({ required: true, min: 1 }) montoCentavos: number;
  @Prop({ required: true, min: 0, default: 0 }) pagadoCentavos: number;
  @Prop({ trim: true, maxlength: 300, default: '' }) detalle: string;
  @Prop({ required: true, default: Date.now }) fecha: Date;
  @Prop({ default: false }) cancelada: boolean;
  @Prop({ trim: true, maxlength: 300, default: '' }) motivoCancelacion: string;
  @Prop({ type: Date, default: null }) canceladaAt: Date | null;
  @Prop({ required: true }) actorId: string;
  @Prop({ required: true }) actorName: string;
}
export const AccountOpeningDebtSchema = SchemaFactory.createForClass(AccountOpeningDebt);
