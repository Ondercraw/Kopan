import { IsIn, IsInt, IsMongoId, IsNotEmpty, ValidateIf } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @IsIn([-1, 1], { message: 'El ajuste debe sumar o restar una unidad' })
  delta: -1 | 1;

  @ValidateIf((dto: AdjustStockDto) => dto.delta < 0)
  @ValidateIf((_dto: AdjustStockDto, value: unknown) => value !== 'UNVALUED')
  @IsMongoId({ message: 'Seleccioná un lote válido para realizar la resta' })
  @IsNotEmpty({ message: 'El lote es obligatorio al restar unidades' })
  loteId?: string;
}
