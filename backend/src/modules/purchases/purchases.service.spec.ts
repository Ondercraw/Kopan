import { PurchasePaymentMethod, PurchaseStatus } from './enums/purchase.enum';
import { PurchasesService } from './purchases.service';

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
          montoPagadoEfectivoCentavos: 4_000,
        }),
        $set: expect.objectContaining({ pagado: false }),
      }),
    );
  });
});
