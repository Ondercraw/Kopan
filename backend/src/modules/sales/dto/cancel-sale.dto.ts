import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelSaleDto {
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
}
