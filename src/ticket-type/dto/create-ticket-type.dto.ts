import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateTicketTypeDto {
  @IsString()
  @MinLength(2)
  name: string; // e.g. "VIP", "General"

  @IsInt()
  @Min(0)
  priceKobo: number; // 1500000 = ₦15,000

  @IsInt()
  @Min(1)
  capacity: number;
}
