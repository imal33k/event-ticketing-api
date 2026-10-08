import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAttendeeDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'jane.doe@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;
}
