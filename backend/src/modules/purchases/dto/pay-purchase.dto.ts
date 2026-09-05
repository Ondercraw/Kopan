import { IsIn } from 'class-validator';
import { PurchasePaymentMethod } from '../enums/purchase.enum';

export class PayPurchaseDto {
  @IsIn([PurchasePaymentMethod.CASH, PurchasePaymentMethod.TRANSFER])
  paymentMethod: PurchasePaymentMethod.CASH | PurchasePaymentMethod.TRANSFER;
}
