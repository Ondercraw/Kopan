import { IsBoolean, IsEmail, IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { TaxCondition } from '../enums/tax-condition.enum';

export class SaveClientDto {
  @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @IsOptional() @IsString() @MaxLength(120) nombreFantasia?: string;
  @IsOptional() @IsString() @MaxLength(20) cuit?: string;
  @IsOptional() @IsString() @MaxLength(40) telefono?: string;
  @IsOptional() @IsEmail({}, { message: 'El email no es válido' }) @MaxLength(254, { message: 'El email no puede superar los 254 caracteres' }) email?: string;
  @IsOptional() @IsString() @MaxLength(180) direccion?: string;
  @IsOptional() @IsString() @MaxLength(80) localidad?: string;
  @IsOptional() @IsString() @MaxLength(80) grupo?: string;
  @IsOptional() @IsMongoId({ message: 'El vendedor seleccionado no es válido' }) vendedorId?: string;
  @IsEnum(TaxCondition) condicionIva: TaxCondition;
  @IsOptional() @IsMongoId({ message: 'La lista de precios seleccionada no es válida' }) listaPreciosId?: string;
  @IsBoolean() permiteCuentaCorriente: boolean;
  @IsInt() @Min(0) limiteCreditoCentavos: number;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
}
