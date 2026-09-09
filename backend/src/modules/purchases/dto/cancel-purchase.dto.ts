import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelPurchaseDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
