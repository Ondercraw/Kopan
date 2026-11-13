import { Types } from 'mongoose';
import { SaleReplenishmentsService } from './sale-replenishments.service';
import { PurchaseStatus } from './enums/purchase.enum';

describe('SaleReplenishmentsService.financialCosts', () => {
  it('suma el costo manual de una venta histórica sin necesitar una compra', async () => {
    const saleId = new Types.ObjectId();
    const links = [{ saleId, saleItemIndex: 0, purchaseId: null, purchaseLineNumber: null,
      manualUnitCostCents: 1200, quantity: 2 }];
    const linkModel = { find: jest.fn().mockReturnValue({ lean: () => ({ exec: async () => links }) }) };
    const purchaseModel = { find: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => [] }) }) }) };
    const service = new SaleReplenishmentsService({} as never, {} as never, purchaseModel as never, linkModel as never, {} as never);
    const result = await service.financialCosts([{ _id: saleId,
      items: [{ cantidad: 5, costoPromedioUnitarioCentavos: 0, costoUnitarioCentavos: 0 }] }]);
    expect(result.get(saleId.toString())?.get(0)).toEqual({ assigned: 2, cost: 2400 });
  });
  it('usa el costo actual de la compra para las unidades vinculadas, sin sumar stock ni gastos', async () => {
    const saleId = new Types.ObjectId();
    const purchaseId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const links = [{ saleId, saleItemIndex: 0, purchaseId, purchaseLineNumber: 1, productId, quantity: 3 }];
    const purchase = { _id: purchaseId, items: [{ lineNumber: 1, unitCostCents: 1500 }] };
    const linkModel = { find: jest.fn().mockReturnValue({ lean: () => ({ exec: async () => links }) }) };
    const purchaseModel = { find: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => [purchase] }) }) }) };
    const service = new SaleReplenishmentsService({} as never, {} as never, purchaseModel as never, linkModel as never, {} as never);

    const result = await service.financialCosts([{ _id: saleId,
      items: [{ cantidad: 5, costoPromedioUnitarioCentavos: 0, costoUnitarioCentavos: 0 }] }]);
    expect(result.get(saleId.toString())?.get(0)).toEqual({ assigned: 3, cost: 4500 });
    expect(purchaseModel.find).toHaveBeenCalledWith({ _id: { $in: [purchaseId] }, estado: PurchaseStatus.CONFIRMED });
  });
});
