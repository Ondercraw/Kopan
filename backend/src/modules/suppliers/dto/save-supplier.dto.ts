import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveSupplierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cuit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contacto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  telefono?: string;

  @Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  )
  @IsOptional()
  @IsEmail({}, { message: 'El email no es válido' })
  @MaxLength(254, { message: 'El email no puede superar los 254 caracteres' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  direccion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  localidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observaciones?: string;
}
