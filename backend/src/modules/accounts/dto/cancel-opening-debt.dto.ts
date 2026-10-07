import { IsOptional, IsString, MaxLength } from 'class-validator';
export class CancelOpeningDebtDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
