import { ArrayMinSize, ArrayUnique, IsArray, IsMongoId } from 'class-validator';

export class ReactivateProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  productIds: string[];
}
