import { Types } from 'mongoose';
import { InventoryLotsService } from './inventory-lots.service';

describe('InventoryLotsService', () => {
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
