import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PurchaseKind, PurchasePaymentMethod } from '../enums/purchase.enum';

export class PurchaseItemDto {
  @IsMongoId({ message: 'Seleccioná un producto válido' }) productId: string;
  @IsInt({ message: 'La cantidad debe ser un número entero' })
  @Min(1)
  @Max(1_000_000)
  quantity: number;
  @IsInt({ message: 'El costo debe expresarse en centavos' })
  @Min(0)
  unitCostCents: number;
}

export class CreatePurchaseDto {
  @IsMongoId({ message: 'Seleccioná un proveedor válido' }) supplierId: string;
  @IsEnum(PurchaseKind) kind: PurchaseKind;
  @IsEnum(PurchasePaymentMethod) paymentMethod: PurchasePaymentMethod;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
  @IsOptional() @IsDateString() purchaseDate?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(80) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
