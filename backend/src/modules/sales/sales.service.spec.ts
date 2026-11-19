import { Types } from 'mongoose';
import { SalesService } from './sales.service';
import { PaymentMethod } from './enums/payment-method.enum';
import { SaleStatus } from './enums/sale-status.enum';
import { StockMovementType } from '../stock/enums/stock-movement-type.enum';
import { UserRole } from '../../common/enums/user-role.enum';

describe('SalesService.create - listas del cliente', () => {
  it('impide usar una lista no marcada en el cliente aunque venda un Dueño', async () => {
    const clientId = new Types.ObjectId();
    const assignedId = new Types.ObjectId();
    const otherId = new Types.ObjectId();
    const client = { _id: clientId, listaPreciosId: assignedId, listasPreciosIds: [assignedId] };
    const service = new SalesService(
      { transaction: (work: () => unknown) => work() } as never,
      {} as never,
      { findOne: () => ({ exec: async () => client }) } as never,
      {} as never, {} as never,
      { findOne: () => ({ exec: async () => ({ _id: otherId, nombre: 'Oferta', activo: true }) }) } as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    );
    await expect(service.create({ clienteId: clientId.toString(), listaPreciosId: otherId.toString(),
      medioPago: PaymentMethod.CASH, items: [{ productoId: new Types.ObjectId().toString(), cantidad: 1 }] },
    { id: 'owner', name: 'Dueño', roles: [UserRole.JEFE] })).rejects.toThrow('Esta lista no está asignada al cliente');
  });
});

describe('SalesService.findForFinancialReport', () => {
  it('incluye el costo asignado a una venta histórica y muestra las unidades aún sin costo', async () => {
    const id = new Types.ObjectId();
    const sale = { _id: id, items: [{ cantidad: 5, costoPromedioUnitarioCentavos: 0,
      costoUnitarioCentavos: 0 }] };
    const find = jest.fn().mockReturnValue({ select: () => ({ sort: () => ({ lean: () => ({ exec: async () => [sale] }) }) }) });
    const allocations = new Map([[id.toString(), new Map([[0, { assigned: 3, cost: 4500 }]])]]);
    const service = new SalesService(
      {} as never, { find } as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
      { financialCosts: async () => allocations } as never,
    );
    const [result] = await service.findForFinancialReport();
    expect(result.items[0].costoPromedioTotalCentavos).toBe(4500);
    expect(result.items[0].costoPendienteCantidad).toBe(2);
    expect(result.costoPromedioCentavos).toBe(4500);
  });
  it('incluye ventas confirmadas por fecha de facturación sin filtrar por cobros ni limitar a 2000', async () => {
    const exec = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ lean: () => ({ exec }) });
    const select = jest.fn().mockReturnValue({ sort });
    const find = jest.fn().mockReturnValue({ select });
    const service = new SalesService(
      {} as never, { find } as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never,
      { financialCosts: jest.fn().mockResolvedValue(new Map()) } as never,
    );
    await service.findForFinancialReport({
      from: '2026-10-01T03:00:00.000Z', to: '2026-11-01T03:00:00.000Z',
    });
    expect(find).toHaveBeenCalledWith({
      estado: SaleStatus.CONFIRMED,
      $or: [
        { fechaFacturacion: { $gte: new Date('2026-10-01T03:00:00.000Z'), $lt: new Date('2026-11-01T03:00:00.000Z') } },
        { fechaFacturacion: null, createdAt: { $gte: new Date('2026-10-01T03:00:00.000Z'), $lt: new Date('2026-11-01T03:00:00.000Z') } },
      ],
    });
    expect(exec).toHaveBeenCalled();
  });
});

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
      { removeForCancelledSale: jest.fn() } as never,
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
      { removeForCancelledSale: jest.fn() } as never,
    );
    const result = await service.cancel(sale._id.toString(), 'Carga duplicada', {
      id: 'owner', name: 'Dueño', roles: [],
    });
    expect(result.stockRepuesto).toEqual([{
      productoId: productId.toString(), unidades: 2, stockAnterior: 3, stockActual: 5,
    }]);
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
