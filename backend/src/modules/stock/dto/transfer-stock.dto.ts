import { IsEnum, IsInt, Min } from 'class-validator';

export enum StockLocationDto {
  PENDING = 'PENDING',
  COUNTER = 'COUNTER',
  DEPOT = 'DEPOT',
  WAREHOUSE = 'WAREHOUSE',
}

export class TransferStockDto {
  @IsEnum(StockLocationDto)
  source: StockLocationDto;

  @IsEnum(StockLocationDto)
  destination: StockLocationDto;

  @IsInt()
  @Min(1)
  quantity: number;
}
