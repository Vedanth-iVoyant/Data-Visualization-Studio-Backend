import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { PostgresAuthService } from '@/database/postgres/auth/auth.service';

@Injectable()
export class AuthService {
  constructor(
    private postgresAuthService: PostgresAuthService,
    private jwtService: JwtService,
  ) {}

  async signup(dto: CreateUserDto) {
    const user = await this.postgresAuthService.createUser(
      dto.email,
      dto.password,
    );
    const payload = { sub: user.id, email: user.email };
    return {
      user: user.email,
      access_token: this.jwtService.sign(payload),
      message: 'User created successfully',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.postgresAuthService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isMatch = await this.postgresAuthService.validatePassword(
      dto.password,
      user.password,
    );
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');

    await this.postgresAuthService.updateLastLogin(user.id);

    const payload = { sub: user.id, email: user.email };
    return {
      user: user.email,
      access_token: this.jwtService.sign(payload),
    };
  }
}
