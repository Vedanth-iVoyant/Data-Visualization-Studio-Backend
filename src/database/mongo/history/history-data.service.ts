// src/database/mongo/history/history-data.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HistoryData } from './schemas/history-data.schema';
import { v4 as uuidv4 } from 'uuid';

export interface CreateHistoryDataDto {
  userId: number;
  fileName: string;
  colDefs: Record<string, any>[];
  rowData: Record<string, any>[];
  aiResponse?: any;
  metadata?: Record<string, any>;
}

@Injectable()
export class MongoHistoryDataService {
  private readonly logger = new Logger(MongoHistoryDataService.name);

  constructor(
    @InjectModel(HistoryData.name)
    private readonly historyDataModel: Model<HistoryData>,
  ) {}

  async createHistoryData(data: CreateHistoryDataDto): Promise<string> {
    const mongoId = uuidv4();

    const historyData = new this.historyDataModel({
      mongoId,
      userId: data.userId,
      fileName: data.fileName,
      colDefs: data.colDefs,
      rowData: data.rowData,
      aiResponse: data.aiResponse,
      metadata: {
        rowCount: data.rowData.length,
        columnCount: data.colDefs.length,
        fileSize: JSON.stringify(data.rowData).length,
        ...data.metadata,
      },
    });

    const saved = await historyData.save();
    this.logger.log(`Created MongoDB document with mongoId: ${mongoId}`);

    return mongoId;
  }

  async findByMongoId(mongoId: string): Promise<HistoryData | null> {
    return await this.historyDataModel.findOne({ mongoId }).exec();
  }

  async findByUserId(userId: number): Promise<HistoryData[]> {
    return await this.historyDataModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateAiResponse(mongoId: string, aiResponse: any): Promise<boolean> {
    const result = await this.historyDataModel
      .updateOne(
        { mongoId },
        {
          aiResponse,
          updatedAt: new Date(),
        },
      )
      .exec();

    return result.modifiedCount > 0;
  }

  async deleteByMongoId(mongoId: string): Promise<boolean> {
    const result = await this.historyDataModel.deleteOne({ mongoId }).exec();

    const deleted = result.deletedCount > 0;
    if (deleted) {
      this.logger.log(`Deleted MongoDB document with mongoId: ${mongoId}`);
    }

    return deleted;
  }

  async bulkCreateHistoryData(
    dataArray: CreateHistoryDataDto[],
  ): Promise<string[]> {
    const mongoIds: string[] = [];

    const documents = dataArray.map((data) => {
      const mongoId = uuidv4();
      mongoIds.push(mongoId);

      return {
        mongoId,
        userId: data.userId,
        fileName: data.fileName,
        colDefs: data.colDefs,
        rowData: data.rowData,
        aiResponse: data.aiResponse,
        metadata: {
          rowCount: data.rowData.length,
          columnCount: data.colDefs.length,
          fileSize: JSON.stringify(data.rowData).length,
          ...data.metadata,
        },
      };
    });

    await this.historyDataModel.insertMany(documents);
    this.logger.log(`Bulk created ${documents.length} MongoDB documents`);

    return mongoIds;
  }

  async getStorageStats(userId: number): Promise<{
    totalDocuments: number;
    totalDataSize: number;
    averageRowsPerDocument: number;
  }> {
    const pipeline = [
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalDocuments: { $sum: 1 },
          totalRows: { $sum: '$metadata.rowCount' },
          totalDataSize: { $sum: '$metadata.fileSize' },
        },
      },
    ];

    const result = await this.historyDataModel.aggregate(pipeline).exec();

    if (result.length === 0) {
      return {
        totalDocuments: 0,
        totalDataSize: 0,
        averageRowsPerDocument: 0,
      };
    }

    const stats = result[0];
    return {
      totalDocuments: stats.totalDocuments,
      totalDataSize: stats.totalDataSize,
      averageRowsPerDocument: Math.round(
        stats.totalRows / stats.totalDocuments,
      ),
    };
  }
}
