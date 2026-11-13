import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

class DerivedPriceItemDto {
  @IsMongoId() productId: string;
  @IsInt() @Min(0) @Max(100_000_000_000) precioFinalCentavos: number;
}

export class CreateDerivedPriceListDto {
  @IsString() @MinLength(2) @MaxLength(100) nombre: string;
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string;
  @IsArray() @ArrayNotEmpty() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => DerivedPriceItemDto)
  items: DerivedPriceItemDto[];
}
