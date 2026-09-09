import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelReplenishmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
