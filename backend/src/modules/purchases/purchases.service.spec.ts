import { PurchasePaymentMethod, PurchaseStatus } from './enums/purchase.enum';
import { PurchasesService } from './purchases.service';
import { PurchaseKind } from './enums/purchase.enum';
import { Types } from 'mongoose';

describe('PurchasesService', () => {
  it('registra un pago parcial sin cerrar la deuda completa', async () => {
    const purchase = {
      _id: { toString: () => 'purchase-id' },
      estado: PurchaseStatus.CONFIRMED,
      medioPago: PurchasePaymentMethod.CREDIT,
      pagada: false,
      totalCentavos: 10_000,
      montoPagadoCentavos: 0,
      montoPagadoEfectivoCentavos: 0,
      montoPagadoTransferenciaCentavos: 0,
      pagadaAt: null,
      codigo: 7,
      items: [{ productName: 'Harina', quantity: 4 }],
      proveedorId: 'supplier-id',
      proveedorNombre: 'Proveedor prueba',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const purchaseModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(purchase),
      }),
    };
    const financeExec = jest.fn().mockResolvedValue({ acknowledged: true });
    const financeModel = {
      updateOne: jest.fn().mockReturnValue({ exec: financeExec }),
      create: jest.fn().mockResolvedValue({}),
    };
    const connection = {
      transaction: jest.fn((work: () => unknown) => work()),
    };
    const service = new PurchasesService(
      connection as never,
      purchaseModel as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      financeModel as never,
      {} as never,
      {} as never,
    );

    const result = await service.pay(
      'purchase-id',
      PurchasePaymentMethod.CASH,
      { id: 'owner-id', name: 'Dueño' },
      4_000,
    );

    expect(result.pagada).toBe(false);
    expect(result.montoPagadoCentavos).toBe(4_000);
    expect(result.montoPagadoEfectivoCentavos).toBe(4_000);
    expect(result.pagadaAt).toBeNull();
    expect(financeModel.updateOne).toHaveBeenCalledWith(
      { compraId: purchase._id },
      expect.objectContaining({
        $inc: expect.objectContaining({
          montoPagadoCentavos: 4_000,
        }),
        $set: expect.objectContaining({ pagado: false }),
      }),
    );
    expect(financeModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        montoCentavos: 4_000,
        pagado: true,
        fechaMovimiento: expect.any(Date),
      }),
    );
  });

  it('corrige el costo de un lote vendido y actualiza el costo de la venta sin cambiar su ingreso', async () => {
    const lotId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const purchaseId = new Types.ObjectId();
    const purchaseItem = { productId, productCode: 3, productName: 'Harina', lineNumber: 1,
      quantity: 5, unitCostCents: 100, subtotalCents: 500 };
    const purchase = { _id: purchaseId, codigo: 7, tipo: PurchaseKind.PURCHASE,
      medioPago: PurchasePaymentMethod.CREDIT, montoPagadoCentavos: 0,
      items: [purchaseItem], save: jest.fn().mockResolvedValue(undefined) };
    const lot = { _id: lotId, initialQuantity: 5, remainingQuantity: 3,
      unitCostCents: 100, save: jest.fn().mockResolvedValue(undefined) };
    const product = { _id: productId, codigo: 3, nombre: 'Harina', cantidadStock: 3,
      costoCentavos: 100, save: jest.fn().mockResolvedValue(undefined) };
    const saleItem = { productoId: productId, cantidad: 2, costoUnitarioCentavos: 100,
      costoPromedioUnitarioCentavos: 100, costoTotalCentavos: 200,
      lotesConsumidos: [{ lotId, quantity: 2 }] };
    const sale = { _id: new Types.ObjectId(), codigo: 9, items: [saleItem],
      costoCentavos: 200, costoPromedioCentavos: 200, totalCentavos: 900,
      save: jest.fn().mockResolvedValue(undefined) };
    const service = new PurchasesService(
      { transaction: jest.fn((work: () => unknown) => work()) } as never,
      { findOne: jest.fn().mockReturnValue({ exec: async () => purchase }) } as never,
      { findOne: jest.fn().mockReturnValue({ exec: async () => lot }) } as never,
      { updateOne: jest.fn().mockReturnValue({ exec: async () => ({}) }),
        findById: jest.fn().mockReturnValue({ exec: async () => product }) } as never,
      {} as never, {} as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      { updateOne: jest.fn().mockReturnValue({ exec: async () => ({}) }),
        updateMany: jest.fn().mockReturnValue({ exec: async () => ({}) }) } as never,
      { summary: jest.fn().mockResolvedValueOnce({ quantity: 3, averageCostCents: 100 })
          .mockResolvedValueOnce({ quantity: 3, averageCostCents: 150 }),
        latestUnitCost: jest.fn().mockResolvedValue(150) } as never,
      { find: jest.fn().mockReturnValue({ exec: async () => [sale] }) } as never,
    );

    await service.updateItem(purchaseId.toString(), 1,
      { quantity: 5, unitCostCents: 150, expectedQuantity: 5, expectedUnitCostCents: 100 },
      { id: 'owner', name: 'Dueño' });

    expect(lot.unitCostCents).toBe(150);
    expect(product.costoCentavos).toBe(150);
    expect(purchase.totalCentavos).toBe(750);
    expect(saleItem.costoTotalCentavos).toBe(300);
    expect(sale.costoCentavos).toBe(300);
    expect(sale.totalCentavos).toBe(900);
    expect(saleItem.costoCorregidoPorNombre).toBe('Dueño');
  });

  it('no permite reducir la compra por debajo de las unidades ya consumidas', async () => {
    const purchase = { items: [{ lineNumber: 1, quantity: 5, unitCostCents: 100 }],
      estado: PurchaseStatus.CONFIRMED };
    const service = new PurchasesService(
      { transaction: jest.fn((work: () => unknown) => work()) } as never,
      { findOne: jest.fn().mockReturnValue({ exec: async () => purchase }) } as never,
      { findOne: jest.fn().mockReturnValue({ exec: async () => ({ initialQuantity: 5, remainingQuantity: 2 }) }) } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    await expect(service.updateItem('purchase-id', 1,
      { quantity: 2, unitCostCents: 150, expectedQuantity: 5, expectedUnitCostCents: 100 },
      { id: 'owner', name: 'Dueño' },
    )).rejects.toThrow('por debajo de las 3 unidades');
  });
});
