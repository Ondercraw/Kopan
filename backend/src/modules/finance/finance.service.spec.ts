import { PaymentMethod } from '../sales/enums/payment-method.enum';
import { SaleStatus } from '../sales/enums/sale-status.enum';
import { FinanceService } from './finance.service';
import { FinancialMovementCategory, FinancialMovementKind } from './enums/financial-movement.enum';
import { Types } from 'mongoose';

describe('FinanceService', () => {
  it('registra un ingreso y el costo de reposición de cada venta confirmada', async () => {
    const movementModel = { updateOne: jest.fn().mockResolvedValue({ acknowledged: true }) };
    const service = new FinanceService(
      movementModel as never,
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
      items: [{ productoNombre: 'Harina', cantidad: 2, costoUnitarioCentavos: 40_000_00 }],
      actorId: 'owner-id',
      actorName: 'Dueño',
      createdAt: new Date('2026-09-02T12:00:00Z'),
      chequeId: null,
      chequeNumero: '',
      chequeCobradoAt: null,
    };

    await service.recordSale(sale as never);

    expect(movementModel.updateOne).toHaveBeenCalledTimes(2);
    expect(movementModel.updateOne.mock.calls[0][1].$setOnInsert).toMatchObject({
      tipo: FinancialMovementKind.INCOME,
      categoria: FinancialMovementCategory.SALE,
      montoCentavos: 100_000_00,
      disponible: true,
    });
    expect(movementModel.updateOne.mock.calls[1][1].$setOnInsert).toMatchObject({
      tipo: FinancialMovementKind.EXPENSE,
      categoria: FinancialMovementCategory.REPLENISHMENT,
      montoCentavos: 80_000_00,
      pagado: false,
    });
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
});
