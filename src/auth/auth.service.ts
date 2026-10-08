import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterAuthDto } from './dto/register-auth.dto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginAuthDto } from './dto/login-auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async create(dto: RegisterAuthDto) {
    const user = await this.usersService.create(dto);
    return {
      user,
      accessToken: await this.jwtService.signAsync({
        id: user.id,
        role: user.role,
      }),
    };
  }

  async login(dto: LoginAuthDto) {
    const user = await this.usersService.findByEmailWithHash(dto.email);
    const valid =
      user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email and password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    const { passwordHash, ...safeUser } = user;
    return { user: safeUser, accessToken };
  }
}
