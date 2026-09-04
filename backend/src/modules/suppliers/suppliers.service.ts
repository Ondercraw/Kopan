import { ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { SaveSupplierDto } from './dto/save-supplier.dto';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';

@Injectable()
export class SuppliersService implements OnModuleInit {
  constructor(
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Counter.name) private readonly counterModel: Model<CounterDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyProductSuppliers();
  }

  findAll() {
    return this.supplierModel.find().sort({ activo: -1, nombre: 1 }).lean().exec();
  }

  findActive() {
    return this.supplierModel.find({ activo: true }).sort({ nombre: 1 }).lean().exec();
  }

  async create(dto: SaveSupplierDto): Promise<SupplierDocument> {
    const codigo = await this.nextCode();
    try {
      return await this.supplierModel.create({ codigo, ...this.normalized(dto) });
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('Ya existe un proveedor con ese CUIT');
      }
      throw error;
    }
  }

  async update(id: string, dto: SaveSupplierDto): Promise<SupplierDocument> {
    try {
      const supplier = await this.supplierModel
        .findByIdAndUpdate(id, { $set: this.normalized(dto) }, { new: true, runValidators: true })
        .exec();
      if (!supplier) throw new NotFoundException('Proveedor no encontrado');
      return supplier;
    } catch (error: unknown) {
      if (this.isDuplicateKey(error)) {
        throw new ConflictException('Ya existe un proveedor con ese CUIT');
      }
      throw error;
    }
  }

  async setActive(id: string, activo: boolean): Promise<SupplierDocument> {
    if (!activo) {
      const products = await this.productModel.countDocuments({ proveedorId: new Types.ObjectId(id), activo: true });
      if (products > 0) {
        throw new ConflictException({
          code: 'SUPPLIER_IN_USE',
          message: `No se puede desactivar: está asignado a ${products} producto(s) activo(s)`,
        });
      }
    }
    const supplier = await this.supplierModel.findByIdAndUpdate(id, { activo }, { new: true }).exec();
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  async assertActive(id?: string): Promise<SupplierDocument | null> {
    if (!id) return null;
    const supplier = await this.supplierModel.findOne({ _id: id, activo: true }).exec();
    if (!supplier) throw new NotFoundException('El proveedor seleccionado no existe o está inactivo');
    return supplier;
  }

  private normalized(dto: SaveSupplierDto) {
    return {
      nombre: dto.nombre.trim(),
      cuit: this.onlyDigits(dto.cuit),
      contacto: dto.contacto?.trim() ?? '',
      telefono: dto.telefono?.trim() ?? '',
      email: dto.email?.trim().toLowerCase() ?? '',
      direccion: dto.direccion?.trim() ?? '',
      localidad: dto.localidad?.trim() ?? '',
      observaciones: dto.observaciones?.trim() ?? '',
    };
  }

  private onlyDigits(value?: string): string {
    return value?.replace(/\D/g, '') ?? '';
  }

  private async nextCode(): Promise<number> {
    const counter = await this.counterModel.findOneAndUpdate(
      { key: 'supplierCode' },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    if (!counter) throw new Error('No se pudo generar el código del proveedor');
    return counter.value;
  }

  private async migrateLegacyProductSuppliers(): Promise<void> {
    const legacyProducts = await this.productModel
      .find({ proveedorId: { $exists: false }, proveedor: { $type: 'string', $ne: '' } })
      .select('_id +proveedor')
      .lean<Array<{ _id: Types.ObjectId; proveedor: string }>>()
      .exec();

    for (const product of legacyProducts) {
      const name = product.proveedor.trim();
      let supplier = await this.supplierModel.findOne({ nombre: new RegExp(`^${this.escape(name)}$`, 'i') }).exec();
      if (!supplier) {
        supplier = await this.supplierModel.create({ codigo: await this.nextCode(), nombre: name });
      }
      // Usamos la colección nativa para que la migración también funcione si
      // el modelo Product ya había sido compilado por una versión anterior.
      await this.productModel.collection.updateOne(
        { _id: product._id },
        { $set: { proveedorId: supplier._id }, $unset: { proveedor: 1 } },
      );
    }
  }

  private escape(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKey(error: unknown): error is { code: number } {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000;
  }
}
