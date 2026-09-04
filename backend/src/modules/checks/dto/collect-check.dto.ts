import { IsIn } from 'class-validator';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export class CollectCheckDto {
  @IsIn([FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER], {
    message: 'El destino del cobro debe ser efectivo o transferencia',
  })
  destinoCobro: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
}
