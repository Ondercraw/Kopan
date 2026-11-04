export interface CommissionRule {
  _id: string;
  scope: 'RUBRO' | 'PRODUCTO';
  rubro?: string;
  productoId?: string;
  mode: 'PORCENTAJE' | 'MONTO_FIJO';
  value: number;
}
export interface CommissionSale {
  id: string; code: number; date: string; clientName: string; amountCents: number;
  commissionCents: number; paidAt: string | null; cancelled: boolean;
  items: Array<{ name: string; quantity: number; commissionCents: number }>;
}
export interface CommissionOverview {
  seller: { id: string; name: string };
  rules: CommissionRule[];
  sales: CommissionSale[];
}
