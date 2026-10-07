import { IsArray, IsMongoId } from 'class-validator';
export class SetListProductsDto {
  @IsArray()
  @IsMongoId({ each: true })
  productIds: string[];
}
