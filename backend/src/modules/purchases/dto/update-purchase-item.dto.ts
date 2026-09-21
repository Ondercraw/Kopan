import { IsInt, Max, Min } from 'class-validator';

export class UpdatePurchaseItemDto {
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1, { message: 'La cantidad debe ser mayor a cero' })
  @Max(1_000_000, { message: 'La cantidad supera el máximo permitido' })
  quantity: number;

  @IsInt({ message: 'El costo debe expresarse en centavos' })
  @Min(0, { message: 'El costo no puede ser negativo' })
  unitCostCents: number;
}
