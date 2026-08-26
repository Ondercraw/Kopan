import { IsIn, IsInt } from 'class-validator';

export class AdjustStockDto {
  @IsInt()
  @IsIn([-1, 1], { message: 'El ajuste debe sumar o restar una unidad' })
  delta: -1 | 1;
}
