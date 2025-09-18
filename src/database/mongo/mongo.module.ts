// src/database/mongo/mongo.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoHistoryDataService } from './history/history-data.service';
import {
  HistoryData,
  HistoryDataSchema,
} from './history/schemas/history-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HistoryData.name, schema: HistoryDataSchema },
    ]),
  ],
  providers: [MongoHistoryDataService],
  exports: [MongoHistoryDataService, MongooseModule],
})
export class MongoModule {}
