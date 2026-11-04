import { Types } from 'mongoose';
import { SaleItem } from '../sales/schemas/sale.schema';
import { SellerCommissionRule } from '../employees/schemas/employee.schema';
import { calculateSellerCommissions } from './commission-calculator';

describe('calculateSellerCommissions', () => {
  it('aplica producto antes que rubro y calcula el porcentaje sobre el total con descuento', () => {
    const flour = new Types.ObjectId();
    const sugar = new Types.ObjectId();
    const items = [
      { productoId: flour, totalCentavos: 9000 },
      { productoId: sugar, totalCentavos: 5000 },
    ] as SaleItem[];
    const rules = [
      { _id: new Types.ObjectId(), scope: 'RUBRO', rubro: 'HARINAS', mode: 'PORCENTAJE', value: 1000 },
      { _id: new Types.ObjectId(), scope: 'PRODUCTO', productoId: flour, mode: 'PORCENTAJE', value: 500 },
    ] as SellerCommissionRule[];
    expect(calculateSellerCommissions(items, rules, new Map([[flour.toString(), 'Harinas'], [sugar.toString(), 'AZUCARES']]))).toBe(450);
    expect(items[0].comisionVendedorCentavos).toBe(450);
    expect(items[1].comisionVendedorCentavos).toBeUndefined();
  });

  it('paga el monto fijo una sola vez aunque el producto esté en varias líneas', () => {
    const product = new Types.ObjectId();
    const ruleId = new Types.ObjectId();
    const items = [{ productoId: product, totalCentavos: 2000 },
      { productoId: product, totalCentavos: 3000 }] as SaleItem[];
    const rules = [{ _id: ruleId, scope: 'PRODUCTO', productoId: product,
      mode: 'MONTO_FIJO', value: 700 }] as SellerCommissionRule[];
    expect(calculateSellerCommissions(items, rules, new Map([[product.toString(), 'HARINAS']]))).toBe(700);
    expect(items.map((item) => item.comisionVendedorCentavos)).toEqual([700, 0]);
  });
});
