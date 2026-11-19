import { Types } from 'mongoose';
import { RemittancesService } from './remittances.service';

describe('RemittancesService', () => {
  it('corrige un remito y conserva sus datos anteriores sin mover stock ni caja', async () => {
    const clientId = new Types.ObjectId(); const productId = new Types.ObjectId();
    const remittance = { _id: new Types.ObjectId(), cancelado: false, clienteNombre: 'Anterior',
      items: [{ productoId: productId, productoNombre: 'Harina', cantidad: 2 }], observaciones: 'Antes',
      historialCorrecciones: [], save: jest.fn().mockResolvedValue(undefined) };
    const service = new RemittancesService(
      { transaction: (work: () => unknown) => work() } as never,
      { findById: () => ({ exec: () => Promise.resolve(remittance) }) } as never,
      { findOne: () => ({ lean: () => ({ exec: () => Promise.resolve({ _id: clientId, codigo: 3, nombre: 'Nuevo', direccion: 'Calle', localidad: 'CABA' }) }) }) } as never,
      { find: () => ({ lean: () => ({ exec: () => Promise.resolve([{ _id: productId, nombre: 'Harina' }]) }) }) } as never,
      {} as never,
    );
    await service.update(remittance._id.toString(), { clienteId: clientId.toString(), observaciones: 'Después', items: [{ productoId: productId.toString(), cantidad: 5 }] }, { id: 'owner', name: 'Dueño' });
    expect(remittance.historialCorrecciones).toHaveLength(1);
    expect(remittance).toMatchObject({ clienteNombre: 'Nuevo', totalCentavos: 0, observaciones: 'Después' });
    expect(remittance.items[0].cantidad).toBe(5);
    expect(remittance.save).toHaveBeenCalledTimes(1);
  });
  it('anula un remito conservándolo para el historial', async () => {
    const remittance = { cancelado: false, save: jest.fn().mockResolvedValue(undefined) };
    const service = new RemittancesService({ transaction: (work: () => unknown) => work() } as never,
      { findById: () => ({ exec: () => Promise.resolve(remittance) }) } as never,
      {} as never, {} as never, {} as never);
    await service.cancel(new Types.ObjectId().toString(), 'Duplicado', { id: 'owner', name: 'Dueño' });
    expect(remittance).toMatchObject({ cancelado: true, motivoCancelacion: 'Duplicado', canceladoPorNombre: 'Dueño' });
  });
  it('permite consultar un remito ya emitido para reimprimirlo', async () => {
    const id = new Types.ObjectId();
    const record = { _id: id, codigo: 8, items: [{ productoNombre: 'Harina', cantidad: 2 }] };
    const remittances = { findById: jest.fn().mockReturnValue({ lean: () => ({ exec: () => Promise.resolve(record) }) }) };
    const service = new RemittancesService({} as never, remittances as never,
      {} as never, {} as never, {} as never);
    await expect(service.findOne(id.toString())).resolves.toEqual(record);
  });
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
