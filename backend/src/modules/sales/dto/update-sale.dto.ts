import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';

export class UpdateSaleItemDto {
  @IsMongoId() productoId: string;
  @IsInt() @Min(1) cantidad: number;
  @IsInt() @Min(0) precioFinalUnitarioCentavos: number;
}

export class UpdateSaleDto {
  @IsEnum(PaymentMethod) medioPago: PaymentMethod;
  @IsOptional() @IsDateString() fechaFacturacion?: string;
  @IsOptional() @IsString() @MaxLength(100) referenciaTransferencia?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items: UpdateSaleItemDto[];
}
