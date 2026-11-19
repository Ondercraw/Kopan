import { Types } from 'mongoose';
import { AccountsService } from './accounts.service';
import { PaymentMethod } from '../sales/enums/payment-method.enum';

describe('AccountsService.statement', () => {
  it('corrige importe, medio y fecha de un cobro manteniendo su versión anterior', async () => {
    const saleId = new Types.ObjectId(); const clientId = new Types.ObjectId(); const paymentId = new Types.ObjectId();
    const payment = { _id: paymentId, tipoCuenta: 'CLIENTE', comprobanteTipo: 'VENTA', comprobanteId: saleId,
      entidadId: clientId, montoCentavos: 3000, medioPago: 'EFECTIVO', fecha: new Date('2026-11-01T15:00:00Z'),
      origenChequeId: null, historialCorrecciones: [], save: jest.fn().mockResolvedValue(undefined) };
    const sale = { _id: saleId, totalCentavos: 10000, montoCobradoCuentaCorrienteCentavos: 3000,
      montoCobradoEfectivoCentavos: 3000, montoCobradoTransferenciaCentavos: 0,
      montoChequePendienteCentavos: 0, save: jest.fn().mockResolvedValue(undefined) };
    const movement = { save: jest.fn().mockResolvedValue(undefined) };
    const financeUpdate = jest.fn().mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) });
    const service = new AccountsService(
      { transaction: (work: () => unknown) => work() } as never,
      { findOne: () => ({ exec: () => Promise.resolve(sale) }) } as never,
      {} as never, {} as never,
      { updateOne: () => ({ exec: () => Promise.resolve({ modifiedCount: 1 }) }) } as never,
      { findOne: () => ({ exec: () => Promise.resolve(payment) }) } as never,
      {} as never, {} as never,
      { updateOne: financeUpdate, findOne: () => ({ exec: () => Promise.resolve(movement) }) } as never,
      {} as never,
    );
    await service.reviseClientPayment(paymentId.toString(), { amountCents: 4000, paymentMethod: 'TRANSFERENCIA' as never, accountingDate: '2026-11-02', reason: 'Medio incorrecto' }, { id: 'owner', name: 'Dueño' });
    expect(sale.montoCobradoCuentaCorrienteCentavos).toBe(4000);
    expect(sale.montoCobradoEfectivoCentavos).toBe(0);
    expect(sale.montoCobradoTransferenciaCentavos).toBe(4000);
    expect(financeUpdate.mock.calls[0][1].$inc).toMatchObject({ montoPagadoCentavos: 1000, montoPagadoEfectivoCentavos: -3000, montoPagadoTransferenciaCentavos: 4000 });
    expect(payment.historialCorrecciones).toHaveLength(1);
    expect(payment).toMatchObject({ montoCentavos: 4000, medioPago: 'TRANSFERENCIA', corregidoPorNombre: 'Dueño' });
    expect(movement).toMatchObject({ montoCentavos: 4000, medioPago: 'TRANSFERENCIA' });
  });
  it('anula un cobro de cliente y revierte saldo e ingreso sin borrar el historial', async () => {
    const saleId = new Types.ObjectId(); const clientId = new Types.ObjectId(); const paymentId = new Types.ObjectId();
    const payment = { _id: paymentId, tipoCuenta: 'CLIENTE', comprobanteTipo: 'VENTA', comprobanteId: saleId,
      entidadId: clientId, montoCentavos: 3000, medioPago: 'EFECTIVO', fecha: new Date(), origenChequeId: null,
      historialCorrecciones: [], cancelado: false, motivoCancelacion: '', save: jest.fn().mockResolvedValue(undefined) };
    const sale = { _id: saleId, estado: 'CONFIRMADA', totalCentavos: 10000, montoCobradoCuentaCorrienteCentavos: 3000,
      montoCobradoEfectivoCentavos: 3000, montoCobradoTransferenciaCentavos: 0, montoChequePendienteCentavos: 0,
      cuentaCorrientePagada: false, save: jest.fn().mockResolvedValue(undefined) };
    const movement = { cancelado: false, disponible: true, motivoCancelacion: '', save: jest.fn().mockResolvedValue(undefined) };
    const clientUpdate = jest.fn().mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) });
    const financeUpdate = jest.fn().mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) });
    const service = new AccountsService(
      { transaction: (work: () => unknown) => work() } as never,
      { findOne: () => ({ exec: () => Promise.resolve(sale) }) } as never,
      {} as never, {} as never,
      { updateOne: clientUpdate } as never,
      { findOne: () => ({ exec: () => Promise.resolve(payment) }) } as never,
      {} as never, {} as never,
      { updateOne: financeUpdate, findOne: () => ({ exec: () => Promise.resolve(movement) }) } as never,
      {} as never,
    );
    await service.cancelClientPayment(paymentId.toString(), 'Cobro duplicado', { id: 'owner', name: 'Dueño' });
    expect(sale.montoCobradoCuentaCorrienteCentavos).toBe(0);
    expect(sale.montoCobradoEfectivoCentavos).toBe(0);
    expect(clientUpdate).toHaveBeenCalledWith({ _id: clientId }, { $inc: { saldoCuentaCorrienteCentavos: 3000 } });
    expect(financeUpdate.mock.calls[0][1].$inc.montoPagadoCentavos).toBe(-3000);
    expect(payment).toMatchObject({ cancelado: true, motivoCancelacion: 'Cobro duplicado' });
    expect(payment.historialCorrecciones).toHaveLength(1);
    expect(movement).toMatchObject({ cancelado: true, disponible: false });
  });
  it('muestra la fecha corregida del comprobante sin alterar la fecha real de un cobro posterior', async () => {
    const clientId = new Types.ObjectId();
    const saleId = new Types.ObjectId();
    const saleDate = new Date('2026-10-02T12:00:00Z');
    const paymentDate = new Date('2026-10-07T15:00:00Z');
    const query = (value: unknown) => ({ sort: () => ({ lean: () => ({ exec: async () => value }) }) });
    const entities = (value: unknown) => ({ select: () => ({ lean: () => ({ exec: async () => value }) }) });
    const service = new AccountsService({} as never,
      { find: () => query([{ _id: saleId, codigo: 7, clienteId: clientId, clienteNombre: 'Cliente',
        medioPago: PaymentMethod.CREDIT, totalCentavos: 11500, transporteDescargaCentavos: 1500,
        montoCobradoCuentaCorrienteCentavos: 4000, fechaFacturacion: saleDate,
        createdAt: new Date('2026-10-07T12:00:00Z'),
        items: [{ productoNombre: 'Harina', cantidad: 2, totalCentavos: 10000 }] }]) } as never,
      { find: () => query([{ _id: new Types.ObjectId(), codigo: 3, clienteId: clientId,
        clienteNombre: 'Cliente', createdAt: saleDate,
        items: [{ productoNombre: 'Harina', cantidad: 4 }] }]) } as never,
      { find: () => query([]) } as never,
      { find: () => entities([{ _id: clientId, nombre: 'Cliente' }]) } as never,
      { find: () => query([{ _id: new Types.ObjectId(), comprobanteId: saleId,
        montoCentavos: 4000, medioPago: 'EFECTIVO', fecha: paymentDate, actorName: 'Dueño' }]) } as never,
      { find: () => query([]) } as never,
      { find: () => entities([]) } as never,
      {} as never, {} as never);
    const result = await service.statement();
    expect(result.clients[0].documentos[0].fecha).toEqual(saleDate);
    expect(result.clients[0].documentos[0].pagos[0].fecha).toEqual(paymentDate);
    expect(result.clients[0].documentos[0].items).toEqual([{
      producto: 'Harina', cantidad: 2, precioUnitarioCentavos: 5000,
      precioTotalCentavos: 10000,
    }, {
      producto: 'TRANSPORTE Y DESCARGA', cantidad: 1,
      precioUnitarioCentavos: 1500, precioTotalCentavos: 1500,
    }]);
    expect(result.clients[0].documentos[1]).toMatchObject({ tipo: 'REMITO', codigo: 3,
      totalCentavos: 0, saldoCentavos: 0, detalle: 'Harina x4' });
  });
});
