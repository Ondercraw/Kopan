import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { CreateExpenseDto } from './dto/create-expense.dto';
import {
  FinancialMovementCategory,
  FinancialMovementKind,
  FinancialPaymentMethod,
} from './enums/financial-movement.enum';
import { FinancialMovement, FinancialMovementDocument } from './schemas/financial-movement.schema';
import { BankCheck, BankCheckDocument } from '../checks/schemas/bank-check.schema';
import { CheckStatus } from '../checks/enums/check-status.enum';
import { Product, ProductDocument } from '../stock/schemas/product.schema';
import { StockMovement, StockMovementDocument } from '../stock/schemas/stock-movement.schema';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';

interface FinanceActor { id: string; name: string }

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
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(BankCheck.name) private readonly checkModel: Model<BankCheckDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(StockMovement.name)
    private readonly stockMovementModel: Model<StockMovementDocument>,
  ) {}

  async recordSale(sale: SaleDocument): Promise<void> {
    if (sale.estado !== SaleStatus.CONFIRMED) return;
    const method = sale.medioPago as unknown as FinancialPaymentMethod;
    const available =
      method === FinancialPaymentMethod.CASH ||
      method === FinancialPaymentMethod.TRANSFER ||
      (method === FinancialPaymentMethod.CHECK && Boolean(sale.chequeCobradoAt));
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
            detalle: `${sale.clienteNombre} · ${sale.items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', ')}`.slice(0, 500),
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
      this.movementModel.updateOne(
        { sourceKey: `sale:${sale._id.toString()}:replenishment` },
        {
          $setOnInsert: {
            sourceKey: `sale:${sale._id.toString()}:replenishment`,
            tipo: FinancialMovementKind.EXPENSE,
            categoria: FinancialMovementCategory.REPLENISHMENT,
            montoCentavos: sale.costoCentavos,
            concepto: `Reposición automática - Venta #${sale.codigo}`,
            detalle: sale.items
              .map(
                (item) =>
                  `${item.productoNombre}${item.proveedorNombre ? ` (${item.proveedorNombre})` : ''}: ${item.cantidad} x ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(item.costoUnitarioCentavos / 100)}`,
              )
              .join(' · ')
              .slice(0, 500),
            medioPago: null,
            disponible: false,
            pagado: false,
            fechaMovimiento: sale.createdAt ?? new Date(),
            ventaId: sale._id,
            ventaCodigo: sale.codigo,
            clienteId: sale.clienteId,
            clienteNombre: sale.clienteNombre,
            actorId: sale.actorId,
            actorName: sale.actorName,
          },
        },
        { upsert: true },
      ),
    ]);
  }

  /**
   * Registra el costo histórico de una entrada manual de mercadería.
   * El total se calcula una sola vez con el costo vigente en ese ingreso;
   * los cambios posteriores del costo del producto no modifican este movimiento.
   */
  async recordStockReplenishment(data: StockReplenishment): Promise<void> {
    if (data.units <= 0) return;
    const supplier = data.supplierId
      ? await this.supplierModel.findById(data.supplierId).select('nombre').exec()
      : null;
    const amount = data.units * data.unitCostCents;
    const unitCost = new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(data.unitCostCents / 100);

    await this.movementModel.updateOne(
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
    ).exec();
  }

  async createExpense(dto: CreateExpenseDto, actor: FinanceActor) {
    let supplier: SupplierDocument | null = null;
    if (dto.proveedorId) {
      supplier = await this.supplierModel.findOne({ _id: dto.proveedorId, activo: true }).exec();
      if (!supplier) throw new NotFoundException('Proveedor inexistente o inactivo');
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
      fechaMovimiento: dto.fecha ? this.dateAtCurrentArgentinaTime(dto.fecha) : new Date(),
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
    await this.movementModel.updateOne(
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
    ).exec();
  }

  async payExpense(id: string, medioPago: FinancialPaymentMethod, actor: FinanceActor) {
    const movement = await this.movementModel.findOneAndUpdate(
      { _id: id, tipo: FinancialMovementKind.EXPENSE, pagado: false, cancelado: { $ne: true } },
      {
        $set: { pagado: true, pagadoAt: new Date(), medioPago },
        $setOnInsert: {},
      },
      { new: true },
    ).exec();
    if (movement) {
      movement.actorId = actor.id;
      movement.actorName = actor.name;
      await movement.save();
      return movement;
    }
    const existing = await this.movementModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Gasto no encontrado');
    throw new ConflictException('El gasto ya fue pagado y no puede modificarse');
  }

  async cancelReplenishment(id: string, reason: string, actor: FinanceActor) {
    const movement = await this.movementModel.findById(id).exec();
    if (!movement) throw new NotFoundException('Gasto de reposición no encontrado');
    if (
      movement.tipo !== FinancialMovementKind.EXPENSE ||
      movement.categoria !== FinancialMovementCategory.REPLENISHMENT ||
      !movement.sourceKey.startsWith('stock:')
    ) {
      throw new ConflictException('Solo se pueden cancelar reposiciones manuales de stock');
    }
    if (!movement.pagado) {
      throw new ConflictException('La reposición todavía está pendiente de pago');
    }
    if (movement.cancelado) {
      throw new ConflictException('La reposición ya fue cancelada y no puede modificarse');
    }

    const legacyMovementId = movement.sourceKey.split(':')[1];
    const stockMovementId = movement.stockMovementId ??
      (Types.ObjectId.isValid(legacyMovementId) ? new Types.ObjectId(legacyMovementId) : null);
    const stockMovement = stockMovementId
      ? await this.stockMovementModel.findById(stockMovementId).exec()
      : null;
    if (!stockMovement || stockMovement.type !== StockMovementType.INCREMENT) {
      throw new ConflictException('No se encontró el ingreso de stock original para revertirlo');
    }
    const units = movement.unidadesReposicion ??
      stockMovement.currentStock - stockMovement.previousStock;
    if (!Number.isInteger(units) || units <= 0) {
      throw new ConflictException('La cantidad original de la reposición no es válida');
    }

    const cancellationReason = reason.trim();
    const cancelledAt = new Date();
    const claimed = await this.movementModel.findOneAndUpdate(
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
    ).exec();
    if (!claimed) {
      throw new ConflictException('La reposición ya fue cancelada y no puede modificarse');
    }

    const product = await this.productModel.findOneAndUpdate(
      { _id: stockMovement.productId, activo: true, cantidadStock: { $gte: units } },
      { $inc: { cantidadStock: -units } },
      { new: true },
    ).exec();
    if (!product) {
      await this.movementModel.updateOne(
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
      ).exec();
      throw new ConflictException(
        'No hay stock suficiente para cancelar esta reposición sin dejar existencias negativas',
      );
    }

    try {
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
      await this.productModel.updateOne({ _id: product._id }, { $inc: { cantidadStock: units } }).exec();
      await this.movementModel.updateOne(
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
      ).exec();
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
      await this.movementModel.updateOne(
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
      ).exec();
      return;
    }
    await this.movementModel.updateOne(
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
    ).exec();
  }

  async allocateCollectedCheck(
    checkId: Types.ObjectId,
    acreditadoEn: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER,
    actor: FinanceActor,
  ): Promise<void> {
    const movement = await this.movementModel.findOneAndUpdate(
      {
        chequeId: checkId,
        tipo: FinancialMovementKind.INCOME,
        disponible: true,
        acreditadoEn: null,
      },
      { $set: { acreditadoEn, actorId: actor.id, actorName: actor.name } },
      { new: true },
    ).exec();
    if (!movement) {
      throw new ConflictException('El ingreso del cheque ya tiene un destino asignado');
    }
  }

  async findAll(filters: { from?: string; to?: string } = {}) {
    await this.reconcileSales();
    await this.reconcilePendingManualChecks();
    await this.reconcileLegacyManualExpenseTimes();
    const query: Record<string, unknown> = {};
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = new Date(filters.from);
    if (filters.to) range.$lt = new Date(filters.to);
    if (Object.keys(range).length) query.fechaMovimiento = range;
    const [items, all] = await Promise.all([
      this.movementModel.find(query).sort({ fechaMovimiento: -1, createdAt: -1 }).limit(3000).exec(),
      this.movementModel.find().sort({ fechaMovimiento: -1 }).limit(10000).exec(),
    ]);
    return { items, period: this.summarize(items), overall: this.summarize(all) };
  }

  private summarize(items: FinancialMovementDocument[]) {
    const sum = (predicate: (item: FinancialMovementDocument) => boolean) =>
      items.filter(predicate).reduce((total, item) => total + item.montoCentavos, 0);
    const incomes = sum((item) => item.tipo === FinancialMovementKind.INCOME);
    const activeExpense = (item: FinancialMovementDocument) =>
      item.tipo === FinancialMovementKind.EXPENSE && !item.cancelado;
    const paidAutomatic = sum(
      (item) => activeExpense(item) && item.categoria === FinancialMovementCategory.REPLENISHMENT && item.pagado,
    );
    const pendingAutomatic = sum(
      (item) => activeExpense(item) && item.categoria === FinancialMovementCategory.REPLENISHMENT && !item.pagado,
    );
    const paidManual = sum(
      (item) => activeExpense(item) && item.categoria === FinancialMovementCategory.MANUAL && item.pagado,
    );
    const pendingManual = sum(
      (item) => activeExpense(item) && item.categoria === FinancialMovementCategory.MANUAL && !item.pagado,
    );
    const cashIncome = sum(
      (item) => item.tipo === FinancialMovementKind.INCOME && item.disponible &&
        (item.medioPago === FinancialPaymentMethod.CASH || item.acreditadoEn === FinancialPaymentMethod.CASH),
    );
    const transferIncome = sum(
      (item) => item.tipo === FinancialMovementKind.INCOME && item.disponible &&
        (item.medioPago === FinancialPaymentMethod.TRANSFER || item.acreditadoEn === FinancialPaymentMethod.TRANSFER),
    );
    const checkIncome = sum(
      (item) => item.tipo === FinancialMovementKind.INCOME && item.disponible && item.medioPago === FinancialPaymentMethod.CHECK,
    );
    const checkCashIncome = sum(
      (item) => item.tipo === FinancialMovementKind.INCOME && item.disponible &&
        item.medioPago === FinancialPaymentMethod.CHECK && item.acreditadoEn === FinancialPaymentMethod.CASH,
    );
    const checkTransferIncome = sum(
      (item) => item.tipo === FinancialMovementKind.INCOME && item.disponible &&
        item.medioPago === FinancialPaymentMethod.CHECK && item.acreditadoEn === FinancialPaymentMethod.TRANSFER,
    );
    const cashExpenses = sum(
      (item) => activeExpense(item) && item.pagado && item.medioPago === FinancialPaymentMethod.CASH,
    );
    const transferExpenses = sum(
      (item) => activeExpense(item) && item.pagado && item.medioPago === FinancialPaymentMethod.TRANSFER,
    );
    return {
      ingresosCentavos: incomes,
      gastosAutomaticosCentavos: paidAutomatic,
      gastosReposicionPagadosCentavos: paidAutomatic,
      gastosReposicionPendientesCentavos: pendingAutomatic,
      gastosManualesCentavos: paidManual,
      gastosManualesPendientesCentavos: pendingManual,
      resultadoCentavos: incomes - paidAutomatic - paidManual,
      efectivoDisponibleCentavos: cashIncome - cashExpenses,
      transferenciaDisponibleCentavos: transferIncome - transferExpenses,
      chequesCobradosCentavos: checkIncome,
      chequesEfectivoCentavos: checkCashIncome,
      chequesTransferenciaCentavos: checkTransferIncome,
      chequesPendientesCentavos: sum(
        (item) => item.tipo === FinancialMovementKind.INCOME && !item.disponible && item.medioPago === FinancialPaymentMethod.CHECK,
      ),
      cuentaCorrienteCentavos: sum(
        (item) => item.tipo === FinancialMovementKind.INCOME && !item.disponible && item.medioPago === FinancialPaymentMethod.CREDIT,
      ),
      gastosPendientesCentavos: sum(
        (item) => activeExpense(item) && !item.pagado,
      ),
    };
  }

  private async reconcileSales(): Promise<void> {
    const sales = await this.saleModel.find({ estado: SaleStatus.CONFIRMED }).limit(10000).exec();
    for (const sale of sales) await this.recordSale(sale);
  }

  private async reconcilePendingManualChecks(): Promise<void> {
    const checks = await this.checkModel.find({
      estado: CheckStatus.PENDING,
      ventaId: null,
    }).limit(10000).exec();
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
    const expenses = await this.movementModel.find({
      categoria: FinancialMovementCategory.MANUAL,
    }).limit(10000).exec();
    const argentinaDay = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    }).format(date);
    const argentinaTime = (date: Date) => new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(date);
    for (const expense of expenses) {
      if (
        argentinaTime(expense.fechaMovimiento) === '12:00:00' &&
        argentinaDay(expense.fechaMovimiento) === argentinaDay(expense.createdAt)
      ) {
        await this.movementModel.updateOne(
          { _id: expense._id },
          { $set: { fechaMovimiento: expense.createdAt } },
        ).exec();
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
