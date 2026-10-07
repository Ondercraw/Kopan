import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class AddOpeningDebtDto {
  @IsInt() @Min(1) amountCents: number;
  @IsOptional() @IsString() @MaxLength(300) detail?: string;
}
