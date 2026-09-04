import { IsIn } from 'class-validator';
import { FinancialPaymentMethod } from '../enums/financial-movement.enum';

export class PayExpenseDto {
  @IsIn([FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER])
  medioPago: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
}
