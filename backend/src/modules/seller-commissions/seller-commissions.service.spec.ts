import { Types } from 'mongoose';
import { FinancialMovementCategory, FinancialMovementKind, FinancialPaymentMethod } from '../finance/enums/financial-movement.enum';
import { SellerCommissionsService } from './seller-commissions.service';

describe('SellerCommissionsService', () => {
  it('registra el pago manual una sola vez y crea un egreso real', async () => {
    const saleId = new Types.ObjectId();
    const sellerId = new Types.ObjectId();
    const sale = { _id: saleId, codigo: 5, vendedorId: sellerId,
      clienteId: new Types.ObjectId(), clienteNombre: 'Cliente', comisionTotalCentavos: 4500,
      comisionPagadaAt: null as Date | null, save: jest.fn().mockResolvedValue(undefined) };
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = jest.fn(async (callback: () => Promise<unknown>) => callback());
    const service = new SellerCommissionsService({ transaction } as never,
      { findById: () => ({ select: () => ({ lean: () => ({ exec: async () => ({ nombre: 'Vendedor' }) }) }) }) } as never,
      {} as never, { findOne: () => ({ exec: async () => sale }) } as never,
      { create } as never);
    const result = await service.pay(saleId.toString(), FinancialPaymentMethod.CASH,
      { id: 'owner', name: 'Dueño' });
    expect(result.amountCents).toBe(4500);
    expect(sale.comisionPagadaAt).toBeInstanceOf(Date);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sourceKey: `seller-commission:sale:${saleId.toString()}`,
      tipo: FinancialMovementKind.EXPENSE, categoria: FinancialMovementCategory.SELLER_COMMISSION,
      pagado: true, montoCentavos: 4500, medioPago: FinancialPaymentMethod.CASH,
    }));
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
