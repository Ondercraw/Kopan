import type { SaleItem } from '../sales/schemas/sale.schema';
import type { SellerCommissionRule } from '../employees/schemas/employee.schema';

export function calculateSellerCommissions(items: SaleItem[], rules: SellerCommissionRule[], rubros: Map<string, string>): number {
  const fixedRulesApplied = new Set<string>();
  for (const item of items) {
    const productRule = rules.find((rule) => rule.scope === 'PRODUCTO' && rule.productoId?.toString() === item.productoId.toString());
    const rubro = rubros.get(item.productoId.toString())?.trim().toLocaleUpperCase('es-AR');
    const rule = productRule ?? rules.find((candidate) => candidate.scope === 'RUBRO' && candidate.rubro === rubro);
    if (!rule) continue;
    item.comisionTipo = rule.mode;
    item.comisionValor = rule.value;
    if (rule.mode === 'PORCENTAJE') item.comisionVendedorCentavos = Math.round(item.totalCentavos * rule.value / 10000);
    else {
      const key = rule._id?.toString() ?? `${rule.scope}:${rule.productoId ?? rule.rubro}`;
      item.comisionVendedorCentavos = fixedRulesApplied.has(key) ? 0 : rule.value;
      fixedRulesApplied.add(key);
    }
  }
  return items.reduce((sum, item) => sum + (item.comisionVendedorCentavos ?? 0), 0);
}
