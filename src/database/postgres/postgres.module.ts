// src/database/postgres/postgres.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgresAuthService } from './auth/auth.service';
import { PostgresHistoryService } from './history/history.service';
import { User } from './auth/entities/user.entity';
import { History } from './history/entities/history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, History])],
  providers: [PostgresAuthService, PostgresHistoryService],
  exports: [PostgresAuthService, PostgresHistoryService, TypeOrmModule],
})
export class PostgresModule {}
