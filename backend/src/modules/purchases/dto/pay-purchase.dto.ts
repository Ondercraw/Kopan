import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PurchasePaymentMethod } from '../enums/purchase.enum';

export class PayPurchaseDto {
  @IsIn([PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER])
  paymentMethod: PurchasePaymentMethod.CASH | PurchasePaymentMethod.TRANSFER;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
