import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

class RemittanceItemDto {
  @IsMongoId() productoId: string;
  @IsInt() @Min(1) cantidad: number;
  @IsInt() @Min(0) precioFinalUnitarioCentavos: number;
  @IsInt() @Min(0) @Max(10000) bonificacionPuntosBase: number;
}

export class CreateRemittanceDto {
  @IsMongoId() clienteId: string;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @IsInt() @Min(0) transporteDescargaCentavos: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => RemittanceItemDto)
  items: RemittanceItemDto[];
}
