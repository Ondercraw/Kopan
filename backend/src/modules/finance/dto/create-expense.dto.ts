import { IsDateString, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsString() @MaxLength(160) concepto: string;
  @IsInt() @Min(1) montoCentavos: number;
  @IsOptional() @IsString() @MaxLength(500) detalle?: string;
  @IsOptional() @IsMongoId() proveedorId?: string;
  @IsOptional() @IsDateString() fecha?: string;
}
