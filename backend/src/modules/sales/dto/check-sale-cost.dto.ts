import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsMongoId, Min, ValidateNested } from 'class-validator';

class SaleCostCheckItemDto {
  @IsMongoId() productId: string;
  @IsInt() @Min(1) quantity: number;
}

export class CheckSaleCostDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => SaleCostCheckItemDto)
  items: SaleCostCheckItemDto[];
}
