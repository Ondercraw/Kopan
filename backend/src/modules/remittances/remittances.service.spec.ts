import { Types } from 'mongoose';
import { RemittancesService } from './remittances.service';

describe('RemittancesService', () => {
  it('registra un remito independiente sin modificar existencias ni dinero', async () => {
    const clientId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const clientQuery = { lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue({
      _id: clientId, codigo: 35, nombre: 'Cliente de prueba', direccion: '', localidad: '',
    }) };
    const productsQuery = { lean: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([
      { _id: productId, nombre: 'Harina 10 kg' },
    ]) };
    const counterQuery = { exec: jest.fn().mockResolvedValue({ value: 4 }) };
    const remittances = { create: jest.fn().mockImplementation(async (data) => data) };
    const clients = { findOne: jest.fn().mockReturnValue(clientQuery) };
    const products = { find: jest.fn().mockReturnValue(productsQuery) };
    const counters = { findOneAndUpdate: jest.fn().mockReturnValue(counterQuery) };
    const connection = { transaction: jest.fn().mockImplementation(async (callback) => callback()) };
    const service = new RemittancesService(
      connection as never, remittances as never, clients as never, products as never, counters as never,
    );

    const result = await service.create({
      clienteId: clientId.toString(),
      transporteDescargaCentavos: 0,
      items: [{ productoId: productId.toString(), cantidad: 2,
        precioFinalUnitarioCentavos: 10000, bonificacionPuntosBase: 1000 }],
    }, { id: 'owner', name: 'Dueño' });

    expect(result.codigo).toBe(4);
    expect(result.totalCentavos).toBe(18000);
    expect(products.find).toHaveBeenCalledWith({
      _id: { $in: [productId.toString()] }, activo: true,
    });
    expect(remittances.create).toHaveBeenCalledTimes(1);
  });

  it('permite repetir el mismo producto en distintos renglones', async () => {
    const clientId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const remittances = { create: jest.fn().mockImplementation(async (data) => data) };
    const clients = { findOne: () => ({ lean: () => ({ exec: () => Promise.resolve({
      _id: clientId, codigo: 1, nombre: 'Cliente', direccion: '', localidad: '',
    }) }) }) };
    const products = { find: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve([
      { _id: productId, nombre: 'Aceitunas' },
    ]) }) }) };
    const counters = { findOneAndUpdate: () => ({ exec: () => Promise.resolve({ value: 5 }) }) };
    const service = new RemittancesService(
      { transaction: (work: () => unknown) => work() } as never,
      remittances as never, clients as never, products as never, counters as never,
    );
    const result = await service.create({ clienteId: clientId.toString(), transporteDescargaCentavos: 0,
      items: [
        { productoId: productId.toString(), cantidad: 4, precioFinalUnitarioCentavos: 0, bonificacionPuntosBase: 0 },
        { productoId: productId.toString(), cantidad: 4, precioFinalUnitarioCentavos: 0, bonificacionPuntosBase: 0 },
      ],
    }, { id: 'owner', name: 'Dueño' });
    expect(products.find).toHaveBeenCalledWith({ _id: { $in: [productId.toString()] }, activo: true });
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item: { cantidad: number }) => item.cantidad)).toEqual([4, 4]);
  });
});
