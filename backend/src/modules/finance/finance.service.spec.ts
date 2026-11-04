import { PaymentMethod } from '../sales/enums/payment-method.enum';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { FinanceService } from './finance.service';
import {
  FinancialMovementCategory,
  FinancialMovementKind,
} from './enums/financial-movement.enum';
import { Types } from 'mongoose';

describe('FinanceService', () => {
  it('suma compras, reposiciones y gastos por su fecha original sin duplicar pagos', async () => {
    const exec = jest.fn().mockResolvedValue([{ totalCentavos: 15000 }]);
    const aggregate = jest.fn().mockReturnValue({ exec });
    const service = new FinanceService(
      { aggregate } as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    const from = '2026-10-01T03:00:00.000Z';
    const to = '2026-11-01T03:00:00.000Z';

    expect(await service.totalExpenses({ from, to })).toEqual({ totalCentavos: 15000 });
    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline[0].$match.categoria.$in).toEqual(expect.arrayContaining([
      FinancialMovementCategory.PURCHASE,
      FinancialMovementCategory.REPLENISHMENT,
      FinancialMovementCategory.MANUAL,
    ]));
    expect(pipeline[0].$match.categoria.$in).not.toContain(FinancialMovementCategory.SUPPLIER_ACCOUNT_PAYMENT);
    expect(pipeline[0].$match).not.toHaveProperty('pagado');
    expect(pipeline[0].$match.fechaMovimiento).toEqual({ $gte: new Date(from), $lt: new Date(to) });
  });
  it('anula los cobros parciales vinculados y los quita del dinero disponible', async () => {
    const saleId = new Types.ObjectId();
    const payments = [{ montoCentavos: 6000 }, { montoCentavos: 4000 }];
    const accountPayments = {
      find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(payments) }) }),
      updateMany: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }),
    };
    const movements = {
      find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(payments) }) }),
      updateMany: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }),
      updateOne: jest.fn().mockReturnValue({ exec: () => Promise.resolve({}) }),
    };
    const service = new FinanceService(movements as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, accountPayments as never);
    await service.cancelSaleRecord({ _id: saleId, montoCobradoCuentaCorrienteCentavos: 10000 } as never,
      'Error de carga', { id: 'owner', name: 'Dueño' });
    expect(accountPayments.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ comprobanteId: saleId }), expect.objectContaining({ $set: expect.objectContaining({ cancelado: true }) }),
    );
    expect(movements.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ ventaId: saleId, sourceKey: /^account-payment:/ }),
      expect.objectContaining({ $set: expect.objectContaining({ cancelado: true, disponible: false }) }),
    );
  });
  it('consulta movimientos sin ejecutar conciliaciones masivas en cada apertura', async () => {
    const movementQuery = {
      sort: jest.fn(),
      limit: jest.fn(),
      lean: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    movementQuery.sort.mockReturnValue(movementQuery);
    movementQuery.limit.mockReturnValue(movementQuery);
    movementQuery.lean.mockReturnValue(movementQuery);
    const aggregateExec = jest.fn().mockResolvedValue([]);
    const movementModel = {
      find: jest.fn().mockReturnValue(movementQuery),
      aggregate: jest.fn().mockReturnValue({ exec: aggregateExec }),
    };
    const saleModel = { find: jest.fn() };
    const checkModel = { find: jest.fn() };
    const service = new FinanceService(
      movementModel as never,
      saleModel as never,
      {} as never,
      checkModel as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.findAll();

    expect(movementModel.find).toHaveBeenCalledTimes(1);
    expect(movementModel.aggregate).toHaveBeenCalledTimes(2);
    expect(saleModel.find).not.toHaveBeenCalled();
    expect(checkModel.find).not.toHaveBeenCalled();
    expect(result.period.ingresosCentavos).toBe(0);
    expect(result.overall.gastosPendientesCentavos).toBe(0);
  });

  it('registra sólo el ingreso de venta sin duplicar el gasto de compra', async () => {
    const movementModel = {
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ acknowledged: true }),
      }),
    };
    const service = new FinanceService(
      movementModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const sale = {
      _id: { toString: () => 'sale-id' },
      codigo: 4,
      estado: SaleStatus.CONFIRMED,
      medioPago: PaymentMethod.CASH,
      totalCentavos: 100_000_00,
      costoCentavos: 80_000_00,
      clienteId: 'client-id',
      clienteNombre: 'Cliente prueba',
      items: [
        {
          productoNombre: 'Harina',
          cantidad: 2,
          costoUnitarioCentavos: 40_000_00,
        },
      ],
      actorId: 'owner-id',
      actorName: 'Dueño',
      createdAt: new Date('2026-09-02T12:00:00Z'),
      fechaFacturacion: new Date('2026-08-30T12:00:00Z'),
      chequeId: null,
      chequeNumero: '',
      chequeCobradoAt: null,
    };

    await service.recordSale(sale as never);

    expect(movementModel.updateOne).toHaveBeenCalledTimes(1);
    expect(movementModel.updateOne.mock.calls[0][1].$set).toMatchObject(
      {
        tipo: FinancialMovementKind.INCOME,
        categoria: FinancialMovementCategory.SALE,
        montoCentavos: 100_000_00,
        disponible: true,
        fechaMovimiento: new Date('2026-08-30T12:00:00Z'),
      },
    );
  });
  it('separa el cheque pendiente del cobro inicial de una venta mixta', async () => {
    const saleId = new Types.ObjectId();
    const checkId = new Types.ObjectId();
    const updateOne = jest.fn().mockReturnValue({ exec: async () => ({ upsertedCount: 1 }) });
    const create = jest.fn().mockResolvedValue(undefined);
    const paymentCreate = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = new FinanceService({ updateOne, create } as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, { create: paymentCreate } as never,
      {} as never);
    const sale = { _id: saleId, codigo: 8, estado: SaleStatus.CONFIRMED,
      medioPago: PaymentMethod.CREDIT, totalCentavos: 10000,
      montoCobradoCuentaCorrienteCentavos: 3000, montoCobradoEfectivoCentavos: 3000,
      montoChequePendienteCentavos: 5000, chequeId: checkId, chequeNumero: '123',
      clienteId: new Types.ObjectId(), clienteNombre: 'Cliente', items: [],
      actorId: 'owner', actorName: 'Dueño', createdAt: new Date('2026-11-01T12:00:00Z') };
    await service.recordSale(sale as never);
    await service.recordInitialSalePayment(sale as never, 3000, 'EFECTIVO' as never);
    expect(updateOne).toHaveBeenCalledWith(
      { sourceKey: `check:${checkId.toString()}:income` },
      expect.objectContaining({ $setOnInsert: expect.objectContaining({ montoCentavos: 5000, disponible: false }) }),
      { upsert: true },
    );
    expect(paymentCreate).toHaveBeenCalledWith(expect.objectContaining({ montoCentavos: 3000 }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ montoCentavos: 3000, disponible: true }));
  });
  it('reimputa los cobros a la fecha corregida de la venta y conserva el registro real', async () => {
    const saleId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const date = new Date('2026-11-01T15:00:00Z');
    const payments = { find: jest.fn().mockReturnValue({ lean: () => ({ exec: async () => [{ _id: paymentId }] }) }),
      updateMany: jest.fn().mockReturnValue({ exec: async () => ({}) }) };
    const movements = { updateOne: jest.fn().mockReturnValue({ exec: async () => ({}) }) };
    const service = new FinanceService(movements as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, payments as never, {} as never);
    await service.updateSalePaymentDates({ _id: saleId, fechaFacturacion: date } as never);
    expect(payments.updateMany).toHaveBeenCalledWith(
      { comprobanteTipo: 'VENTA', comprobanteId: saleId }, { $set: { fecha: date } },
    );
    expect(movements.updateOne).toHaveBeenCalledWith(
      { sourceKey: `account-payment:${paymentId.toString()}` }, { $set: { fechaMovimiento: date } },
    );
  });
  it('al cobrar un cheque mixto reduce la deuda y acredita el destino una sola vez', async () => {
    const saleId = new Types.ObjectId();
    const checkId = new Types.ObjectId();
    const paymentId = new Types.ObjectId();
    const clientId = new Types.ObjectId();
    const updateOne = jest.fn().mockReturnValue({ exec: async () => ({ upsertedCount: 0 }) });
    const transaction = jest.fn(async (callback: () => Promise<void>) => callback());
    const service = new FinanceService({ exists: () => ({ exec: async () => null }), updateOne } as never,
      { findById: () => ({ exec: async () => ({ _id: saleId, codigo: 8, medioPago: PaymentMethod.CREDIT,
        clienteId: clientId, clienteNombre: 'Cliente', totalCentavos: 10000,
        montoCobradoCuentaCorrienteCentavos: 3000, fechaFacturacion: new Date('2026-11-01T15:00:00Z') }) }),
        updateOne } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { findOneAndUpdate: () => ({ exec: async () => ({ _id: paymentId }) }) } as never,
      { updateOne } as never, { transaction } as never);
    await service.markCheckCollected({ _id: checkId, numero: '123', montoCentavos: 5000,
      clienteId: clientId, clienteNombre: 'Cliente', ventaId: saleId, ventaCodigo: 8,
      actorId: 'owner', actorName: 'Dueño', cobradoAt: new Date(), acreditadoEn: 'EFECTIVO' as never });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(updateOne).toHaveBeenCalledWith({ _id: saleId }, expect.objectContaining({
      $inc: expect.objectContaining({ montoCobradoCuentaCorrienteCentavos: 5000, montoCobradoEfectivoCentavos: 5000 }),
      $set: expect.objectContaining({ montoChequePendienteCentavos: 0 }),
    }));
    expect(updateOne).toHaveBeenCalledWith({ _id: clientId }, { $inc: { saldoCuentaCorrienteCentavos: -5000 } });
  });

  it('congela el costo de cada reposición manual en su propio movimiento', async () => {
    const exec = jest.fn().mockResolvedValue({ acknowledged: true });
    const movementModel = { updateOne: jest.fn().mockReturnValue({ exec }) };
    const supplierModel = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ nombre: 'Molino prueba' }),
        }),
      }),
    };
    const service = new FinanceService(
      movementModel as never,
      {} as never,
      supplierModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const movementId = new Types.ObjectId();

    await service.recordStockReplenishment({
      stockMovementId: movementId,
      productId: new Types.ObjectId(),
      productCode: 1,
      productName: 'Harina',
      units: 15,
      unitCostCents: 1500,
      supplierId: new Types.ObjectId(),
      actor: { id: 'owner-id', name: 'Dueño' },
      date: new Date('2026-09-02T12:00:00Z'),
    });

    expect(movementModel.updateOne).toHaveBeenCalledWith(
      { sourceKey: `stock:${movementId.toString()}:replenishment` },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          categoria: FinancialMovementCategory.REPLENISHMENT,
          montoCentavos: 22_500,
          concepto: 'Reposición manual desde Gestión de stock - Producto #1',
          proveedorNombre: 'Molino prueba',
        }),
      }),
      { upsert: true },
    );
  });

  it.each([
    ['pendiente', false],
    ['pagado', true],
  ])(
    'cancela definitivamente un gasto manual %s y conserva el historial',
    async (_, pagado) => {
      const movement = {
        _id: new Types.ObjectId(),
        tipo: FinancialMovementKind.EXPENSE,
        categoria: FinancialMovementCategory.MANUAL,
        sourceKey: `manual:${new Types.ObjectId().toString()}`,
        pagado,
        cancelado: false,
      };
      const claimed = { ...movement, cancelado: true };
      const movementModel = {
        findById: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(movement),
        }),
        findOneAndUpdate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(claimed),
        }),
      };
      const productModel = {
        db: { transaction: jest.fn((work: () => unknown) => work()) },
      };
      const service = new FinanceService(
        movementModel as never,
        {} as never,
        {} as never,
        {} as never,
        productModel as never,
        {} as never,
        {} as never,
      );

      const result = await service.cancelExpense(
        movement._id.toString(),
        'Carga duplicada',
        { id: 'owner-id', name: 'Dueño' },
      );

      expect(result.cancelado).toBe(true);
      expect(movementModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: movement._id, cancelado: { $ne: true } },
        expect.objectContaining({
          $set: expect.objectContaining({
            cancelado: true,
            motivoCancelacion: 'Carga duplicada',
            canceladoPorNombre: 'Dueño',
          }),
        }),
        { new: true },
      );
    },
  );

  it('no descuenta otro stock aunque el total sea 1201 si la unidad vinculada ya salió', async () => {
    const productId = new Types.ObjectId();
    const stockMovementId = new Types.ObjectId();
    const movement = {
      _id: new Types.ObjectId(),
      tipo: FinancialMovementKind.EXPENSE,
      categoria: FinancialMovementCategory.REPLENISHMENT,
      sourceKey: `stock:${stockMovementId.toString()}:replenishment`,
      stockMovementId,
      unidadesReposicion: 1,
      pagado: false,
      cancelado: false,
    };
    const claimed = {
      ...movement,
      cancelado: true,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const movementModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(movement),
      }),
      findOneAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(claimed),
      }),
      updateOne: jest.fn(),
    };
    const product = {
      _id: productId,
      codigo: 15,
      nombre: 'Harina 0000 Cánepa',
      activo: true,
      cantidadStock: 1_201,
      costoCentavos: 10_000,
      save: jest.fn(),
    };
    const productModel = {
      db: { transaction: jest.fn((work: () => unknown) => work()) },
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(product),
      }),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
    };
    const stockMovementModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: stockMovementId,
          productId,
          type: 'INCREMENT',
          previousStock: 1_200,
          currentStock: 1_201,
        }),
      }),
      create: jest.fn(),
    };
    const inventoryLots = {
      adjust: jest.fn(),
      linkedAdjustmentRemaining: jest.fn().mockResolvedValue(0),
      cancelLinkedAdjustment: jest.fn().mockResolvedValue(10_000),
    };
    const service = new FinanceService(
      movementModel as never,
      {} as never,
      {} as never,
      {} as never,
      productModel as never,
      stockMovementModel as never,
      inventoryLots as never,
    );

    const result = await service.cancelExpense(movement._id.toString(), '', {
      id: 'owner-id',
      name: 'Dueño',
    });

    expect(result.cancelado).toBe(true);
    expect(productModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(inventoryLots.adjust).not.toHaveBeenCalled();
    expect(inventoryLots.cancelLinkedAdjustment).toHaveBeenCalledWith(
      stockMovementId,
      productId,
      1_201,
      10_000,
    );
    expect(stockMovementModel.create).not.toHaveBeenCalled();
    expect(product.cantidadStock).toBe(1_201);
  });
});
