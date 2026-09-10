import { Types } from 'mongoose';
import { InventoryLotsService } from './inventory-lots.service';

describe('InventoryLotsService', () => {
  it('reemplaza el índice antiguo que bloqueaba múltiples ajustes manuales', async () => {
    const createIndex = jest
      .fn()
      .mockResolvedValue('purchase_lot_unique_partial');
    const indexes = jest.fn().mockResolvedValue([
      {
        name: 'purchaseId_1_lineNumber_1',
        key: { purchaseId: 1, lineNumber: 1 },
        unique: true,
      },
    ]);
    const dropIndex = jest.fn().mockResolvedValue(undefined);
    const service = new InventoryLotsService({
      collection: { createIndex, indexes, dropIndex },
    } as never);

    await service.onModuleInit();

    expect(createIndex).toHaveBeenCalledWith(
      { purchaseId: 1, lineNumber: 1 },
      expect.objectContaining({
        name: 'purchase_lot_unique_partial',
        unique: true,
        partialFilterExpression: { purchaseId: { $type: 'objectId' } },
      }),
    );
    expect(dropIndex).toHaveBeenCalledWith('purchaseId_1_lineNumber_1');
  });

  it('vincula una resta manual con el último lote de ajuste antes de tocar otras existencias', async () => {
    const productId = new Types.ObjectId();
    const linkedLot = {
      productId,
      remainingQuantity: 1,
      unitCostCents: 10_000,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const find = jest
      .fn()
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([linkedLot]),
        }),
      })
      .mockReturnValueOnce({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
    const service = new InventoryLotsService({ find } as never);

    await expect(service.adjust(productId, -1, 1_201, 10_000)).resolves.toBe(
      10_000,
    );

    expect(linkedLot.remainingQuantity).toBe(0);
    expect(linkedLot.save).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ productId, kind: 'AJUSTE' }),
    );
  });
});
