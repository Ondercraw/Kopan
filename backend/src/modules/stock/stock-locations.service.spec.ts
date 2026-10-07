import { Types } from 'mongoose';
import { StockLocationsService } from './stock-locations.service';

describe('StockLocationsService', () => {
  const id = new Types.ObjectId();
  it('muestra las existencias anteriores pendientes sin escribir en la base', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: id, codigo: 1, nombre: 'Harina', tipo: 'HARINAS',
      cantidadStock: 500, stockUbicacionesSincronizado: null }]);
    const model = { find: jest.fn().mockReturnValue({ select: () => ({ sort: () => ({ lean: () => ({ exec }) }) }) }),
      findOneAndUpdate: jest.fn() };
    const service = new StockLocationsService(model as never);
    await expect(service.list()).resolves.toMatchObject([{ total: 500, pendiente: 500,
      mostrador: 0, deposito: 0, galpon: 0 }]);
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('descuenta primero mostrador, luego depósito y galpón cuando baja el total', async () => {
    const exec = jest.fn().mockResolvedValue([{ _id: id, codigo: 1, nombre: 'Harina', tipo: 'HARINAS',
      cantidadStock: 7, stockMostrador: 4, stockDeposito: 4, stockGalpon: 2,
      stockUbicacionesSincronizado: 12 }]);
    const model = { find: jest.fn().mockReturnValue({ select: () => ({ sort: () => ({ lean: () => ({ exec }) }) }) }) };
    const service = new StockLocationsService(model as never);
    await expect(service.list()).resolves.toMatchObject([{ total: 7, pendiente: 2,
      mostrador: 0, deposito: 3, galpon: 2 }]);
  });
});
