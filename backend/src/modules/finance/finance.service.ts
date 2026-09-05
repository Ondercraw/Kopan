import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import {
  Supplier,
  SupplierDocument,
} from '../suppliers/schemas/supplier.schema';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  FinancialMovementCategory,
  FinancialMovementKind,
  FinancialPaymentMethod,
} from './enums/financial-movement.enum';
import {
  FinancialMovement,
  FinancialMovementDocument,
} from './schemas/financial-movement.schema';
import {
  BankCheck,
  BankCheckDocument,
} from '../checks/schemas/bank-check.schema';
import { CheckStatus } from '../checks/enums/check-status.enum';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../stock/schemas/stock-movement.schema';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';
import { InventoryLotsService } from '../purchases/inventory-lots.service';

interface FinanceActor {
  id: string;
  name: string;
}

interface StockReplenishment {
  stockMovementId: Types.ObjectId;
  productId: Types.ObjectId;
  productCode: number;
  productName: string;
  units: number;
  unitCostCents: number;
  supplierId: Types.ObjectId | null;
  actor: FinanceActor;
  date: Date;
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(FinancialMovement.name)
    private readonly movementModel: Model<FinancialMovementDocument>,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(BankCheck.name)
    private readonly checkModel: Model<BankCheckDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
    private readonly inventoryLots: InventoryLotsService,
  ) {}

  async recordSale(sale: SaleDocument): Promise<void> {
    if (sale.estado !== SaleStatus.CONFIRMED) return;
    const method = sale.medioPago as unknown as FinancialPaymentMethod;
    const available =
      method === FinancialPaymentMethod.CASH ||
      method === FinancialPaymentMethod.TRANSFER ||
      (method === FinancialPaymentMethod.CHECK &&
        Boolean(sale.chequeCobradoAt));
    await Promise.all([
      this.movementModel.updateOne(
        { sourceKey: `sale:${sale._id.toString()}:income` },
        {
          $setOnInsert: {
            sourceKey: `sale:${sale._id.toString()}:income`,
            tipo: FinancialMovementKind.INCOME,
            categoria:
              method === FinancialPaymentMethod.CHECK
                ? FinancialMovementCategory.CHECK
                : FinancialMovementCategory.SALE,
            montoCentavos: sale.totalCentavos,
            concepto:
              method === FinancialPaymentMethod.CHECK
                ? `Ingreso por cheque - Venta #${sale.codigo}`
                : `Ingreso por venta #${sale.codigo}`,
            detalle:
              `${sale.clienteNombre} · ${sale.items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', ')}`.slice(
                0,
                500,
              ),
            medioPago: method,
            disponible: available,
            pagado: false,
            fechaMovimiento: sale.createdAt ?? new Date(),
            ventaId: sale._id,
            ventaCodigo: sale.codigo,
            clienteId: sale.clienteId,
            clienteNombre: sale.clienteNombre,
            chequeId: sale.chequeId ?? null,
            chequeNumero: sale.chequeNumero ?? '',
            actorId: sale.actorId,
            actorName: sale.actorName,
          },
        },
        { upsert: true },
      ),
    ]);
    // El gasto real pertenece a la compra; vender no crea otra deuda al proveedor.
  }

  /**
   * Registra el costo histórico de una entrada manual de mercadería.
   * El total se calcula una sola vez con el costo vigente en ese ingreso;
   * los cambios posteriores del costo del producto no modifican este movimiento.
   */
  async recordStockReplenishment(data: StockReplenishment): Promise<void> {
    if (data.units <= 0) return;
    const supplier = data.supplierId
      ? await this.supplierModel
          .findById(data.supplierId)
          .select('nombre')
          .exec()
      : null;
    const amount = data.units * data.unitCostCents;
    const unitCost = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(data.unitCostCents / 100);

    await this.movementModel
      .updateOne(
        { sourceKey: `stock:${data.stockMovementId.toString()}:replenishment` },
        {
          $setOnInsert: {
            sourceKey: `stock:${data.stockMovementId.toString()}:replenishment`,
            tipo: FinancialMovementKind.EXPENSE,
            categoria: FinancialMovementCategory.REPLENISHMENT,
            montoCentavos: amount,
            concepto: `Reposición manual desde Gestión de stock - Producto #${data.productCode}`,
            detalle: `${data.productName}: ${data.units} ${data.units === 1 ? 'unidad' : 'unidades'} x ${unitCost}`,
            medioPago: null,
            disponible: false,
            pagado: false,
            fechaMovimiento: data.date,
            proveedorId: data.supplierId,
            proveedorNombre: supplier?.nombre ?? '',
            stockMovementId: data.stockMovementId,
            productoId: data.productId,
            unidadesReposicion: data.units,
            actorId: data.actor.id,
            actorName: data.actor.name,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async createExpense(dto: CreateExpenseDto, actor: FinanceActor) {
    let supplier: SupplierDocument | null = null;
    if (dto.proveedorId) {
      supplier = await this.supplierModel
        .findOne({ _id: dto.proveedorId, activo: true })
        .exec();
      if (!supplier)
        throw new NotFoundException('Proveedor inexistente o inactivo');
    }
    return this.movementModel.create({
      sourceKey: `manual:${new Types.ObjectId().toString()}`,
      tipo: FinancialMovementKind.EXPENSE,
      categoria: FinancialMovementCategory.MANUAL,
      montoCentavos: dto.montoCentavos,
      concepto: dto.concepto.trim(),
      detalle: dto.detalle?.trim() ?? '',
      medioPago: null,
      disponible: false,
      pagado: false,
      fechaMovimiento: dto.fecha
        ? this.dateAtCurrentArgentinaTime(dto.fecha)
        : new Date(),
      proveedorId: supplier?._id ?? null,
      proveedorNombre: supplier?.nombre ?? '',
      actorId: actor.id,
      actorName: actor.name,
    });
  }

  async recordPendingCheck(check: {
    _id: Types.ObjectId;
    numero: string;
    montoCentavos: number;
    clienteId: Types.ObjectId | null;
    clienteNombre: string;
    actorId: string;
    actorName: string;
    createdAt: Date;
  }): Promise<void> {
    await this.movementModel
      .updateOne(
        { sourceKey: `check:${check._id.toString()}:income` },
        {
          $setOnInsert: {
            sourceKey: `check:${check._id.toString()}:income`,
            tipo: FinancialMovementKind.INCOME,
            categoria: FinancialMovementCategory.CHECK,
            montoCentavos: check.montoCentavos,
            concepto: `Cheque pendiente #${check.numero}`,
            detalle: check.clienteNombre || 'Cheque cargado manualmente',
            medioPago: FinancialPaymentMethod.CHECK,
            acreditadoEn: null,
            disponible: false,
            pagado: false,
            fechaMovimiento: check.createdAt,
            clienteId: check.clienteId,
            clienteNombre: check.clienteNombre,
            chequeId: check._id,
            chequeNumero: check.numero,
            actorId: check.actorId,
            actorName: check.actorName,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async payExpense(
    id: string,
    medioPago: FinancialPaymentMethod,
    actor: FinanceActor,
  ) {
    const movement = await this.movementModel
      .findOneAndUpdate(
        {
          _id: id,
          categoria: { $ne: FinancialMovementCategory.PURCHASE },
          tipo: FinancialMovementKind.EXPENSE,
          pagado: false,
          cancelado: { $ne: true },
        },
        {
          $set: { pagado: true, pagadoAt: new Date(), medioPago },
          $setOnInsert: {},
        },
        { new: true },
      )
      .exec();
    if (movement) {
      movement.actorId = actor.id;
      movement.actorName = actor.name;
      await movement.save();
      return movement;
    }
    const existing = await this.movementModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    throw new ConflictException(
      'El gasto ya fue pagado y no puede modificarse',
    );
  }

  async cancelReplenishment(id: string, reason: string, actor: FinanceActor) {
    return this.productModel.db.transaction(() => this.cancelReplenishmentInTransaction(id, reason, actor));
  }

  private async cancelReplenishmentInTransaction(id: string, reason: string, actor: FinanceActor) {
    const movement = await this.movementModel.findById(id).exec();
    if (!movement)
      throw new NotFoundException('Gasto de reposición no encontrado');
    if (
      movement.tipo !== FinancialMovementKind.EXPENSE ||
      movement.categoria !== FinancialMovementCategory.REPLENISHMENT ||
      !movement.sourceKey.startsWith('stock:')
    ) {
      throw new ConflictException(
        'Solo se pueden cancelar reposiciones manuales de stock',
      );
    }
    if (!movement.pagado) {
      throw new ConflictException(
        'La reposición todavía está pendiente de pago',
      );
    }
    if (movement.cancelado) {
      throw new ConflictException(
        'La reposición ya fue cancelada y no puede modificarse',
      );
    }

    const legacyMovementId = movement.sourceKey.split(':')[1];
    const stockMovementId =
      movement.stockMovementId ??
      (Types.ObjectId.isValid(legacyMovementId)
        ? new Types.ObjectId(legacyMovementId)
        : null);
    const stockMovement = stockMovementId
      ? await this.stockMovementModel.findById(stockMovementId).exec()
      : null;
    if (!stockMovement || stockMovement.type !== StockMovementType.INCREMENT) {
      throw new ConflictException(
        'No se encontró el ingreso de stock original para revertirlo',
      );
    }
    const units =
      movement.unidadesReposicion ??
      stockMovement.currentStock - stockMovement.previousStock;
    if (!Number.isInteger(units) || units <= 0) {
      throw new ConflictException(
        'La cantidad original de la reposición no es válida',
      );
    }

    const cancellationReason = reason.trim();
    const cancelledAt = new Date();
    const claimed = await this.movementModel
      .findOneAndUpdate(
        { _id: movement._id, pagado: true, cancelado: { $ne: true } },
        {
          $set: {
            cancelado: true,
            motivoCancelacion: cancellationReason,
            canceladoAt: cancelledAt,
            canceladoPorId: actor.id,
            canceladoPorNombre: actor.name,
            stockMovementId: stockMovement._id,
            productoId: stockMovement.productId,
            unidadesReposicion: units,
          },
        },
        { new: true },
      )
      .exec();
    if (!claimed) {
      throw new ConflictException(
        'La reposición ya fue cancelada y no puede modificarse',
      );
    }

    const product = await this.productModel
      .findOneAndUpdate(
        {
          _id: stockMovement.productId,
          activo: true,
          cantidadStock: { $gte: units },
        },
        { $inc: { cantidadStock: -units } },
        { new: true },
      )
      .exec();
    if (!product) {
      await this.movementModel
        .updateOne(
          { _id: movement._id, canceladoAt: cancelledAt },
          {
            $set: {
              cancelado: false,
              motivoCancelacion: '',
              canceladoAt: null,
              canceladoPorId: '',
              canceladoPorNombre: '',
            },
          },
        )
        .exec();
      throw new ConflictException(
        'No hay stock suficiente para cancelar esta reposición sin dejar existencias negativas',
      );
    }

    try {
      product.costoCentavos = await this.inventoryLots.adjust(product._id, -units, product.cantidadStock + units, product.costoCentavos);
      await product.save();
      await this.stockMovementModel.create({
        productId: product._id,
        productCode: product.codigo,
        productName: product.nombre,
        type: StockMovementType.DECREMENT,
        previousStock: product.cantidadStock + units,
        currentStock: product.cantidadStock,
        reason: `Cancelación de reposición manual: ${cancellationReason}`,
        referenceType: 'FINANCIAL_MOVEMENT',
        referenceId: movement._id,
        referenceCode: null,
        actorId: actor.id,
        actorName: actor.name,
      });
    } catch (error) {
      await this.productModel
        .updateOne({ _id: product._id }, { $inc: { cantidadStock: units } })
        .exec();
      await this.movementModel
        .updateOne(
          { _id: movement._id, canceladoAt: cancelledAt },
          {
            $set: {
              cancelado: false,
              motivoCancelacion: '',
              canceladoAt: null,
              canceladoPorId: '',
              canceladoPorNombre: '',
            },
          },
        )
        .exec();
      throw error;
    }

    return claimed;
  }

  async markCheckCollected(check: {
    _id: Types.ObjectId;
    numero: string;
    montoCentavos: number;
    clienteId: Types.ObjectId | null;
    clienteNombre: string;
    ventaId: Types.ObjectId | null;
    ventaCodigo: number | null;
    actorId: string;
    actorName: string;
    cobradoAt: Date;
    acreditadoEn: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
  }): Promise<void> {
    if (check.ventaId) {
      await this.movementModel
        .updateOne(
          { sourceKey: `sale:${check.ventaId.toString()}:income` },
          {
            $set: {
              categoria: FinancialMovementCategory.CHECK,
              concepto: `Ingreso de cheque cobrado - Venta #${check.ventaCodigo}`,
              medioPago: FinancialPaymentMethod.CHECK,
              acreditadoEn: check.acreditadoEn,
              disponible: true,
              chequeId: check._id,
              chequeNumero: check.numero,
            },
          },
        )
        .exec();
      return;
    }
    await this.movementModel
      .updateOne(
        { sourceKey: `check:${check._id.toString()}:income` },
        {
          $set: {
            concepto: `Ingreso de cheque cobrado #${check.numero}`,
            medioPago: FinancialPaymentMethod.CHECK,
            acreditadoEn: check.acreditadoEn,
            disponible: true,
            fechaMovimiento: check.cobradoAt,
            actorId: check.actorId,
            actorName: check.actorName,
          },
          $setOnInsert: {
            sourceKey: `check:${check._id.toString()}:income`,
            tipo: FinancialMovementKind.INCOME,
            categoria: FinancialMovementCategory.CHECK,
            montoCentavos: check.montoCentavos,
            detalle: check.clienteNombre || 'Cheque cargado manualmente',
            pagado: false,
            clienteId: check.clienteId,
            clienteNombre: check.clienteNombre,
            chequeId: check._id,
            chequeNumero: check.numero,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  async allocateCollectedCheck(
    checkId: Types.ObjectId,
    acreditadoEn: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER,
    actor: FinanceActor,
  ): Promise<void> {
    const movement = await this.movementModel
      .findOneAndUpdate(
        {
          chequeId: checkId,
          tipo: FinancialMovementKind.INCOME,
          disponible: true,
          acreditadoEn: null,
        },
        { $set: { acreditadoEn, actorId: actor.id, actorName: actor.name } },
        { new: true },
      )
      .exec();
    if (!movement) {
      throw new ConflictException(
        'El ingreso del cheque ya tiene un destino asignado',
      );
    }
  }

  async findAll(filters: { from?: string; to?: string } = {}) {
    const query: Record<string, unknown> = {};
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = new Date(filters.from);
    if (filters.to) range.$lt = new Date(filters.to);
    if (Object.keys(range).length) query.fechaMovimiento = range;
    const [items, period, overall] = await Promise.all([
      this.movementModel
        .find(query)
        .sort({ fechaMovimiento: -1, createdAt: -1 })
        .limit(3000)
        .lean()
        .exec(),
      this.summarizeQuery(query),
      this.summarizeQuery({}),
    ]);
    return { items, period, overall };
  }

  /**
   * Reparación explícita para instalaciones anteriores o fallos transitorios.
   * No se ejecuta al abrir la pantalla porque puede recorrer miles de registros.
   */
  async reconcile() {
    await Promise.all([
      this.reconcileSales(),
      this.reconcilePendingManualChecks(),
      this.reconcileLegacyManualExpenseTimes(),
    ]);
    return { reconciled: true };
  }

  private async summarizeQuery(query: Record<string, unknown>) {
    const eq = (field: string, value: unknown) => ({
      $eq: [`$${field}`, value],
    });
    const amountWhen = (...conditions: Record<string, unknown>[]) => ({
      $sum: {
        $cond: [{ $and: conditions }, { $ifNull: ['$montoCentavos', 0] }, 0],
      },
    });
    const income = eq('tipo', FinancialMovementKind.INCOME);
    const activeExpense = [
      eq('tipo', FinancialMovementKind.EXPENSE),
      { $ne: ['$cancelado', true] },
    ];
    const available = eq('disponible', true);
    const paid = eq('pagado', true);
    const unpaid = { $ne: ['$pagado', true] };

    const [totals] = await this.movementModel
      .aggregate<{
        incomes: number;
        paidAutomatic: number;
        pendingAutomatic: number;
        paidManual: number;
        pendingManual: number;
        cashIncome: number;
        transferIncome: number;
        checkIncome: number;
        checkCashIncome: number;
        checkTransferIncome: number;
        cashExpenses: number;
        transferExpenses: number;
        pendingChecks: number;
        currentAccount: number;
        pendingExpenses: number;
        paidPurchases: number;
        pendingPurchases: number;
      }>([
        { $match: query },
        {
          $group: {
            _id: null,
            incomes: amountWhen(income),
            paidAutomatic: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.REPLENISHMENT),
              paid,
            ),
            pendingAutomatic: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.REPLENISHMENT),
              unpaid,
            ),
            paidManual: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.MANUAL),
              paid,
            ),
            pendingManual: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.MANUAL),
              unpaid,
            ),
            paidPurchases: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.PURCHASE),
              paid,
            ),
            pendingPurchases: amountWhen(
              ...activeExpense,
              eq('categoria', FinancialMovementCategory.PURCHASE),
              unpaid,
            ),
            cashIncome: amountWhen(income, available, {
              $or: [
                eq('medioPago', FinancialPaymentMethod.CASH),
                eq('acreditadoEn', FinancialPaymentMethod.CASH),
              ],
            }),
            transferIncome: amountWhen(income, available, {
              $or: [
                eq('medioPago', FinancialPaymentMethod.TRANSFER),
                eq('acreditadoEn', FinancialPaymentMethod.TRANSFER),
              ],
            }),
            checkIncome: amountWhen(
              income,
              available,
              eq('medioPago', FinancialPaymentMethod.CHECK),
            ),
            checkCashIncome: amountWhen(
              income,
              available,
              eq('medioPago', FinancialPaymentMethod.CHECK),
              eq('acreditadoEn', FinancialPaymentMethod.CASH),
            ),
            checkTransferIncome: amountWhen(
              income,
              available,
              eq('medioPago', FinancialPaymentMethod.CHECK),
              eq('acreditadoEn', FinancialPaymentMethod.TRANSFER),
            ),
            cashExpenses: amountWhen(
              ...activeExpense,
              paid,
              eq('medioPago', FinancialPaymentMethod.CASH),
            ),
            transferExpenses: amountWhen(
              ...activeExpense,
              paid,
              eq('medioPago', FinancialPaymentMethod.TRANSFER),
            ),
            pendingChecks: amountWhen(
              income,
              { $ne: ['$disponible', true] },
              eq('medioPago', FinancialPaymentMethod.CHECK),
            ),
            currentAccount: amountWhen(
              income,
              { $ne: ['$disponible', true] },
              eq('medioPago', FinancialPaymentMethod.CREDIT),
            ),
            pendingExpenses: amountWhen(...activeExpense, unpaid),
          },
        },
      ])
      .exec();

    const values = totals ?? {
      incomes: 0,
      paidAutomatic: 0,
      pendingAutomatic: 0,
      paidManual: 0,
      pendingManual: 0,
      cashIncome: 0,
      transferIncome: 0,
      checkIncome: 0,
      checkCashIncome: 0,
      checkTransferIncome: 0,
      cashExpenses: 0,
      transferExpenses: 0,
      pendingChecks: 0,
      currentAccount: 0,
      pendingExpenses: 0,
      paidPurchases: 0,
      pendingPurchases: 0,
    };
    return {
      ingresosCentavos: values.incomes,
      gastosAutomaticosCentavos: values.paidAutomatic,
      gastosReposicionPagadosCentavos: values.paidAutomatic,
      gastosReposicionPendientesCentavos: values.pendingAutomatic,
      gastosManualesCentavos: values.paidManual,
      gastosManualesPendientesCentavos: values.pendingManual,
      comprasPagadasCentavos: values.paidPurchases,
      comprasPendientesCentavos: values.pendingPurchases,
      resultadoCentavos:
        values.incomes -
        values.paidAutomatic -
        values.paidManual -
        values.paidPurchases,
      efectivoDisponibleCentavos: values.cashIncome - values.cashExpenses,
      transferenciaDisponibleCentavos:
        values.transferIncome - values.transferExpenses,
      chequesCobradosCentavos: values.checkIncome,
      chequesEfectivoCentavos: values.checkCashIncome,
      chequesTransferenciaCentavos: values.checkTransferIncome,
      chequesPendientesCentavos: values.pendingChecks,
      cuentaCorrienteCentavos: values.currentAccount,
      gastosPendientesCentavos: values.pendingExpenses,
    };
  }

  private async reconcileSales(): Promise<void> {
    const sales = await this.saleModel
      .find({ estado: SaleStatus.CONFIRMED })
      .limit(10000)
      .exec();
    for (const sale of sales) await this.recordSale(sale);
  }

  private async reconcilePendingManualChecks(): Promise<void> {
    const checks = await this.checkModel
      .find({
        estado: CheckStatus.PENDING,
        ventaId: null,
      })
      .limit(10000)
      .exec();
    for (const check of checks) {
      await this.recordPendingCheck({
        _id: check._id,
        numero: check.numero,
        montoCentavos: check.montoCentavos,
        clienteId: check.clienteId,
        clienteNombre: check.clienteNombre,
        actorId: check.actorId,
        actorName: check.actorName,
        createdAt: check.createdAt,
      });
    }
  }

  private async reconcileLegacyManualExpenseTimes(): Promise<void> {
    const expenses = await this.movementModel
      .find({
        categoria: FinancialMovementCategory.MANUAL,
      })
      .limit(10000)
      .exec();
    const argentinaDay = (date: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(date);
    const argentinaTime = (date: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }).format(date);
    for (const expense of expenses) {
      if (
        argentinaTime(expense.fechaMovimiento) === '12:00:00' &&
        argentinaDay(expense.fechaMovimiento) ===
          argentinaDay(expense.createdAt)
      ) {
        await this.movementModel
          .updateOne(
            { _id: expense._id },
            { $set: { fechaMovimiento: expense.createdAt } },
          )
          .exec();
      }
    }
  }

  private dateAtCurrentArgentinaTime(date: string): Date {
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    return new Date(`${date}T${time}-03:00`);
  }
}
