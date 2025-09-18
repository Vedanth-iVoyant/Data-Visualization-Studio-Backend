// src/modules/ai/ai.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { HistoryModule } from '../history/history.module';
import { User } from '@/database/postgres/auth/entities/user.entity';

@Module({
  imports: [HistoryModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
