import { IsInt, Min } from 'class-validator';

export class SetPriceDto {
  @IsInt({ message: 'El precio debe expresarse en centavos enteros' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precioCentavos: number;
}
