import { Types } from 'mongoose';
import { SalesService } from './sales.service';
import { PaymentMethod } from './enums/payment-method.enum';
import { SaleStatus } from './enums/sale-status.enum';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';

describe('SalesService.cancel', () => {
  it('permite anular una venta a crédito parcialmente cobrada y descuenta sólo la deuda pendiente', async () => {
    const productId = new Types.ObjectId();
    const sale = {
      _id: new Types.ObjectId(), codigo: 1, estado: SaleStatus.CONFIRMED,
      medioPago: PaymentMethod.CREDIT, chequeId: null, clienteId: new Types.ObjectId(),
      totalCentavos: 30000, montoCobradoCuentaCorrienteCentavos: 10000,
      montoCobradoEfectivoCentavos: 10000, montoCobradoTransferenciaCentavos: 0,
      items: [{ productoId: productId, productoNombre: 'Harina', cantidad: 1, lotesConsumidos: [] }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const product = { _id: productId, codigo: 1, nombre: 'Harina', cantidadStock: 1,
      costoCentavos: 1000, save: jest.fn().mockResolvedValue(undefined) };
    const clients = { findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }) };
    const finance = { cancelSaleRecord: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesService(
      { transaction: (work: () => unknown) => work() } as never,
      { findOne: () => ({ exec: () => Promise.resolve(sale) }) } as never,
      clients as never, {} as never,
      { findOneAndUpdate: () => ({ exec: () => Promise.resolve(product) }) } as never,
      {} as never, {} as never,
      { create: jest.fn().mockResolvedValue({}) } as never,
      {} as never, {} as never, finance as never,
      { restoreConsumptions: jest.fn(), summary: () => Promise.resolve({ quantity: 1, value: 1000 }) } as never,
    );
    await service.cancel(sale._id.toString(), 'Error de carga', { id: 'owner', name: 'Dueño', roles: [] });
    expect(clients.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: sale.clienteId, saldoCuentaCorrienteCentavos: { $gte: 20000 } },
      { $inc: { saldoCuentaCorrienteCentavos: -20000 } }, { new: true },
    );
    expect(finance.cancelSaleRecord).toHaveBeenCalled();
  });
  it('anula una venta sin cobros, devuelve el stock y cancela su ingreso', async () => {
    const productId = new Types.ObjectId();
    const sale = {
      _id: new Types.ObjectId(), codigo: 9, estado: SaleStatus.CONFIRMED,
      medioPago: PaymentMethod.CASH, chequeId: null,
      montoCobradoCuentaCorrienteCentavos: 0, montoCobradoEfectivoCentavos: 0,
      montoCobradoTransferenciaCentavos: 0,
      items: [{ productoId: productId, productoNombre: 'Harina', cantidad: 2, lotesConsumidos: [] }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const product = {
      _id: productId, codigo: 1, nombre: 'Harina', cantidadStock: 5,
      costoCentavos: 1000, save: jest.fn().mockResolvedValue(undefined),
    };
    const sales = { findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sale) }) };
    const products = { findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(product) }) };
    const movements = { create: jest.fn().mockResolvedValue({}) };
    const finance = { cancelSaleRecord: jest.fn().mockResolvedValue(undefined) };
    const lots = {
      restoreConsumptions: jest.fn().mockResolvedValue(undefined),
      summary: jest.fn().mockResolvedValue({ quantity: 5, value: 5000 }),
    };
    const connection = { transaction: jest.fn((work: () => unknown) => work()) };
    const service = new SalesService(
      connection as never, sales as never, {} as never, {} as never,
      products as never, {} as never, {} as never, movements as never,
      {} as never, {} as never, finance as never, lots as never,
    );
    await service.cancel(sale._id.toString(), 'Carga duplicada', {
      id: 'owner', name: 'Dueño', roles: [],
    });
    expect(sale.estado).toBe(SaleStatus.CANCELLED);
    expect(sale.save).toHaveBeenCalled();
    expect(products.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: productId }, { $inc: { cantidadStock: 2 } }, { new: true },
    );
    expect(movements.create).toHaveBeenCalledWith(expect.objectContaining({
      type: StockMovementType.SALE_CANCELLATION,
      reason: 'Anulación de venta #9: Carga duplicada',
    }));
    expect(finance.cancelSaleRecord).toHaveBeenCalledWith(sale, 'Carga duplicada', expect.any(Object));
  });
});
