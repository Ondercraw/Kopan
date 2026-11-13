import { IsInt, IsMongoId, Min } from 'class-validator';

export class AssignManualSaleCostDto {
  @IsMongoId() saleId: string;
  @IsInt() @Min(0) saleItemIndex: number;
  @IsInt() @Min(1) quantity: number;
  @IsInt() @Min(1) unitCostCents: number;
}
