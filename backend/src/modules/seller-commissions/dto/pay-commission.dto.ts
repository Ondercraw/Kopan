import { IsIn } from 'class-validator';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export class PayCommissionDto {
  @IsIn([FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER])
  paymentMethod: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
}
