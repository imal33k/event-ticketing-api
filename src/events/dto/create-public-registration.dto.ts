import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PublicRegistrationTicketDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ticketTypeId: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}

export class CreatePublicRegistrationDto {
  @ApiProperty({ example: 'Jane Doe' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ type: [PublicRegistrationTicketDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PublicRegistrationTicketDto)
  items: PublicRegistrationTicketDto[];
}
