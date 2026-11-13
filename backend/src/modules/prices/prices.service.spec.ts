import { Types } from 'mongoose';
import { PricesService } from './prices.service';

describe('PricesService.createDerived', () => {
  it('crea todos los productos en una transacción, incluso los que no tienen precio base', async () => {
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();
    const listId = new Types.ObjectId();
    const transaction = jest.fn((work: () => Promise<unknown>) => work());
    const listModel = { create: jest.fn().mockResolvedValue({ _id: listId }) };
    const itemModel = { insertMany: jest.fn().mockResolvedValue([]) };
    const historyModel = { insertMany: jest.fn().mockResolvedValue([]) };
    const productModel = { find: jest.fn().mockReturnValue({ select: () => ({ lean: () => ({
      exec: async () => [{ _id: first, alicuotaIva: 21 }, { _id: second, alicuotaIva: 10.5 }],
    }) }) }) };
    const counterModel = { findOneAndUpdate: jest.fn().mockReturnValue({ exec: async () => ({ value: 3 }) }) };
    const service = new PricesService(
      { transaction } as never, listModel as never, itemModel as never, productModel as never,
      counterModel as never, historyModel as never, {} as never, {} as never, {} as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({ codigo: 3, items: [{}, {}] } as never);

    await service.createDerived({ nombre: ' Mayorista ', items: [
      { productId: first.toString(), precioFinalCentavos: 9_000 },
      { productId: second.toString(), precioFinalCentavos: 0 },
    ] }, { id: 'owner', name: 'Dueño' });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(itemModel.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ productoId: first, precioFinalCentavos: 9_000 }),
      expect.objectContaining({ productoId: second, precioFinalCentavos: 0 }),
    ]);
    expect(historyModel.insertMany).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ productoId: first, precioFinalCentavos: 9_000 }),
      expect.objectContaining({ productoId: second, precioFinalCentavos: 0 }),
    ]));
    expect(listModel.create).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Mayorista' }));
  });
});
