import { IsInt, IsMongoId, Min } from 'class-validator';

export class AssignReplenishmentDto {
  @IsMongoId() saleId: string;
  @IsInt() @Min(0) saleItemIndex: number;
  @IsMongoId() purchaseId: string;
  @IsInt() @Min(1) purchaseLineNumber: number;
  @IsInt() @Min(1) quantity: number;
}
