import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class SetPriceDto {
  @ValidateIf((dto: SetPriceDto) => dto.precioCentavos === undefined)
  @IsInt({ message: 'El precio final debe expresarse en centavos enteros' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precioFinalCentavos?: number;

  // Compatibilidad durante la actualización con pestañas que todavía tengan
  // cargado el frontend anterior. Los clientes nuevos ya no envían este campo.
  @IsOptional()
  @IsInt({ message: 'El precio debe expresarse en centavos enteros' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  precioCentavos?: number;
}
