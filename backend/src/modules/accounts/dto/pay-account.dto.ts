import { IsIn, IsInt, Min } from 'class-validator';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export class PayAccountDto {
  @IsInt()
  @Min(1)
  amountCents: number;

  @IsIn([FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER])
  paymentMethod: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
}
