import {
  IsEnum,
  IsArray,
  ArrayMaxSize,
  IsInt,
  IsNotEmpty,
  IsMongoId,
  IsNumber,
  IsNotIn,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { WeightUnit } from '../enums/weight-unit.enum';
import { StockAdjustmentReason } from '../enums/stock-adjustment-reason.enum';
import { VatRate } from '../enums/vat-rate.enum';

export class UpdateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  tipo: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  peso: number;

  @IsEnum(WeightUnit)
  unidadPeso: WeightUnit;

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

  // Valor positivo para sumar y negativo para restar. Se omite cuando no cambia el stock.
  @IsOptional()
  @IsInt({ message: 'El ajuste de stock debe ser un número entero' })
  @IsNotIn([0], { message: 'El ajuste de stock no puede ser cero' })
  @Min(-100000)
  @Max(100000)
  ajusteStock?: number;

  @ValidateIf(
    (dto: UpdateProductDto) =>
      dto.ajusteStock !== undefined && dto.ajusteStock !== 0,
  )
  @IsEnum(StockAdjustmentReason, {
    message: 'Seleccioná un motivo válido para el ajuste',
  })
  @IsNotEmpty({ message: 'El motivo del ajuste es obligatorio' })
  motivoAjuste?: StockAdjustmentReason;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  observacionAjuste?: string;
}
