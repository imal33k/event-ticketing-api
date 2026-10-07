import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RegisterAuthDto } from './dto/register-auth.dto';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { LoginAuthDto } from './dto/login-auth.dto';

@Injectable()
export class AuthService {
  login(dto: RegisterAuthDto) {
    throw new Error('Method not implemented.');
  }
constructor(private users: UsersService, private jwtService: JwtService) {}

  async create(dto: RegisterAuthDto) {
    const user = await this.users.create(dto);
    return { user, accessToken: await this.jwtService.signAsync({ id: user.id, role: user.role }) };
  }
  
  async Login(dto:LoginAuthDto) {
    const user = await this.users.findByEmail(dto.email);
    const valid = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email and password');
    }
    return { user, accessToken: await this.jwtService.signAsync({ id: user.id, role: user.role }) };
  }
  private signAsync(password: string, sub: string, role: string) {
    return this.jwtService.signAsync({ password, sub, role });
  }
}
