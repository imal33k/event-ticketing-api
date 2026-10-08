import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterAuthDto } from './dto/register-auth.dto';
import { UpdateAuthDto } from './dto/update-auth.dto';
import { UsersService } from '../users/users.service';
import { JwtSecretRequestType } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, RequestUser } from './decorators/current-user';
import { Throttle } from '@nestjs/throttler';
import { LoginAuthDto } from './dto/login-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly users: UsersService) {}

  @Throttle({ default: { limit: 3, ttl: 60_000 } }) // 3 registration attempts per minute
  @Post('register')
  create(@Body() dto: RegisterAuthDto) {
    return this.authService.create(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 login attempts per minute
  @Post('login')
  login(@Body() dto: LoginAuthDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: { id: string; }) {
    return this.users.findOne(user.id);
  }
}
