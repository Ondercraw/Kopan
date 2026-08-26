import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { StockMovementType } from './enums/stock-movement-type.enum';
import { STOCK_ADJUSTMENT_REASON_LABELS } from './enums/stock-adjustment-reason.enum';
import { Counter, CounterDocument } from './schemas/counter.schema';
import { Product, ProductDocument } from './schemas/product.schema';
import {
  StockMovement,
  StockMovementDocument,
} from './schemas/stock-movement.schema';
import { SuppliersService } from '../suppliers/suppliers.service';

export interface StockActor {
  id: string;
  name: string;
}

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    private readonly suppliersService: SuppliersService,
  ) {}

  async findAll(): Promise<Product[]> {
    return this.productModel.find({ activo: true }).populate('proveedorId', 'codigo nombre activo').sort({ codigo: 1 }).exec();
  }

  async findInactive(): Promise<Product[]> {
    return this.productModel.find({ activo: false }).populate('proveedorId', 'codigo nombre activo').sort({ codigo: 1 }).exec();
  }

  async findMovements(productId: string): Promise<StockMovement[]> {
    return this.movementModel
      .find({ productId })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();
  }

  async create(
    dto: CreateProductDto,
    actor: StockActor,
  ): Promise<ProductDocument> {
    await this.suppliersService.assertActive(dto.proveedorId);
    const codigo = await this.nextProductCode();
    const product = await this.productModel.create({
      codigo,
      nombre: dto.nombre.trim(),
      tipo: dto.tipo.trim(),
      descripcionAdicional: dto.descripcionAdicional?.trim() ?? '',
      cantidadStock: dto.cantidadStock,
      stockMinimo: dto.stockMinimo,
      peso: dto.peso,
      unidadPeso: dto.unidadPeso,
      alicuotaIva: dto.alicuotaIva,
      costoCentavos: dto.costoCentavos,
      proveedorId: dto.proveedorId ?? null,
    });

    await this.recordMovement(product, {
      actor,
      type: StockMovementType.INITIAL,
      previousStock: 0,
      currentStock: product.cantidadStock,
      reason: 'Carga inicial del producto',
    });
    return product.populate('proveedorId', 'codigo nombre activo');
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actor: StockActor,
  ): Promise<ProductDocument> {
    const stockDelta = dto.ajusteStock ?? 0;
    if (stockDelta !== 0 && !dto.motivoAjuste) {
      throw new BadRequestException({
        code: 'ADJUSTMENT_REASON_REQUIRED',
        message: 'El motivo del ajuste de stock es obligatorio',
      });
    }
    await this.suppliersService.assertActive(dto.proveedorId);
    const previousProduct = await this.productModel.findById(id).exec();
    if (!previousProduct?.activo) {
      throw new NotFoundException('Producto no encontrado');
    }

    const condition: Record<string, unknown> = { _id: id, activo: true };
    if (stockDelta < 0) {
      condition.cantidadStock = { $gte: Math.abs(stockDelta) };
    }

    const update: Record<string, unknown> = {
      $set: {
        nombre: dto.nombre.trim(),
        tipo: dto.tipo.trim(),
        descripcionAdicional: dto.descripcionAdicional?.trim() ?? '',
        stockMinimo: dto.stockMinimo,
        peso: dto.peso,
        unidadPeso: dto.unidadPeso,
        alicuotaIva: dto.alicuotaIva,
        costoCentavos: dto.costoCentavos,
        proveedorId: dto.proveedorId ?? null,
      },
    };
    if (stockDelta !== 0) {
      update.$inc = { cantidadStock: stockDelta };
    }

    const product = await this.productModel
      .findOneAndUpdate(condition, update, { new: true, runValidators: true })
      .exec();

    if (!product) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message: 'No hay suficientes unidades para realizar la resta',
      });
    }

    if (stockDelta !== 0) {
      const units = Math.abs(stockDelta);
      const reasonLabel = dto.motivoAjuste
        ? STOCK_ADJUSTMENT_REASON_LABELS[dto.motivoAjuste]
        : 'Ajuste manual';
      const observation = dto.observacionAjuste?.trim();
      await this.recordMovement(product, {
        actor,
        type:
          stockDelta > 0
            ? StockMovementType.INCREMENT
            : StockMovementType.DECREMENT,
        previousStock: product.cantidadStock - stockDelta,
        currentStock: product.cantidadStock,
        reason: `${reasonLabel}: ${stockDelta > 0 ? 'ingreso' : 'egreso'} de ${units} ${units === 1 ? 'unidad' : 'unidades'}${observation ? ` — ${observation}` : ''}`,
      });
    }
    if (previousProduct.stockMinimo !== product.stockMinimo) {
      await this.recordMovement(product, {
        actor,
        type: StockMovementType.MINIMUM_CHANGE,
        previousStock: product.cantidadStock,
        currentStock: product.cantidadStock,
        previousMinimumStock: previousProduct.stockMinimo,
        currentMinimumStock: product.stockMinimo,
        reason: `Stock mínimo actualizado de ${previousProduct.stockMinimo} a ${product.stockMinimo} unidades`,
      });
    }
    return product.populate('proveedorId', 'codigo nombre activo');
  }

  async adjustStock(
    id: string,
    dto: AdjustStockDto,
    actor: StockActor,
  ): Promise<{ product: ProductDocument; previousStock: number }> {
    const condition: Record<string, unknown> = { _id: id, activo: true };
    if (dto.delta < 0) {
      condition.cantidadStock = { $gte: 1 };
    }

    const product = await this.productModel
      .findOneAndUpdate(
        condition,
        { $inc: { cantidadStock: dto.delta } },
        { new: true, runValidators: true },
      )
      .exec();

    if (product) {
      const previousStock = product.cantidadStock - dto.delta;
      await this.recordMovement(product, {
        actor,
        type:
          dto.delta > 0
            ? StockMovementType.INCREMENT
            : StockMovementType.DECREMENT,
        previousStock,
        currentStock: product.cantidadStock,
        reason:
          dto.delta > 0
            ? 'Ingreso manual de una unidad'
            : 'Egreso manual de una unidad',
      });
      const populatedProduct = await product.populate('proveedorId', 'codigo nombre activo');
      return {
        product: populatedProduct,
        previousStock,
      };
    }

    const existing = await this.productModel.findById(id).exec();
    if (!existing?.activo) {
      throw new NotFoundException('Producto no encontrado');
    }

    throw new ConflictException({
      code: 'STOCK_ALREADY_ZERO',
      message: 'No se puede restar: el producto ya no tiene stock',
    });
  }

  async deactivateMany(
    productIds: string[],
    actor: StockActor,
  ): Promise<ProductDocument[]> {
    const products = await this.productModel
      .find({ _id: { $in: productIds }, activo: true })
      .exec();

    if (products.length === 0) {
      throw new NotFoundException('No se encontraron productos activos');
    }

    await this.productModel
      .updateMany(
        { _id: { $in: products.map((product) => product._id) } },
        { $set: { activo: false } },
      )
      .exec();

    for (const product of products) {
      product.activo = false;
    }
    await Promise.all(
      products.map((product) =>
        this.recordMovement(product, {
          actor,
          type: StockMovementType.DEACTIVATION,
          previousStock: product.cantidadStock,
          currentStock: product.cantidadStock,
          reason: 'Producto dado de baja',
        }),
      ),
    );
    return products;
  }

  async reactivateMany(
    productIds: string[],
    actor: StockActor,
  ): Promise<ProductDocument[]> {
    const products = await this.productModel
      .find({ _id: { $in: productIds }, activo: false })
      .exec();

    if (products.length === 0) {
      throw new NotFoundException('No se encontraron productos dados de baja');
    }

    await this.productModel
      .updateMany(
        { _id: { $in: products.map((product) => product._id) } },
        { $set: { activo: true } },
      )
      .exec();

    for (const product of products) {
      product.activo = true;
    }
    await Promise.all(
      products.map((product) =>
        this.recordMovement(product, {
          actor,
          type: StockMovementType.REACTIVATION,
          previousStock: product.cantidadStock,
          currentStock: product.cantidadStock,
          reason: 'Producto reactivado',
        }),
      ),
    );
    return products;
  }

  private async recordMovement(
    product: ProductDocument,
    data: {
      actor: StockActor;
      type: StockMovementType;
      previousStock: number;
      currentStock: number;
      previousMinimumStock?: number;
      currentMinimumStock?: number;
      reason: string;
    },
  ): Promise<void> {
    try {
      await this.movementModel.create({
        productId: product._id,
        productCode: product.codigo,
        productName: product.nombre,
        type: data.type,
        previousStock: data.previousStock,
        currentStock: data.currentStock,
        previousMinimumStock: data.previousMinimumStock,
        currentMinimumStock: data.currentMinimumStock,
        reason: data.reason,
        actorId: data.actor.id,
        actorName: data.actor.name,
      });
    } catch (error) {
      // La operación principal ya terminó: registrar el fallo sin provocar un reintento que duplique stock.
      this.logger.error(
        `No se pudo registrar el movimiento de stock del producto ${product._id.toString()}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async nextProductCode(): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { key: 'productCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    if (!counter) {
      throw new Error('No se pudo generar el ID del producto');
    }
    return counter.value;
  }
}
