import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDefined, IsEnum, IsInt, IsMongoId, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';
import { SaveCheckDto } from '../../checks/dto/save-check.dto';

export class CreateSaleItemDto {
  @IsMongoId() productoId: string;
  @IsInt() @Min(1) cantidad: number;
  @IsOptional() @IsInt() @Min(0) precioUnitarioCentavos?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) bonificacionPuntosBase?: number;
}

export class CreateSaleDto {
  @IsMongoId() clienteId: string;
  @IsOptional() @IsMongoId() vendedorId?: string;
  @IsMongoId() listaPreciosId: string;
  @IsEnum(PaymentMethod) medioPago: PaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) referenciaTransferencia?: string;
  @IsOptional() @IsString() @MaxLength(500) observaciones?: string;
  @ValidateIf((dto: CreateSaleDto) => dto.medioPago === PaymentMethod.CHECK)
  @IsDefined()
  @ValidateNested()
  @Type(() => SaveCheckDto)
  cheque?: SaveCheckDto;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateSaleItemDto)
  items: CreateSaleItemDto[];
}
