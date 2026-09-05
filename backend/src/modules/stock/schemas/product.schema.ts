import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { WeightUnit } from '../enums/weight-unit.enum';
import { VatRate } from '../enums/vat-rate.enum';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ collection: 'products', timestamps: true })
export class Product {
  declare _id: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, min: 1 })
  codigo: number;

  /*
   * Especificaciones principales del producto.
   * Si en el futuro cambian las unidades (kg, litros, paquetes), se agregan
   * variantes o se necesita stock por depósito, modificar este bloque junto
   * con CreateProductDto y el modelo/formulario del frontend.
   */
  @Prop({ required: true, trim: true, maxlength: 120 })
  nombre: string;

  @Prop({ required: true, trim: true, maxlength: 80, index: true })
  tipo: string;

  @Prop({ trim: true, maxlength: 500, default: '' })
  descripcionAdicional: string;

  @Prop({ required: true, min: 0, default: 0 })
  cantidadStock: number;

  @Prop({ required: true, min: 0, default: 0 })
  stockMinimo: number;

  // Peso y unidad de una presentación; conservarlos separados evita conversiones confusas en pantalla.
  @Prop({ required: true, min: 0.001 })
  peso: number;

  @Prop({ required: true, type: String, enum: Object.values(WeightUnit) })
  unidadPeso: WeightUnit;

  // Decisión relevada el 21/08/2026: Kopan usa 21%, 10,5% y 0%.
  // La condición fiscal del cliente sigue siendo un dato independiente.
  @Prop({
    required: true,
    type: Number,
    enum: [0, 10.5, 21],
    default: VatRate.TWENTY_ONE,
  })
  alicuotaIva: VatRate;

  // Los importes monetarios se guardan en centavos para evitar errores de punto flotante.
  @Prop({ required: true, min: 0, default: 0 })
  costoCentavos: number;

  // Campo heredado: sólo se conserva para migrar instalaciones que guardaban
  // el proveedor como texto. Las operaciones nuevas usan proveedorId.
  @Prop({ trim: true, maxlength: 120, select: false })
  proveedor?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Supplier',
    default: null,
    index: true,
  })
  proveedorId: Types.ObjectId | null;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Supplier' }],
    default: [],
    index: true,
  })
  proveedorIds: Types.ObjectId[];

  @Prop({ default: true, index: true })
  activo: boolean;

  declare createdAt: Date;
  declare updatedAt: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
