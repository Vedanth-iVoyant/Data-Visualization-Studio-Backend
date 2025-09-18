import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DatabaseModule } from '@/database/database.module';
import { PostgresAuthService } from '@/database/postgres/auth/auth.service';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: 'SECRET_KEY', // move to process.env
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PostgresAuthService],
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
