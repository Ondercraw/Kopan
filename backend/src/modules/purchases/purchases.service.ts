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
import { UpdatePurchaseItemDto } from './dto/update-purchase-item.dto';
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
      .sort({ nombre: 1, codigo: 1 })
      .populate('proveedorId proveedorIds', 'codigo nombre activo')
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
            deudaCentavos: {
              $sum: {
                $subtract: [
                  '$totalCentavos',
                  { $ifNull: ['$montoPagadoCentavos', 0] },
                ],
              },
            },
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
    const unrelatedProducts = products.filter((product) => {
      const supplierIds = new Set([
        ...(product.proveedorIds ?? []).map(String),
        ...(product.proveedorId ? [String(product.proveedorId)] : []),
      ]);
      return !supplierIds.has(supplier._id.toString());
    });
    if (unrelatedProducts.length)
      throw new BadRequestException(
        `El proveedor no está asociado a: ${unrelatedProducts.map((product) => product.nombre).join(', ')}`,
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
      dto.paymentMethod === PurchasePaymentMethod.HISTORICAL &&
      dto.kind !== PurchaseKind.OPENING_STOCK
    )
      throw new BadRequestException(
        'Pagado antes de usar el sistema solo se admite al valorar stock existente',
      );
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
        new Date(
          new Date(purchaseDate.getTime() - 3 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
        ).getTime()
    )
      throw new BadRequestException(
        'El vencimiento no puede ser anterior a la compra',
      );
    // Una compra nueva puede convivir con unidades anteriores aún sin valorar.
    if (dto.kind === PurchaseKind.OPENING_STOCK) {
      for (const product of products) {
        const requested = dto.items
          .filter((x) => x.productId === product._id.toString())
          .reduce((s, x) => s + x.quantity, 0);
        const tracked = (await this.lotsService.summary(product._id)).quantity;
        const unvalued = Math.max(0, product.cantidadStock - tracked);
        if (requested > unvalued)
          throw new ConflictException(
            `Solo quedan ${unvalued} unidades sin valorar de ${product.nombre}`,
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
        product.ultimoCostoCentavos = await this.lotsService.latestUnitCost(product._id);
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
      // Las compras nuevas se saldan desde Cuentas corrientes; la valuación
      // histórica conserva su modalidad para no recontabilizar inventario previo.
      const paid = dto.kind === PurchaseKind.PURCHASE
        ? false
        : dto.paymentMethod !== PurchasePaymentMethod.CREDIT;
      const paymentMethod = dto.kind === PurchaseKind.PURCHASE
        ? PurchasePaymentMethod.CREDIT
        : dto.paymentMethod;
      const purchase = await this.purchaseModel.create({
        _id: purchaseId,
        codigo,
        tipo: dto.kind,
        proveedorId: supplier._id,
        proveedorNombre: supplier.nombre,
        items: purchaseItems,
        totalCentavos,
        medioPago: paymentMethod,
        pagada: paid,
        montoPagadoCentavos: paid ? totalCentavos : 0,
        montoPagadoEfectivoCentavos:
          paymentMethod === PurchasePaymentMethod.CASH ? totalCentavos : 0,
        montoPagadoTransferenciaCentavos:
          paymentMethod === PurchasePaymentMethod.TRANSFER
            ? totalCentavos
            : 0,
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
          ? (paymentMethod as unknown as FinancialPaymentMethod)
          : null,
        disponible: false,
        pagado: paid,
        montoPagadoCentavos: paid ? totalCentavos : 0,
        montoPagadoEfectivoCentavos:
          paymentMethod === PurchasePaymentMethod.CASH ? totalCentavos : 0,
        montoPagadoTransferenciaCentavos:
          paymentMethod === PurchasePaymentMethod.TRANSFER
            ? totalCentavos
            : 0,
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

  updateItem(
    id: string,
    lineNumber: number,
    dto: UpdatePurchaseItemDto,
    actor: PurchaseActor,
  ) {
    return this.connection.transaction(() =>
      this.updateItemInTransaction(id, lineNumber, dto, actor),
    );
  }

  private async updateItemInTransaction(
    id: string,
    lineNumber: number,
    dto: UpdatePurchaseItemDto,
    actor: PurchaseActor,
  ) {
    if (!Number.isInteger(lineNumber) || lineNumber < 1)
      throw new BadRequestException('Seleccioná un producto válido de la compra');

    const purchase = await this.purchaseModel.findOne({
      _id: id,
      estado: PurchaseStatus.CONFIRMED,
    }).exec();
    if (!purchase) throw new NotFoundException('La compra no existe o está cancelada');

    const item = purchase.items.find((value) => value.lineNumber === lineNumber);
    if (!item) throw new NotFoundException('El producto no pertenece a esta compra');

    const lot = await this.lotModel.findOne({
      purchaseId: purchase._id,
      lineNumber,
      cancelled: false,
    }).exec();
    if (!lot) throw new ConflictException('No se encontró el lote asociado a este producto');

    const consumedQuantity = lot.initialQuantity - lot.remainingQuantity;
    if (consumedQuantity > 0)
      throw new ConflictException(
        `No se puede modificar ${item.productName}: ${consumedQuantity} unidades del lote ya fueron vendidas o retiradas`,
      );

    await this.productModel.updateOne({ _id: item.productId }, { $inc: { __v: 1 } }).exec();
    const product = await this.productModel.findById(item.productId).exec();
    if (!product) throw new NotFoundException('El producto ya no existe');

    const previousQuantity = item.quantity;
    const previousUnitCost = item.unitCostCents;
    const quantityDelta = dto.quantity - previousQuantity;
    const previousStock = product.cantidadStock;
    const before = await this.lotsService.summary(product._id);

    if (purchase.tipo === PurchaseKind.OPENING_STOCK && quantityDelta > 0) {
      const unvalued = Math.max(0, product.cantidadStock - before.quantity);
      if (quantityDelta > unvalued)
        throw new ConflictException(
          `Sólo quedan ${unvalued} unidades sin valorar de ${product.nombre}`,
        );
    }
    if (purchase.tipo === PurchaseKind.PURCHASE) {
      if (product.cantidadStock + quantityDelta < 0)
        throw new ConflictException('No hay stock suficiente para reducir esta compra');
      product.cantidadStock += quantityDelta;
    }

    lot.initialQuantity = dto.quantity;
    lot.remainingQuantity = dto.quantity - consumedQuantity;
    lot.unitCostCents = dto.unitCostCents;
    await lot.save();

    const after = await this.lotsService.summary(product._id);
    product.costoCentavos = after.quantity ? after.averageCostCents : 0;
    product.ultimoCostoCentavos = await this.lotsService.latestUnitCost(product._id);
    await product.save();

    item.quantity = dto.quantity;
    item.unitCostCents = dto.unitCostCents;
    item.subtotalCents = dto.quantity * dto.unitCostCents;
    item.currentStock = product.cantidadStock;
    item.currentAverageCostCents = after.averageCostCents;

    const newTotal = purchase.items.reduce((sum, value) => sum + value.subtotalCents, 0);
    if (!Number.isSafeInteger(newTotal))
      throw new BadRequestException('El importe corregido supera el máximo permitido');
    const paidBefore = purchase.montoPagadoCentavos ?? 0;
    const isCredit = purchase.medioPago === PurchasePaymentMethod.CREDIT;
    if (isCredit && newTotal < paidBefore)
      throw new ConflictException(
        'El nuevo total no puede ser menor que el importe que ya fue pagado',
      );

    purchase.totalCentavos = newTotal;
    if (!isCredit) {
      purchase.montoPagadoCentavos = newTotal;
      purchase.montoPagadoEfectivoCentavos =
        purchase.medioPago === PurchasePaymentMethod.CASH ? newTotal : 0;
      purchase.montoPagadoTransferenciaCentavos =
        purchase.medioPago === PurchasePaymentMethod.TRANSFER ? newTotal : 0;
      purchase.pagada = true;
    } else {
      purchase.pagada = paidBefore === newTotal;
      purchase.pagadaAt = purchase.pagada ? new Date() : null;
    }
    await purchase.save();

    const financeSet: Record<string, unknown> = {
      montoCentavos: newTotal,
      detalle: purchase.items
        .map(
          (value) =>
            `${value.productName}: ${value.quantity} x $${(value.unitCostCents / 100).toLocaleString('es-AR')}`,
        )
        .join(' · ')
        .slice(0, 500),
      pagado: purchase.pagada,
      pagadoAt: purchase.pagadaAt,
      actorId: actor.id,
      actorName: actor.name,
    };
    if (!isCredit) {
      financeSet['montoPagadoCentavos'] = newTotal;
      financeSet['montoPagadoEfectivoCentavos'] = purchase.montoPagadoEfectivoCentavos;
      financeSet['montoPagadoTransferenciaCentavos'] = purchase.montoPagadoTransferenciaCentavos;
    }
    await this.financeModel.updateOne(
      { sourceKey: `purchase:${purchase._id.toString()}:expense` },
      { $set: financeSet },
    ).exec();

    await this.movementModel.create({
      productId: product._id,
      productCode: product.codigo,
      productName: product.nombre,
      type:
        purchase.tipo === PurchaseKind.PURCHASE
          ? StockMovementType.PURCHASE
          : StockMovementType.OPENING_VALUATION,
      previousStock,
      currentStock: product.cantidadStock,
      previousAverageCostCents: before.averageCostCents,
      currentAverageCostCents: after.averageCostCents,
      reason: `Corrección de ${purchase.tipo === PurchaseKind.PURCHASE ? 'compra' : 'valuación'} #${purchase.codigo}: ${previousQuantity} a ${dto.quantity} unidades; costo $${(previousUnitCost / 100).toLocaleString('es-AR')} a $${(dto.unitCostCents / 100).toLocaleString('es-AR')}`,
      referenceType: 'PURCHASE',
      referenceId: purchase._id,
      referenceCode: purchase.codigo,
      actorId: actor.id,
      actorName: actor.name,
    });

    return purchase;
  }

  pay(
    id: string,
    method: PurchasePaymentMethod,
    actor: PurchaseActor,
    amountCents?: number,
  ) {
    return this.connection.transaction(() =>
      this.payInTransaction(id, method, actor, amountCents),
    );
  }

  private async payInTransaction(
    id: string,
    method: PurchasePaymentMethod,
    actor: PurchaseActor,
    requestedAmountCents?: number,
  ) {
    if (
      ![PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER].includes(
        method,
      )
    )
      throw new BadRequestException('Elegí efectivo o transferencia');
    const now = new Date();
    const purchase = await this.purchaseModel
      .findOne({
        _id: id,
        estado: PurchaseStatus.CONFIRMED,
        medioPago: PurchasePaymentMethod.CREDIT,
        pagada: false,
      })
      .exec();
    if (!purchase)
      throw new ConflictException(
        'La compra no está pendiente o ya fue pagada',
      );
    const paidCents = purchase.montoPagadoCentavos ?? 0;
    const remainingCents = purchase.totalCentavos - paidCents;
    const amountCents = requestedAmountCents ?? remainingCents;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
      throw new BadRequestException('Ingresá un importe válido');
    if (amountCents > remainingCents)
      throw new BadRequestException(
        'El importe no puede superar el saldo pendiente',
      );
    const fullyPaid = amountCents === remainingCents;
    purchase.montoPagadoCentavos = paidCents + amountCents;
    if (method === PurchasePaymentMethod.CASH)
      purchase.montoPagadoEfectivoCentavos =
        (purchase.montoPagadoEfectivoCentavos ?? 0) + amountCents;
    else
      purchase.montoPagadoTransferenciaCentavos =
        (purchase.montoPagadoTransferenciaCentavos ?? 0) + amountCents;
    purchase.pagada = fullyPaid;
    purchase.pagadaAt = fullyPaid ? now : null;
    await purchase.save();
    await this.financeModel
      .updateOne(
        { compraId: purchase._id },
        {
          $inc: {
            montoPagadoCentavos: amountCents,
          },
          $set: {
            pagado: fullyPaid,
            pagadoAt: fullyPaid ? now : null,
            actorId: actor.id,
            actorName: actor.name,
          },
        },
      )
      .exec();
    // Cada pago tiene su propia fecha contable. El movimiento original conserva
    // la fecha y el saldo de la compra; este movimiento refleja la salida real
    // de dinero en el período en que se efectuó el pago.
    await this.financeModel.create({
      sourceKey: `purchase-payment:${purchase._id.toString()}:${new Types.ObjectId().toString()}`,
      tipo: FinancialMovementKind.EXPENSE,
      categoria: FinancialMovementCategory.SUPPLIER_ACCOUNT_PAYMENT,
      montoCentavos: amountCents,
      concepto: `Pago a proveedor - Compra #${purchase.codigo}`,
      detalle: (purchase.items ?? [])
        .map((item) => `${item.productName} x${item.quantity}`)
        .join(', ')
        .slice(0, 500),
      medioPago: method as unknown as FinancialPaymentMethod,
      disponible: false,
      pagado: true,
      montoPagadoCentavos: amountCents,
      pagadoAt: now,
      fechaMovimiento: now,
      proveedorId: purchase.proveedorId,
      proveedorNombre: purchase.proveedorNombre,
      compraId: purchase._id,
      compraCodigo: purchase.codigo,
      actorId: actor.id,
      actorName: actor.name,
    });
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
    if (
      ![PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER].includes(
        method,
      )
    )
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
    let totalCents = 0;
    for (const purchase of purchases) {
      const paidCents = purchase.montoPagadoCentavos ?? 0;
      const remainingCents = purchase.totalCentavos - paidCents;
      if (remainingCents <= 0) continue;
      await this.payInTransaction(
        purchase._id.toString(),
        method,
        actor,
        remainingCents,
      );
      totalCents += remainingCents;
    }
    return {
      paidPurchases: purchases.length,
      totalCents,
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
      product.ultimoCostoCentavos = await this.lotsService.latestUnitCost(product._id);
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
