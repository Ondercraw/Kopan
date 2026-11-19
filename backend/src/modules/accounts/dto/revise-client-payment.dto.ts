import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { FinancialPaymentMethod } from '../../finance/enums/financial-movement.enum';

export class ReviseClientPaymentDto {
  @IsInt() @Min(1) amountCents: number;
  @IsIn([FinancialPaymentMethod.CASH, FinancialPaymentMethod.TRANSFER]) paymentMethod: FinancialPaymentMethod.CASH | FinancialPaymentMethod.TRANSFER;
  @IsDateString() accountingDate: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CancelClientPaymentDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
