import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  description!: string;

  @IsString()
  @IsOptional()
  venue!: string;

  @IsString()
  @IsOptional()
  startAt!: string;

  @IsString()
  @IsOptional()
  endAt!: string;
}
