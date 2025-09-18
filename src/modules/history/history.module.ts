import { Module } from '@nestjs/common';
import { HistoryService } from './history.service';
import { HistoryController } from './history.controller';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [
    DatabaseModule, // This provides both PostgresHistoryService and MongoHistoryDataService
    JwtModule.register({
      secret: 'SECRET_KEY', // move to process.env
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [HistoryController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
