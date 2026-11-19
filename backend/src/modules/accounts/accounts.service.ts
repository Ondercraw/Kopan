import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Client, ClientDocument } from '../clients/schemas/client.schema';
import { FinancialMovementCategory, FinancialMovementKind, FinancialPaymentMethod } from '../finance/enums/financial-movement.enum';
import { FinancialMovement, FinancialMovementDocument } from '../finance/schemas/financial-movement.schema';
import { PurchasePaymentMethod, PurchaseStatus } from '../purchases/enums/purchase.enum';
import { PurchasesService } from '../purchases/purchases.service';
import { Purchase, PurchaseDocument } from '../purchases/schemas/purchase.schema';
import { PaymentMethod } from '../sales/enums/payment-method.enum';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { Remittance, RemittanceDocument } from '../remittances/schemas/remittance.schema';
import { AccountPayment, AccountPaymentDocument } from './schemas/account-payment.schema';
import { AccountOpeningDebt, AccountOpeningDebtDocument } from './schemas/account-opening-debt.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import { ReviseClientPaymentDto } from './dto/revise-client-payment.dto';

interface Actor { id: string; name: string }

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Remittance.name) private readonly remittanceModel: Model<RemittanceDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(AccountPayment.name) private readonly paymentModel: Model<AccountPaymentDocument>,
    @InjectModel(AccountOpeningDebt.name) private readonly openingDebtModel: Model<AccountOpeningDebtDocument>,
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(FinancialMovement.name) private readonly financeModel: Model<FinancialMovementDocument>,
    private readonly purchasesService: PurchasesService,
  ) {}

  async onModuleInit() {
    // Los pagos a proveedores registrados antes de que cada pago tuviera su
    // propio movimiento financiero se recuperan desde el historial de cuentas.
    // sourceKey vuelve esta migración segura para ejecutarla en cada inicio.
    const supplierPayments = await this.paymentModel
      .find({ tipoCuenta: 'PROVEEDOR' })
      .lean()
      .exec();
    let restored = 0;
    for (const payment of supplierPayments) {
      // Las versiones anteriores acumulaban el pago dentro del movimiento de
      // la compra. Al separarlo por fecha, se limpian esos importes para que el
      // efectivo o la transferencia no se descuenten dos veces.
      await this.financeModel.updateOne(
        {
          compraId: payment.comprobanteId,
          categoria: FinancialMovementCategory.PURCHASE,
        },
        {
          $set: { medioPago: FinancialPaymentMethod.CREDIT },
          $unset: {
            montoPagadoEfectivoCentavos: 1,
            montoPagadoTransferenciaCentavos: 1,
          },
        },
      ).exec();
      const result = await this.financeModel.updateOne(
        { sourceKey: `account-payment:${payment._id.toString()}` },
        {
          $setOnInsert: {
            tipo: FinancialMovementKind.EXPENSE,
            categoria: FinancialMovementCategory.SUPPLIER_ACCOUNT_PAYMENT,
            montoCentavos: payment.montoCentavos,
            concepto: `Pago a proveedor - Compra #${payment.comprobanteCodigo}`,
            detalle: payment.entidadNombre,
            medioPago: payment.medioPago,
            disponible: false,
            pagado: true,
            montoPagadoCentavos: payment.montoCentavos,
            pagadoAt: payment.fecha,
            fechaMovimiento: payment.fecha,
            proveedorId: payment.entidadId,
            proveedorNombre: payment.entidadNombre,
            compraId: payment.comprobanteId,
            compraCodigo: payment.comprobanteCodigo,
            actorId: payment.actorId,
            actorName: payment.actorName,
          },
        },
        { upsert: true },
      ).exec();
      if (result.upsertedCount) restored += 1;
    }
    if (restored > 0)
      this.logger.log(`Se restauraron ${restored} pago(s) históricos de proveedores`);
  }

  async statement() {
    const [sales, purchases, payments, openingDebts, clientEntities, supplierEntities, remittances] = await Promise.all([
      this.saleModel.find({ estado: SaleStatus.CONFIRMED, medioPago: { $in: [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.CREDIT, PaymentMethod.CHECK] } }).sort({ createdAt: -1 }).lean().exec(),
      this.purchaseModel.find({ estado: PurchaseStatus.CONFIRMED, medioPago: { $in: [PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER, PurchasePaymentMethod.CREDIT, PurchasePaymentMethod.HISTORICAL] } }).sort({ fechaCompra: -1 }).lean().exec(),
      this.paymentModel.find().sort({ fecha: -1 }).lean().exec(),
      this.openingDebtModel.find().sort({ fecha: -1 }).lean().exec(),
      this.clientModel.find({ activo: true }).select('_id nombre').lean().exec(),
      this.supplierModel.find({ activo: true }).select('_id nombre').lean().exec(),
      this.remittanceModel.find().sort({ createdAt: -1 }).lean().exec(),
    ]);
    const paymentMap = new Map<string, typeof payments>();
    for (const payment of payments) {
      const key = payment.comprobanteId.toString();
      paymentMap.set(key, [...(paymentMap.get(key) ?? []), payment]);
    }
    const status = (total: number, paid: number) => paid <= 0 ? 'PENDIENTE' : paid < total ? 'PARCIAL' : 'PAGADO';
    const clients = this.group(
      [...sales.map((sale) => {
        const saleDate = sale.fechaFacturacion ?? sale.createdAt;
        const isCredit = sale.medioPago === PaymentMethod.CREDIT;
        const legacyCheckPending = sale.medioPago === PaymentMethod.CHECK && !sale.chequeCobradoAt;
        const paid = isCredit ? (sale.montoCobradoCuentaCorrienteCentavos ?? 0) : legacyCheckPending ? 0 : sale.totalCentavos;
        const directPayments = isCredit || legacyCheckPending ? [] : [{ id: `sale-initial-${sale._id.toString()}`, montoCentavos: sale.totalCentavos, medioPago: sale.medioPago, fecha: saleDate, actorName: sale.actorName }];
        return {
          id: sale._id.toString(), codigo: sale.codigo, entidadId: sale.clienteId.toString(), entidadNombre: sale.clienteNombre,
          tipo: 'VENTA', fecha: saleDate, totalCentavos: sale.totalCentavos, pagadoCentavos: paid,
          saldoCentavos: Math.max(0, sale.totalCentavos - paid), estado: status(sale.totalCentavos, paid),
          chequePendienteCentavos: legacyCheckPending ? sale.totalCentavos : (sale.montoChequePendienteCentavos ?? 0),
          detalle: [...sale.items.map((item) => `${item.productoNombre} x${item.cantidad}`),
            ...(sale.transporteDescargaCentavos > 0 ? ['Transporte y descarga'] : [])].join(', '),
          items: [...sale.items.map((item) => ({
            producto: item.productoNombre,
            cantidad: item.cantidad,
            precioUnitarioCentavos: Math.round(item.totalCentavos / item.cantidad),
            precioTotalCentavos: item.totalCentavos,
          })), ...(sale.transporteDescargaCentavos > 0 ? [{
            producto: 'TRANSPORTE Y DESCARGA',
            cantidad: 1,
            precioUnitarioCentavos: sale.transporteDescargaCentavos,
            precioTotalCentavos: sale.transporteDescargaCentavos,
          }] : [])],
          pagos: directPayments.concat((paymentMap.get(sale._id.toString()) ?? []).map(this.serializePayment)),
        };
      }), ...remittances.map((remittance) => ({
        id: remittance._id.toString(), codigo: remittance.codigo,
        entidadId: remittance.clienteId.toString(), entidadNombre: remittance.clienteNombre,
        tipo: 'REMITO', fecha: remittance.createdAt, totalCentavos: 0, pagadoCentavos: 0,
        saldoCentavos: 0, estado: remittance.cancelado ? 'CANCELADO' : 'PAGADO',
        detalle: `${remittance.items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', ')}${remittance.cancelado ? ` · Anulado: ${remittance.motivoCancelacion}` : ''}`,
        items: remittance.items.map((item) => ({ producto: item.productoNombre, cantidad: item.cantidad,
          precioUnitarioCentavos: 0, precioTotalCentavos: 0 })), pagos: [],
      })), ...openingDebts.filter((debt) => debt.tipoCuenta === 'CLIENTE').map((debt) => this.openingDocument(debt, paymentMap.get(debt._id.toString()) ?? [], status))],
    );
    const suppliers = this.group(
      [...purchases.map((purchase) => {
        const isCredit = purchase.medioPago === PurchasePaymentMethod.CREDIT;
        const paid = isCredit ? (purchase.montoPagadoCentavos ?? 0) : purchase.totalCentavos;
        const paymentDate = purchase.pagadaAt ?? purchase.fechaCompra;
        const directPayments = isCredit
          ? []
          : purchase.medioPago === PurchasePaymentMethod.HISTORICAL
            ? [{ id: `historical-${purchase._id.toString()}`, montoCentavos: purchase.totalCentavos, medioPago: purchase.medioPago, fecha: paymentDate, actorName: purchase.actorName }]
            : this.legacyPayments(
                purchase.medioPago === PurchasePaymentMethod.CASH ? purchase.totalCentavos : 0,
                purchase.medioPago === PurchasePaymentMethod.TRANSFER ? purchase.totalCentavos : 0,
                paymentDate,
              );
        return {
          id: purchase._id.toString(), codigo: purchase.codigo, entidadId: purchase.proveedorId.toString(), entidadNombre: purchase.proveedorNombre,
          tipo: 'COMPRA', fecha: purchase.fechaCompra, totalCentavos: purchase.totalCentavos, pagadoCentavos: paid,
          saldoCentavos: Math.max(0, purchase.totalCentavos - paid), estado: status(purchase.totalCentavos, paid),
          detalle: purchase.items.map((item) => `${item.productName} x${item.quantity}`).join(', '),
          pagos: directPayments.concat((paymentMap.get(purchase._id.toString()) ?? []).map(this.serializePayment)).concat(
            paymentMap.has(purchase._id.toString()) || !isCredit ? [] : this.legacyPayments(
              purchase.montoPagadoEfectivoCentavos ?? 0,
              purchase.montoPagadoTransferenciaCentavos ?? 0,
              purchase.pagadaAt ?? purchase.updatedAt,
            ),
          ),
        };
      }), ...openingDebts.filter((debt) => debt.tipoCuenta === 'PROVEEDOR').map((debt) => this.openingDocument(debt, paymentMap.get(debt._id.toString()) ?? [], status))],
    );
    return { clients: this.withEmptyEntities(clients, clientEntities), suppliers: this.withEmptyEntities(suppliers, supplierEntities) };
  }

  private openingDocument(debt: AccountOpeningDebt, payments: AccountPayment[], status: (total: number, paid: number) => string) {
    return { id: debt._id.toString(), codigo: 0, entidadId: debt.entidadId.toString(), entidadNombre: debt.entidadNombre,
      tipo: 'SALDO_INICIAL', fecha: debt.fecha, totalCentavos: debt.montoCentavos,
      pagadoCentavos: debt.pagadoCentavos, saldoCentavos: debt.cancelada ? 0 : debt.montoCentavos - debt.pagadoCentavos,
      estado: debt.cancelada ? 'CANCELADO' : status(debt.montoCentavos, debt.pagadoCentavos),
      detalle: `${debt.detalle || 'Saldo del sistema anterior'}${debt.cancelada ? ` · Cancelada: ${debt.motivoCancelacion}` : ''}`,
      pagos: payments.map(this.serializePayment) };
  }

  private withEmptyEntities(groups: any[], entities: Array<{ _id: Types.ObjectId; nombre: string }>) {
    const ids = new Set(groups.map((group) => group.entidadId));
    return [...groups, ...entities.filter((entity) => !ids.has(entity._id.toString())).map((entity) => ({
      entidadId: entity._id.toString(), entidadNombre: entity.nombre, totalCentavos: 0,
      pagadoCentavos: 0, saldoCentavos: 0, documentos: [],
    }))].sort((a, b) => a.entidadNombre.localeCompare(b.entidadNombre, 'es', { sensitivity: 'base' }));
  }

  addOpeningDebt(side: 'clients' | 'suppliers', entityId: string, amountCents: number, detail: string, actor: Actor) {
    if (!['clients', 'suppliers'].includes(side)) throw new BadRequestException('Tipo de cuenta inválido');
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new BadRequestException('Ingresá un importe válido');
    return this.connection.transaction(async () => {
      const isClient = side === 'clients';
      const entity = isClient ? await this.clientModel.findById(entityId).exec() : await this.supplierModel.findById(entityId).exec();
      if (!entity?.activo) throw new NotFoundException('Cuenta no encontrada');
      const debt = await this.openingDebtModel.create({ tipoCuenta: isClient ? 'CLIENTE' : 'PROVEEDOR',
        entidadId: entity._id, entidadNombre: entity.nombre, montoCentavos: amountCents, pagadoCentavos: 0,
        detalle: detail.trim(), fecha: new Date(), actorId: actor.id, actorName: actor.name });
      if (isClient) await this.clientModel.updateOne({ _id: entityId }, { $inc: { saldoCuentaCorrienteCentavos: amountCents } }).exec();
      return debt;
    });
  }

  cancelOpeningDebt(id: string, reason: string, actor: Actor) {
    return this.connection.transaction(async () => {
      const debt = await this.openingDebtModel.findById(id).exec();
      if (!debt || debt.cancelada) throw new NotFoundException('Deuda histórica no encontrada');
      if (debt.pagadoCentavos > 0) throw new ConflictException('No se puede cancelar una deuda que ya tiene pagos registrados');
      debt.cancelada = true; debt.canceladaAt = new Date(); debt.motivoCancelacion = reason.trim() || `Cancelada por ${actor.name}`;
      await debt.save();
      if (debt.tipoCuenta === 'CLIENTE') await this.clientModel.updateOne({ _id: debt.entidadId }, { $inc: { saldoCuentaCorrienteCentavos: -debt.montoCentavos } }).exec();
      return debt;
    });
  }

  payOpeningDebt(id: string, amountCents: number, method: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER, actor: Actor) {
    return this.connection.transaction(async () => {
      const debt = await this.openingDebtModel.findById(id).exec();
      if (!debt || debt.cancelada) throw new NotFoundException('Deuda histórica no encontrada');
      this.validateAmount(amountCents, debt.montoCentavos - debt.pagadoCentavos);
      debt.pagadoCentavos += amountCents;
      await debt.save();
      if (debt.tipoCuenta === 'CLIENTE') await this.clientModel.updateOne({ _id: debt.entidadId }, { $inc: { saldoCuentaCorrienteCentavos: -amountCents } }).exec();
      const payment = await this.paymentModel.create({ tipoCuenta: debt.tipoCuenta, entidadId: debt.entidadId,
        entidadNombre: debt.entidadNombre, comprobanteTipo: 'SALDO_INICIAL', comprobanteId: debt._id,
        comprobanteCodigo: 0, montoCentavos: amountCents, medioPago: method, fecha: new Date(), actorId: actor.id, actorName: actor.name });
      await this.financeModel.create({ sourceKey: `opening-debt-payment:${payment._id.toString()}`,
        tipo: debt.tipoCuenta === 'CLIENTE' ? FinancialMovementKind.INCOME : FinancialMovementKind.EXPENSE,
        categoria: debt.tipoCuenta === 'CLIENTE' ? FinancialMovementCategory.ACCOUNT_PAYMENT : FinancialMovementCategory.SUPPLIER_ACCOUNT_PAYMENT,
        montoCentavos: amountCents, concepto: `${debt.tipoCuenta === 'CLIENTE' ? 'Cobro' : 'Pago'} de saldo anterior`,
        detalle: debt.entidadNombre, medioPago: method, acreditadoEn: debt.tipoCuenta === 'CLIENTE' ? method : null,
        disponible: debt.tipoCuenta === 'CLIENTE', pagado: debt.tipoCuenta === 'PROVEEDOR',
        fechaMovimiento: payment.fecha, clienteId: debt.tipoCuenta === 'CLIENTE' ? debt.entidadId : null,
        clienteNombre: debt.tipoCuenta === 'CLIENTE' ? debt.entidadNombre : '',
        proveedorId: debt.tipoCuenta === 'PROVEEDOR' ? debt.entidadId : null,
        proveedorNombre: debt.tipoCuenta === 'PROVEEDOR' ? debt.entidadNombre : '', actorId: actor.id, actorName: actor.name });
      return debt;
    });
  }

  payClientSale(saleId: string, amountCents: number, method: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER, actor: Actor, accountingDate?: string) {
    return this.connection.transaction(async () => {
      const sale = await this.saleModel.findOne({ _id: saleId, estado: SaleStatus.CONFIRMED, medioPago: PaymentMethod.CREDIT }).exec();
      if (!sale) throw new NotFoundException('Venta a cuenta corriente inexistente');
      const paymentDate = accountingDate ? new Date(`${accountingDate.slice(0, 10)}T12:00:00-03:00`) : (sale.fechaFacturacion ?? sale.createdAt);
      if (Number.isNaN(paymentDate.getTime()) || (accountingDate && paymentDate.toISOString().slice(0, 10) !== accountingDate))
        throw new BadRequestException('La fecha del cobro no es válida');
      const paid = sale.montoCobradoCuentaCorrienteCentavos ?? 0;
      const remaining = sale.totalCentavos - paid;
      this.validateAmount(amountCents, remaining - (sale.montoChequePendienteCentavos ?? 0));
      const fullyPaid = amountCents === remaining;
      sale.montoCobradoCuentaCorrienteCentavos = paid + amountCents;
      if (method === FinancialPaymentMethod.CASH) sale.montoCobradoEfectivoCentavos = (sale.montoCobradoEfectivoCentavos ?? 0) + amountCents;
      else sale.montoCobradoTransferenciaCentavos = (sale.montoCobradoTransferenciaCentavos ?? 0) + amountCents;
      sale.cuentaCorrientePagada = fullyPaid;
      sale.cuentaCorrientePagadaAt = fullyPaid ? new Date() : null;
      await sale.save();
      const client = await this.clientModel.findOneAndUpdate(
        { _id: sale.clienteId, saldoCuentaCorrienteCentavos: { $gte: amountCents } },
        { $inc: { saldoCuentaCorrienteCentavos: -amountCents }, $push: { historialCambios: { actorId: actor.id, actorName: actor.name, action: 'ACCOUNT_PAYMENT', detail: `Cobro de venta #${sale.codigo} por ${amountCents} centavos`, date: new Date() } } },
        { new: true },
      ).exec();
      if (!client) throw new ConflictException('El saldo del cliente cambió. Volvé a intentar');
      const [payment] = await this.paymentModel.create([{ tipoCuenta: 'CLIENTE', entidadId: sale.clienteId, entidadNombre: sale.clienteNombre, comprobanteTipo: 'VENTA', comprobanteId: sale._id, comprobanteCodigo: sale.codigo, montoCentavos: amountCents, medioPago: method, fecha: paymentDate, actorId: actor.id, actorName: actor.name }]);
      await this.financeModel.create({
        sourceKey: `account-payment:${payment._id.toString()}`, tipo: FinancialMovementKind.INCOME,
        categoria: FinancialMovementCategory.ACCOUNT_PAYMENT, montoCentavos: amountCents,
        concepto: `Cobro cuenta corriente - Venta #${sale.codigo}`, detalle: sale.clienteNombre,
        medioPago: method, acreditadoEn: method, disponible: true, pagado: false,
        fechaMovimiento: payment.fecha, ventaId: sale._id, ventaCodigo: sale.codigo,
        clienteId: sale.clienteId, clienteNombre: sale.clienteNombre, actorId: actor.id, actorName: actor.name,
      });
      await this.financeModel.updateOne(
        { ventaId: sale._id, medioPago: FinancialPaymentMethod.CREDIT },
        { $inc: {
          montoPagadoCentavos: amountCents,
          ...(method === FinancialPaymentMethod.CASH
            ? { montoPagadoEfectivoCentavos: amountCents }
            : { montoPagadoTransferenciaCentavos: amountCents }),
        }, $set: { pagado: fullyPaid, pagadoAt: fullyPaid ? new Date() : null } },
      ).exec();
      return sale;
    });
  }

  reviseClientPayment(id: string, dto: ReviseClientPaymentDto, actor: Actor) {
    return this.changeClientPayment(id, dto, false, actor);
  }

  cancelClientPayment(id: string, reason: string, actor: Actor) {
    return this.changeClientPayment(id, null, true, actor, reason);
  }

  private changeClientPayment(id: string, dto: ReviseClientPaymentDto | null, cancel: boolean, actor: Actor, reason = '') {
    return this.connection.transaction(async () => {
      const payment = await this.paymentModel.findOne({ _id: id, tipoCuenta: 'CLIENTE', cancelado: { $ne: true } }).exec();
      if (!payment) throw new NotFoundException('Cobro inexistente o anulado');
      if (payment.origenChequeId) throw new ConflictException('Los cobros con cheque se corrigen desde el módulo de cheques');
      const oldAmount = payment.montoCentavos;
      const newAmount = cancel ? 0 : dto!.amountCents;
      if (!cancel && (!Number.isSafeInteger(newAmount) || newAmount <= 0)) throw new BadRequestException('Ingresá un importe válido');
      const delta = newAmount - oldAmount;
      let accountingDate = payment.fecha;
      if (!cancel) {
        accountingDate = new Date(`${dto!.accountingDate.slice(0, 10)}T12:00:00-03:00`);
        const dateParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(accountingDate);
        const actualDay = ['year', 'month', 'day'].map((type) => dateParts.find((part) => part.type === type)?.value).join('-');
        if (Number.isNaN(accountingDate.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(dto!.accountingDate) || actualDay !== dto!.accountingDate)
          throw new BadRequestException('La fecha contable no es válida');
      }
      if (payment.comprobanteTipo === 'VENTA') {
        const sale = await this.saleModel.findOne({ _id: payment.comprobanteId, estado: SaleStatus.CONFIRMED }).exec();
        if (!sale) throw new ConflictException('La venta ya no está disponible');
        const nextPaid = (sale.montoCobradoCuentaCorrienteCentavos ?? 0) + delta;
        if (nextPaid < 0 || nextPaid > sale.totalCentavos - (sale.montoChequePendienteCentavos ?? 0))
          throw new ConflictException('El cobro corregido supera el saldo de la venta');
        const oldMethod = payment.medioPago;
        sale.montoCobradoCuentaCorrienteCentavos = nextPaid;
        sale.montoCobradoEfectivoCentavos = (sale.montoCobradoEfectivoCentavos ?? 0) - (oldMethod === FinancialPaymentMethod.CASH ? oldAmount : 0) + (!cancel && dto!.paymentMethod === FinancialPaymentMethod.CASH ? newAmount : 0);
        sale.montoCobradoTransferenciaCentavos = (sale.montoCobradoTransferenciaCentavos ?? 0) - (oldMethod === FinancialPaymentMethod.TRANSFER ? oldAmount : 0) + (!cancel && dto!.paymentMethod === FinancialPaymentMethod.TRANSFER ? newAmount : 0);
        sale.cuentaCorrientePagada = nextPaid >= sale.totalCentavos;
        sale.cuentaCorrientePagadaAt = sale.cuentaCorrientePagada ? new Date() : null;
        await sale.save();
        await this.financeModel.updateOne({ sourceKey: `sale:${sale._id.toString()}:income` }, { $inc: {
          montoPagadoCentavos: delta,
          montoPagadoEfectivoCentavos: -(oldMethod === FinancialPaymentMethod.CASH ? oldAmount : 0) + (!cancel && dto!.paymentMethod === FinancialPaymentMethod.CASH ? newAmount : 0),
          montoPagadoTransferenciaCentavos: -(oldMethod === FinancialPaymentMethod.TRANSFER ? oldAmount : 0) + (!cancel && dto!.paymentMethod === FinancialPaymentMethod.TRANSFER ? newAmount : 0),
        }, $set: { pagado: sale.cuentaCorrientePagada, pagadoAt: sale.cuentaCorrientePagada ? new Date() : null } }).exec();
      } else if (payment.comprobanteTipo === 'SALDO_INICIAL') {
        const debt = await this.openingDebtModel.findOne({ _id: payment.comprobanteId, cancelada: { $ne: true } }).exec();
        if (!debt) throw new ConflictException('La deuda anterior ya no está disponible');
        const nextPaid = debt.pagadoCentavos + delta;
        if (nextPaid < 0 || nextPaid > debt.montoCentavos) throw new ConflictException('El cobro corregido supera el saldo de la deuda');
        debt.pagadoCentavos = nextPaid;
        await debt.save();
      } else throw new ConflictException('Este pago no corresponde a una cuenta de cliente');
      if (delta) await this.clientModel.updateOne({ _id: payment.entidadId }, { $inc: { saldoCuentaCorrienteCentavos: -delta } }).exec();
      const movement = await this.financeModel.findOne({ sourceKey: `${payment.comprobanteTipo === 'VENTA' ? 'account-payment' : 'opening-debt-payment'}:${payment._id.toString()}`, cancelado: { $ne: true } }).exec();
      if (!movement) throw new ConflictException('No se encontró el movimiento de caja asociado al cobro');
      payment.historialCorrecciones.push({ fecha: new Date(), montoCentavos: oldAmount, medioPago: payment.medioPago, fechaContable: payment.fecha, actorName: actor.name, motivo: cancel ? reason.trim() : dto!.reason?.trim() ?? '' });
      if (cancel) { payment.cancelado = true; payment.motivoCancelacion = reason.trim() || `Anulado por ${actor.name}`; }
      else { payment.montoCentavos = newAmount; payment.medioPago = dto!.paymentMethod; payment.fecha = accountingDate; payment.corregidoAt = new Date(); payment.corregidoPorNombre = actor.name; payment.motivoCorreccion = dto!.reason?.trim() ?? ''; }
      await payment.save();
      if (cancel) {
        movement.cancelado = true; movement.disponible = false; movement.motivoCancelacion = payment.motivoCancelacion;
        movement.canceladoAt = new Date(); movement.canceladoPorId = actor.id; movement.canceladoPorNombre = actor.name;
      } else {
        movement.montoCentavos = newAmount; movement.medioPago = dto!.paymentMethod;
        movement.acreditadoEn = dto!.paymentMethod; movement.fechaMovimiento = accountingDate;
      }
      await movement.save();
      return payment;
    });
  }

  async paySupplierPurchase(purchaseId: string, amountCents: number, method: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER, actor: Actor) {
    const purchase = await this.purchaseModel.findById(purchaseId).exec();
    if (!purchase) throw new NotFoundException('Compra inexistente');
    const purchaseMethod = method === FinancialPaymentMethod.CASH
      ? PurchasePaymentMethod.CASH
      : PurchasePaymentMethod.TRANSFER;
    const updated = await this.purchasesService.pay(purchaseId, purchaseMethod, actor, amountCents);
    const payment = await this.paymentModel.create({ tipoCuenta: 'PROVEEDOR', entidadId: purchase.proveedorId, entidadNombre: purchase.proveedorNombre, comprobanteTipo: 'COMPRA', comprobanteId: purchase._id, comprobanteCodigo: purchase.codigo, montoCentavos: amountCents, medioPago: method, fecha: new Date(), actorId: actor.id, actorName: actor.name });
    // Vincula el movimiento que creó PurchasesService con el pago de cuenta para
    // que la reconciliación histórica nunca pueda duplicarlo.
    await this.financeModel.findOneAndUpdate(
      {
        compraId: purchase._id,
        categoria: FinancialMovementCategory.SUPPLIER_ACCOUNT_PAYMENT,
        montoCentavos: amountCents,
        sourceKey: /^purchase-payment:/,
      },
      { $set: { sourceKey: `account-payment:${payment._id.toString()}` } },
      { sort: { fechaMovimiento: -1 } },
    ).exec();
    return updated;
  }

  private validateAmount(amount: number, remaining: number) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new BadRequestException('Ingresá un importe válido');
    if (amount > remaining) throw new BadRequestException('El importe no puede superar el saldo pendiente');
  }

  private group(documents: any[]) {
    const groups = new Map<string, any>();
    for (const document of documents) {
      const current = groups.get(document.entidadId) ?? { entidadId: document.entidadId, entidadNombre: document.entidadNombre, totalCentavos: 0, pagadoCentavos: 0, saldoCentavos: 0, documentos: [] };
      if (document.estado !== 'CANCELADO') {
        current.totalCentavos += document.totalCentavos;
        current.pagadoCentavos += document.pagadoCentavos;
        current.saldoCentavos += document.saldoCentavos;
      }
      current.documentos.push(document);
      groups.set(document.entidadId, current);
    }
    return [...groups.values()].sort((a, b) => a.entidadNombre.localeCompare(b.entidadNombre, 'es', { sensitivity: 'base' }));
  }

  private serializePayment(payment: any) {
    return { id: payment._id.toString(), montoCentavos: payment.montoCentavos,
      medioPago: payment.origenChequeId ? 'CHEQUE' : payment.medioPago,
      fecha: payment.fecha, registradoAt: payment.createdAt, actorName: payment.actorName,
      cancelado: !!payment.cancelado, motivoCancelacion: payment.motivoCancelacion ?? '',
      corregidoAt: payment.corregidoAt, corregidoPorNombre: payment.corregidoPorNombre,
      historialCorrecciones: payment.historialCorrecciones ?? [], editable: !payment.origenChequeId };
  }

  private legacyPayments(cash: number, transfer: number, date: Date) {
    return [
      ...(cash > 0 ? [{ id: `legacy-cash-${date.getTime()}`, montoCentavos: cash, medioPago: FinancialPaymentMethod.CASH, fecha: date, actorName: 'Pago registrado anteriormente' }] : []),
      ...(transfer > 0 ? [{ id: `legacy-transfer-${date.getTime()}`, montoCentavos: transfer, medioPago: FinancialPaymentMethod.TRANSFER, fecha: date, actorName: 'Pago registrado anteriormente' }] : []),
    ];
  }
}
