import { IsBoolean, IsDateString, IsInt, IsMongoId, IsOptional, IsString, Matches, MaxLength, Min, ValidateIf } from 'class-validator';

export class SaveCheckDto {
  @IsString() @MaxLength(80) banco: string;
  @IsString() @MaxLength(180) domicilioPago: string;
  @IsString() @MaxLength(120) titular: string;
  @IsString() @MaxLength(180) domicilioTitular: string;
  @IsString() @Matches(/^\d{11}$/, { message: 'El CUIT/CUIL debe tener 11 dígitos' }) libradorCuit: string;
  @IsInt() @Min(1) montoCentavos: number;
  @IsOptional() @IsDateString() fechaEmision?: string;
  @IsOptional() @IsString() @MaxLength(80) lugarEmision?: string;
  @IsString() @MaxLength(50) numero: string;
  @IsBoolean() diferido: boolean;
  @ValidateIf((dto: SaveCheckDto) => dto.diferido)
  @IsDateString()
  fechaCobro?: string;
  @IsOptional() @IsMongoId() clienteId?: string;
}
