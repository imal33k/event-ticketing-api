import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RegisterAuthDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @MinLength(6)
  @IsNotEmpty()
  password: string;
}
