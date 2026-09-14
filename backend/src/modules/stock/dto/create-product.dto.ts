import {
  IsArray,
  ArrayMaxSize,
  IsInt,
  IsMongoId,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { VatRate } from '../enums/vat-rate.enum';

export class CreateProductDto {
  @IsString()
  @MinLength(2, { message: 'El nombre debe tener al menos 2 caracteres' })
  @MaxLength(120)
  nombre: string;

  @IsString()
  @MinLength(2, { message: 'El rubro debe tener al menos 2 caracteres' })
  @MaxLength(80)
  tipo: string;

  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(0, { message: 'La cantidad no puede ser negativa' })
  cantidadStock: number;

  @IsEnum(VatRate, { message: 'La alícuota de IVA debe ser 21%, 10,5% o 0%' })
  alicuotaIva: VatRate;

  @IsOptional()
  @IsInt({ message: 'El costo debe expresarse en centavos enteros' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  costoCentavos?: number;

  @IsInt({ message: 'El stock mínimo debe ser un número entero' })
  @Min(0, { message: 'El stock mínimo no puede ser negativo' })
  stockMinimo: number;

  @IsOptional()
  @IsMongoId({ message: 'El proveedor seleccionado no es válido' })
  proveedorId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true, message: 'Seleccioná proveedores existentes' })
  proveedorIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descripcionAdicional?: string;
}
