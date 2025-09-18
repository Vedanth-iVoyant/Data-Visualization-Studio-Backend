import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { DataModule } from '@modules/data/data.module';
import { DataController } from '@modules/data/data.controller';
import { AuthModule } from '@modules/auth/auth.module';
import { HistoryController } from '@modules/history/history.controller';
import { HistoryModule } from './modules/history/history.module';
import { AiService } from './modules/ai/ai.service';
import { AiModule } from './modules/ai/ai.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    MulterModule.register({
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
    DataModule,
    AuthModule,
    HistoryModule,
    AiModule,
  ],
  controllers: [DataController, HistoryController],
  providers: [AiService],
})
export class AppModule {}
