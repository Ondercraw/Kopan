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
import { AccountPayment, AccountPaymentDocument } from './schemas/account-payment.schema';

interface Actor { id: string; name: string }

@Injectable()
export class AccountsService implements OnModuleInit {
  private readonly logger = new Logger(AccountsService.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(AccountPayment.name) private readonly paymentModel: Model<AccountPaymentDocument>,
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
    const [sales, purchases, payments] = await Promise.all([
      this.saleModel.find({ estado: SaleStatus.CONFIRMED, medioPago: { $in: [PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.CREDIT, PaymentMethod.CHECK] } }).sort({ createdAt: -1 }).lean().exec(),
      this.purchaseModel.find({ estado: PurchaseStatus.CONFIRMED, medioPago: { $in: [PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER, PurchasePaymentMethod.CREDIT, PurchasePaymentMethod.HISTORICAL] } }).sort({ fechaCompra: -1 }).lean().exec(),
      this.paymentModel.find().sort({ fecha: -1 }).lean().exec(),
    ]);
    const paymentMap = new Map<string, typeof payments>();
    for (const payment of payments) {
      const key = payment.comprobanteId.toString();
      paymentMap.set(key, [...(paymentMap.get(key) ?? []), payment]);
    }
    const status = (total: number, paid: number) => paid <= 0 ? 'PENDIENTE' : paid < total ? 'PARCIAL' : 'PAGADO';
    const clients = this.group(
      sales.map((sale) => {
        const isCredit = sale.medioPago === PaymentMethod.CREDIT;
        const paid = isCredit ? (sale.montoCobradoCuentaCorrienteCentavos ?? 0) : sale.totalCentavos;
        const directPayments = isCredit ? [] : [{ id: `sale-initial-${sale._id.toString()}`, montoCentavos: sale.totalCentavos, medioPago: sale.medioPago, fecha: sale.createdAt, actorName: sale.actorName }];
        return {
          id: sale._id.toString(), codigo: sale.codigo, entidadId: sale.clienteId.toString(), entidadNombre: sale.clienteNombre,
          tipo: 'VENTA', fecha: sale.createdAt, totalCentavos: sale.totalCentavos, pagadoCentavos: paid,
          saldoCentavos: Math.max(0, sale.totalCentavos - paid), estado: status(sale.totalCentavos, paid),
          detalle: sale.items.map((item) => `${item.productoNombre} x${item.cantidad}`).join(', '),
          pagos: directPayments.concat((paymentMap.get(sale._id.toString()) ?? []).map(this.serializePayment)),
        };
      }),
    );
    const suppliers = this.group(
      purchases.map((purchase) => {
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
      }),
    );
    return { clients, suppliers };
  }

  payClientSale(saleId: string, amountCents: number, method: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER, actor: Actor) {
    return this.connection.transaction(async () => {
      const sale = await this.saleModel.findOne({ _id: saleId, estado: SaleStatus.CONFIRMED, medioPago: PaymentMethod.CREDIT }).exec();
      if (!sale) throw new NotFoundException('Venta a cuenta corriente inexistente');
      const paid = sale.montoCobradoCuentaCorrienteCentavos ?? 0;
      const remaining = sale.totalCentavos - paid;
      this.validateAmount(amountCents, remaining);
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
      const [payment] = await this.paymentModel.create([{ tipoCuenta: 'CLIENTE', entidadId: sale.clienteId, entidadNombre: sale.clienteNombre, comprobanteTipo: 'VENTA', comprobanteId: sale._id, comprobanteCodigo: sale.codigo, montoCentavos: amountCents, medioPago: method, fecha: new Date(), actorId: actor.id, actorName: actor.name }]);
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
      current.totalCentavos += document.totalCentavos;
      current.pagadoCentavos += document.pagadoCentavos;
      current.saldoCentavos += document.saldoCentavos;
      current.documentos.push(document);
      groups.set(document.entidadId, current);
    }
    return [...groups.values()].sort((a, b) => a.entidadNombre.localeCompare(b.entidadNombre, 'es', { sensitivity: 'base' }));
  }

  private serializePayment(payment: any) {
    return { id: payment._id.toString(), montoCentavos: payment.montoCentavos, medioPago: payment.medioPago, fecha: payment.fecha, actorName: payment.actorName };
  }

  private legacyPayments(cash: number, transfer: number, date: Date) {
    return [
      ...(cash > 0 ? [{ id: `legacy-cash-${date.getTime()}`, montoCentavos: cash, medioPago: FinancialPaymentMethod.CASH, fecha: date, actorName: 'Pago registrado anteriormente' }] : []),
      ...(transfer > 0 ? [{ id: `legacy-transfer-${date.getTime()}`, montoCentavos: transfer, medioPago: FinancialPaymentMethod.TRANSFER, fecha: date, actorName: 'Pago registrado anteriormente' }] : []),
    ];
  }
}
