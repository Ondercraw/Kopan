import { Types } from 'mongoose';
import { AccountsService } from './accounts.service';
import { PaymentMethod } from '../sales/enums/payment-method.enum';

describe('AccountsService.statement', () => {
  it('muestra la fecha corregida del comprobante sin alterar la fecha real de un cobro posterior', async () => {
    const clientId = new Types.ObjectId();
    const saleId = new Types.ObjectId();
    const saleDate = new Date('2026-10-02T12:00:00Z');
    const paymentDate = new Date('2026-10-07T15:00:00Z');
    const query = (value: unknown) => ({ sort: () => ({ lean: () => ({ exec: async () => value }) }) });
    const entities = (value: unknown) => ({ select: () => ({ lean: () => ({ exec: async () => value }) }) });
    const service = new AccountsService({} as never,
      { find: () => query([{ _id: saleId, codigo: 7, clienteId: clientId, clienteNombre: 'Cliente',
        medioPago: PaymentMethod.CREDIT, totalCentavos: 10000,
        montoCobradoCuentaCorrienteCentavos: 4000, fechaFacturacion: saleDate,
        createdAt: new Date('2026-10-07T12:00:00Z'),
        items: [{ productoNombre: 'Harina', cantidad: 1 }] }]) } as never,
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
  });
});
