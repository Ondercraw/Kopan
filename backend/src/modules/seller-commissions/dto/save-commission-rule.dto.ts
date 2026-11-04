import { IsEnum, IsInt, IsMongoId, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class SaveCommissionRuleDto {
  @IsEnum(['RUBRO', 'PRODUCTO']) scope: 'RUBRO' | 'PRODUCTO';
  @ValidateIf((dto: SaveCommissionRuleDto) => dto.scope === 'RUBRO')
  @IsString() @MaxLength(100) rubro?: string;
  @ValidateIf((dto: SaveCommissionRuleDto) => dto.scope === 'PRODUCTO')
  @IsMongoId() productoId?: string;
  @IsEnum(['PORCENTAJE', 'MONTO_FIJO']) mode: 'PORCENTAJE' | 'MONTO_FIJO';
  @IsInt() @Min(1) value: number;
}
