import {
  IsInt,
  IsMongoId,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { WeightUnit } from '../enums/weight-unit.enum';
import { VatRate } from '../enums/vat-rate.enum';

export class CreateProductDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(120)
  nombre: string;

  @IsString()
  @MinLength(2, { message: 'El tipo debe tener al menos 2 caracteres' })
  @MaxLength(80)
  tipo: string;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  cantidadStock: number;

  @IsNumber(
    { maxDecimalPlaces: 3 },
    { message: 'El peso debe ser un número con hasta 3 decimales' },
  )
  @Min(0.001, { message: 'El peso debe ser mayor a cero' })
  peso: number;

  @IsEnum(WeightUnit, { message: 'La unidad debe ser kg o g' })
  unidadPeso: WeightUnit;

  @IsEnum(VatRate, { message: 'La alícuota de IVA debe ser 21%, 10,5% o 0%' })
  alicuotaIva: VatRate;

  @IsInt({ message: 'El costo debe expresarse en centavos enteros' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  costoCentavos: number;

  @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  stockMinimo: number;

  @IsOptional()
  @IsMongoId({ message: 'El proveedor seleccionado no es válido' })
  proveedorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionAdicional?: string;
}
