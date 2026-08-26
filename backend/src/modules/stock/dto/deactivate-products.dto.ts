import { ArrayMinSize, ArrayUnique, IsArray, IsMongoId } from 'class-validator';

export class DeactivateProductsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccioná al menos un producto' })
  @ArrayUnique({ message: 'No se puede repetir un producto' })
  @IsMongoId({ each: true, message: 'Uno o más productos no son válidos' })
  productIds: string[];
}
