import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import { Counter, CounterDocument } from '../stock/schemas/counter.schema';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../stock/schemas/stock-movement.schema';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';
import {
  Supplier,
  SupplierDocument,
} from '../suppliers/schemas/supplier.schema';
import {
  FinancialMovement,
  FinancialMovementDocument,
} from '../finance/schemas/financial-movement.schema';
import {
  FinancialMovementCategory,
  FinancialMovementKind,
  FinancialPaymentMethod,
} from '../finance/enums/financial-movement.enum';
import { dateRange, purchaseDateTime } from './purchase-calculations';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import {
  PurchaseKind,
  PurchasePaymentMethod,
  PurchaseStatus,
} from './enums/purchase.enum';
import {
  Purchase,
  PurchaseDocument,
  PurchaseItem,
} from './schemas/purchase.schema';
import {
  InventoryLot,
  InventoryLotDocument,
} from './schemas/inventory-lot.schema';
import { InventoryLotsService } from './inventory-lots.service';

interface PurchaseActor {
  id: string;
  name: string;
}

@Injectable()
export class PurchasesService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Purchase.name)
    private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(InventoryLot.name)
    private readonly lotModel: Model<InventoryLotDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(FinancialMovement.name)
    private readonly financeModel: Model<FinancialMovementDocument>,
    private readonly lotsService: InventoryLotsService,
  ) {}

  findAll(filters: { from?: string; to?: string; supplierId?: string } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.supplierId) query.proveedorId = filters.supplierId;
    const range = dateRange(filters.from, filters.to);
    if (Object.keys(range).length) query.fechaCompra = range;
    return this.purchaseModel
      .find(query)
      .sort({ fechaCompra: -1, createdAt: -1 })
      .limit(2000)
      .lean()
      .exec();
  }

  async inventory() {
    const products = await this.productModel
      .find({ activo: true })
      .sort({ codigo: 1 })
      .lean()
      .exec();
    return Promise.all(
      products.map(async (product) => {
        const summary = await this.lotsService.summary(product._id);
        return {
          ...product,
          trackedQuantity: summary.quantity,
          unvaluedQuantity: Math.max(
            0,
            product.cantidadStock - summary.quantity,
          ),
          averageCostCents: summary.quantity
            ? summary.averageCostCents
            : product.costoCentavos,
          lots: summary.lots.map((lot) => ({
            _id: lot._id,
            purchaseCode: lot.purchaseCode,
            supplierName: lot.supplierName,
            initialQuantity: lot.initialQuantity,
            remainingQuantity: lot.remainingQuantity,
            unitCostCents: lot.unitCostCents,
            receivedAt: lot.receivedAt,
            kind: lot.kind,
          })),
        };
      }),
    );
  }

  async supplierAccounts() {
    return this.purchaseModel
      .aggregate([
        {
          $match: {
            estado: PurchaseStatus.CONFIRMED,
            medioPago: PurchasePaymentMethod.CREDIT,
            pagada: false,
          },
        },
        {
          $group: {
            _id: '$proveedorId',
            proveedorNombre: { $first: '$proveedorNombre' },
            deudaCentavos: { $sum: '$totalCentavos' },
            compras: { $sum: 1 },
            proximoVencimiento: { $min: '$vencimiento' },
          },
        },
        { $sort: { proveedorNombre: 1 } },
      ])
      .exec();
  }

  create(dto: CreatePurchaseDto, actor: PurchaseActor) {
    return this.connection.transaction(() =>
      this.createInTransaction(dto, actor),
    );
  }

  private async createInTransaction(
    dto: CreatePurchaseDto,
    actor: PurchaseActor,
  ) {
    const supplier = await this.supplierModel
      .findOne({ _id: dto.supplierId, activo: true })
      .exec();
    if (!supplier)
      throw new NotFoundException('Proveedor inexistente o inactivo');
    const ids = [...new Set(dto.items.map((item) => item.productId))];
    let products = await this.productModel
      .find({ _id: { $in: ids }, activo: true })
      .sort({ _id: 1 })
      .exec();
    if (products.length !== ids.length)
      throw new NotFoundException(
        'Uno o más productos no existen o están inactivos',
      );
    // Bloquea las filas de inventario incluso en valuaciones sin cambio de cantidad.
    for (const product of products)
      await this.productModel
        .updateOne({ _id: product._id }, { $inc: { __v: 1 } })
        .exec();
    products = await this.productModel
      .find({ _id: { $in: ids }, activo: true })
      .sort({ _id: 1 })
      .exec();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));
    const purchaseDate = purchaseDateTime(dto.purchaseDate);
    if (
      !Number.isSafeInteger(
        dto.items.reduce(
          (sum, item) => sum + item.quantity * item.unitCostCents,
          0,
        ),
      )
    )
      throw new BadRequestException(
        'El importe de la compra excede el máximo permitido',
      );
    if (
      dto.dueDate &&
      new Date(dto.dueDate).getTime() <
        new Date(new Date(purchaseDate.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)).getTime()
    )
      throw new BadRequestException(
        'El vencimiento no puede ser anterior a la compra',
      );
    if (dto.kind === PurchaseKind.PURCHASE) {
      for (const product of products) {
        const valued = await this.lotsService.summary(product._id);
        if (valued.quantity < product.cantidadStock)
          throw new ConflictException(
            'Primero valorá el stock existente de ' +
              product.nombre +
              ' desde Compras',
          );
      }
    }
    if (dto.kind === PurchaseKind.OPENING_STOCK) {
      for (const product of products) {
        const requested = dto.items
          .filter((x) => x.productId === product._id.toString())
          .reduce((s, x) => s + x.quantity, 0);
        const tracked = (await this.lotsService.summary(product._id)).quantity;
        const unvalued = Math.max(0, product.cantidadStock - tracked);
        if (requested !== unvalued)
          throw new ConflictException(
            `Debés valorar exactamente ${unvalued} unidades de ${product.nombre}`,
          );
      }
    }
    const codigo = await this.nextCode();
    const purchaseId = new Types.ObjectId();
    const purchaseItems: PurchaseItem[] = [];

    const productOriginals = new Map<
      string,
      {
        stock: number;
        cost: number;
        suppliers: Types.ObjectId[];
        supplier: Types.ObjectId | null;
      }
    >();
    {
      let lineNumber = 0;
      for (const dtoItem of dto.items) {
        lineNumber++;
        const product = byId.get(dtoItem.productId)!;
        const key = product._id.toString();
        if (!productOriginals.has(key))
          productOriginals.set(key, {
            stock: product.cantidadStock,
            cost: product.costoCentavos,
            suppliers: [...(product.proveedorIds ?? [])],
            supplier: product.proveedorId,
          });
        const before = await this.lotsService.summary(product._id);
        const previousStock = product.cantidadStock;
        if (dto.kind === PurchaseKind.PURCHASE)
          product.cantidadStock += dtoItem.quantity;
        await this.lotModel.create({
          productId: product._id,
          purchaseId,
          purchaseCode: codigo,
          lineNumber,
          supplierId: supplier._id,
          supplierName: supplier.nombre,
          initialQuantity: dtoItem.quantity,
          remainingQuantity: dtoItem.quantity,
          unitCostCents: dtoItem.unitCostCents,
          kind: dto.kind,
          receivedAt: purchaseDate,
          cancelled: false,
        });

        const after = await this.lotsService.summary(product._id);
        product.costoCentavos = after.averageCostCents;
        const supplierIds = new Set((product.proveedorIds ?? []).map(String));
        supplierIds.add(supplier._id.toString());
        product.proveedorIds = [...supplierIds].map(
          (id) => new Types.ObjectId(id),
        );
        product.proveedorId ??= supplier._id;
        await product.save();
        purchaseItems.push({
          productId: product._id,
          productCode: product.codigo,
          productName: product.nombre,
          quantity: dtoItem.quantity,
          unitCostCents: dtoItem.unitCostCents,
          subtotalCents: dtoItem.quantity * dtoItem.unitCostCents,
          previousStock,
          currentStock: product.cantidadStock,
          previousAverageCostCents: before.quantity
            ? before.averageCostCents
            : productOriginals.get(key)!.cost,
          currentAverageCostCents: after.averageCostCents,
          lineNumber,
        } as PurchaseItem);
      }
      const totalCentavos = purchaseItems.reduce(
        (s, x) => s + x.subtotalCents,
        0,
      );
      const paid = dto.paymentMethod !== PurchasePaymentMethod.CREDIT;
      const purchase = await this.purchaseModel.create({
        _id: purchaseId,
        codigo,
        tipo: dto.kind,
        proveedorId: supplier._id,
        proveedorNombre: supplier.nombre,
        items: purchaseItems,
        totalCentavos,
        medioPago: dto.paymentMethod,
        pagada: paid,
        pagadaAt: paid ? purchaseDate : null,
        vencimiento: dto.dueDate ? new Date(dto.dueDate) : null,
        numeroComprobante: dto.documentNumber?.trim() ?? '',
        observaciones: dto.notes?.trim() ?? '',
        fechaCompra: purchaseDate,
        estado: PurchaseStatus.CONFIRMED,
        actorId: actor.id,
        actorName: actor.name,
      });
      for (const id of productOriginals.keys()) {
        const product = byId.get(id)!;
        const first = purchaseItems.find((x) => x.productId.toString() === id)!;
        const last = [...purchaseItems]
          .reverse()
          .find((x) => x.productId.toString() === id)!;
        const qty = purchaseItems
          .filter((x) => x.productId.toString() === id)
          .reduce((s, x) => s + x.quantity, 0);
        await this.movementModel.create({
          productId: product._id,
          productCode: product.codigo,
          productName: product.nombre,
          type:
            dto.kind === PurchaseKind.PURCHASE
              ? StockMovementType.PURCHASE
              : StockMovementType.OPENING_VALUATION,
          previousStock: first.previousStock,
          currentStock: last.currentStock,
          previousAverageCostCents: first.previousAverageCostCents,
          currentAverageCostCents: last.currentAverageCostCents,
          reason:
            dto.kind === PurchaseKind.PURCHASE
              ? `Compra #${codigo}: ingreso de ${qty} unidades`
              : `Valuación inicial #${codigo}: ${qty} unidades`,
          referenceType: 'PURCHASE',
          referenceId: purchase._id,
          referenceCode: codigo,
          actorId: actor.id,
          actorName: actor.name,
        });
      }
      await this.financeModel.create({
        sourceKey: `purchase:${purchase._id.toString()}:expense`,
        tipo: FinancialMovementKind.EXPENSE,
        categoria: FinancialMovementCategory.PURCHASE,
        montoCentavos: totalCentavos,
        concepto: `${dto.kind === PurchaseKind.PURCHASE ? 'Compra' : 'Valuación inicial'} #${codigo} - ${supplier.nombre}`,
        detalle: purchaseItems
          .map(
            (x) =>
              `${x.productName}: ${x.quantity} x $${(x.unitCostCents / 100).toLocaleString('es-AR')}`,
          )
          .join(' · ')
          .slice(0, 500),
        medioPago: paid
          ? (dto.paymentMethod as unknown as FinancialPaymentMethod)
          : null,
        disponible: false,
        pagado: paid,
        pagadoAt: paid ? purchaseDate : null,
        fechaMovimiento: purchaseDate,
        proveedorId: supplier._id,
        proveedorNombre: supplier.nombre,
        compraId: purchase._id,
        compraCodigo: codigo,
        actorId: actor.id,
        actorName: actor.name,
      });
      return purchase;
    }
  }

  pay(id: string, method: PurchasePaymentMethod, actor: PurchaseActor) {
    return this.connection.transaction(() =>
      this.payInTransaction(id, method, actor),
    );
  }

  private async payInTransaction(
    id: string,
    method: PurchasePaymentMethod,
    actor: PurchaseActor,
  ) {
    if (method === PurchasePaymentMethod.CREDIT)
      throw new BadRequestException('Elegí efectivo o transferencia');
    const now = new Date();
    const purchase = await this.purchaseModel
      .findOneAndUpdate(
        {
          _id: id,
          estado: PurchaseStatus.CONFIRMED,
          medioPago: PurchasePaymentMethod.CREDIT,
          pagada: false,
        },
        { $set: { pagada: true, pagadaAt: now, medioPago: method } },
        { new: true },
      )
      .exec();
    if (!purchase)
      throw new ConflictException(
        'La compra no está pendiente o ya fue pagada',
      );
    await this.financeModel
      .updateOne(
        { compraId: purchase._id },
        {
          $set: {
            pagado: true,
            pagadoAt: now,
            medioPago: method,
            actorId: actor.id,
            actorName: actor.name,
          },
        },
      )
      .exec();
    return purchase;
  }

  paySupplierAccount(
    supplierId: string,
    method: PurchasePaymentMethod,
    actor: PurchaseActor,
  ) {
    return this.connection.transaction(() =>
      this.paySupplierAccountInTransaction(supplierId, method, actor),
    );
  }

  private async paySupplierAccountInTransaction(
    supplierId: string,
    method: PurchasePaymentMethod,
    actor: PurchaseActor,
  ) {
    if (method === PurchasePaymentMethod.CREDIT)
      throw new BadRequestException('Elegí efectivo o transferencia');
    const purchases = await this.purchaseModel
      .find({
        proveedorId: supplierId,
        estado: PurchaseStatus.CONFIRMED,
        medioPago: PurchasePaymentMethod.CREDIT,
        pagada: false,
      })
      .exec();
    if (!purchases.length)
      throw new ConflictException('El proveedor no tiene deuda pendiente');
    const now = new Date();
    const ids = purchases.map((purchase) => purchase._id);
    await this.purchaseModel
      .updateMany(
        { _id: { $in: ids }, pagada: false },
        { $set: { pagada: true, pagadaAt: now, medioPago: method } },
      )
      .exec();
    await this.financeModel
      .updateMany(
        { compraId: { $in: ids }, cancelado: { $ne: true } },
        {
          $set: {
            pagado: true,
            pagadoAt: now,
            medioPago: method,
            actorId: actor.id,
            actorName: actor.name,
          },
        },
      )
      .exec();
    return {
      paidPurchases: ids.length,
      totalCents: purchases.reduce(
        (sum, purchase) => sum + purchase.totalCentavos,
        0,
      ),
    };
  }

  cancel(id: string, reason: string, actor: PurchaseActor) {
    return this.connection.transaction(() =>
      this.cancelInTransaction(id, reason, actor),
    );
  }

  private async cancelInTransaction(
    id: string,
    reason: string,
    actor: PurchaseActor,
  ) {
    const purchase = await this.purchaseModel
      .findOne({ _id: id, estado: PurchaseStatus.CONFIRMED })
      .exec();
    if (!purchase)
      throw new ConflictException('La compra ya fue cancelada o no existe');
    const lots = await this.lotModel
      .find({ purchaseId: purchase._id, cancelled: false })
      .exec();
    if (lots.some((lot) => lot.remainingQuantity !== lot.initialQuantity))
      throw new ConflictException(
        'No se puede cancelar: ya se vendieron unidades de esta compra',
      );
    const grouped = new Map<string, number>();
    for (const lot of lots)
      grouped.set(
        lot.productId.toString(),
        (grouped.get(lot.productId.toString()) ?? 0) + lot.initialQuantity,
      );
    const changed: Array<{ product: ProductDocument; quantity: number }> = [];
    for (const [productId, quantity] of grouped) {
      const condition: Record<string, unknown> = { _id: productId };
      const update: Record<string, unknown> = { $inc: { __v: 1 } };
      if (purchase.tipo === PurchaseKind.PURCHASE) {
        condition.cantidadStock = { $gte: quantity };
        update.$inc = { cantidadStock: -quantity, __v: 1 };
      }
      const product = await this.productModel
        .findOneAndUpdate(condition, update, { new: true })
        .exec();
      if (!product)
        throw new ConflictException(
          'No hay stock suficiente para cancelar la compra',
        );
      changed.push({ product, quantity });
    }
    await this.lotModel
      .updateMany(
        { purchaseId: purchase._id },
        { $set: { cancelled: true, remainingQuantity: 0 } },
      )
      .exec();
    for (const { product, quantity } of changed) {
      const summary = await this.lotsService.summary(product._id);
      const previousCost = product.costoCentavos;
      product.costoCentavos = summary.averageCostCents;
      await product.save();
      await this.movementModel.create({
        productId: product._id,
        productCode: product.codigo,
        productName: product.nombre,
        type:
          purchase.tipo === PurchaseKind.PURCHASE
            ? StockMovementType.PURCHASE_CANCELLATION
            : StockMovementType.VALUATION_CANCELLATION,
        previousStock:
          purchase.tipo === PurchaseKind.PURCHASE
            ? product.cantidadStock + quantity
            : product.cantidadStock,
        currentStock: product.cantidadStock,
        previousAverageCostCents: previousCost,
        currentAverageCostCents: product.costoCentavos,
        reason: `Cancelación de ${purchase.tipo === PurchaseKind.PURCHASE ? 'compra' : 'valuación'} #${purchase.codigo}: ${reason.trim()}`,
        referenceType: 'PURCHASE',
        referenceId: purchase._id,
        referenceCode: purchase.codigo,
        actorId: actor.id,
        actorName: actor.name,
      });
    }
    purchase.estado = PurchaseStatus.CANCELLED;
    purchase.motivoCancelacion = reason.trim();
    purchase.canceladaAt = new Date();
    purchase.canceladaPorId = actor.id;
    purchase.canceladaPorNombre = actor.name;
    await purchase.save();
    await this.financeModel
      .updateOne(
        { compraId: purchase._id },
        {
          $set: {
            cancelado: true,
            motivoCancelacion: reason.trim(),
            canceladoAt: new Date(),
            canceladoPorId: actor.id,
            canceladoPorNombre: actor.name,
          },
        },
      )
      .exec();
    return purchase;
  }

  private async nextCode() {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { key: 'purchaseCode' },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();
    if (!counter) throw new Error('No se pudo generar el número de compra');
    return counter.value;
  }
}
