import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

class UpdateRemittanceItemDto {
  @IsMongoId() productoId: string;
  @IsInt() @Min(1) cantidad: number;
}

export class UpdateRemittanceDto {
  @IsMongoId() clienteId: string;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => UpdateRemittanceItemDto)
  items: UpdateRemittanceItemDto[];
}

export class CancelRemittanceDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}
