import { IsString, IsEmail, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class SyncUserDto {

  @IsString()
  @IsNotEmpty()
  fullName!: string;
  
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

}
