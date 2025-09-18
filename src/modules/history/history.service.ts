import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PostgresHistoryService } from '../../database/postgres/history/history.service';
import {
  MongoHistoryDataService,
  CreateHistoryDataDto,
} from '../../database/mongo/history/history-data.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(
    private readonly postgresHistoryService: PostgresHistoryService,
    private readonly mongoHistoryDataService: MongoHistoryDataService,
  ) {}

  // Save history for authenticated user
  async saveUserHistory(
    userId: number,
    title: string,
    colDefs: any[],
    rowData: any[],
    aiResponse?: any,
  ) {
    this.logger.debug(`Saving history for userId: ${userId}, title: ${title}`);

    // First save data to MongoDB
    const mongoId = await this.mongoHistoryDataService.createHistoryData({
      userId,
      fileName: title,
      colDefs,
      rowData,
      aiResponse,
    });

    // Then save metadata to PostgreSQL
    const history = await this.postgresHistoryService.createHistory(
      userId,
      title,
      title, // fileName
      mongoId,
    );

    this.logger.debug(
      `Saved history with ID: ${history.id} for userId: ${userId}`,
    );
    return history;
  }

  // Save history for anonymous users
  async saveAnonymousHistory(
    title: string,
    colDefs: any[],
    rowData: any[],
    aiResponse?: any,
  ) {
    this.logger.debug(`Saving anonymous history, title: ${title}`);

    // For anonymous users, we'll use a special userId or handle differently
    // You might want to create a special handling for anonymous users
    const anonymousUserId = -1;

    const mongoId = await this.mongoHistoryDataService.createHistoryData({
      userId: anonymousUserId,
      fileName: title,
      colDefs,
      rowData,
      aiResponse,
    });

    // Note: For anonymous users, you might not want to save to PostgreSQL
    // or handle it differently based on your requirements
    this.logger.debug(`Saved anonymous history with mongoId: ${mongoId}`);
    return { id: mongoId, title, mongoId };
  }

  // Get user history (metadata from PostgreSQL)
  async getUserHistory(userId: number) {
    this.logger.debug(`Fetching all history for userId: ${userId}`);
    const histories =
      await this.postgresHistoryService.findUserHistories(userId);
    this.logger.debug(
      `Found ${histories.length} history records for userId: ${userId}`,
    );
    return histories;
  }

  // Get full history data (metadata + data)
  async getFullUserHistory(userId: number) {
    this.logger.debug(`Fetching full history for userId: ${userId}`);

    const histories =
      await this.postgresHistoryService.findUserHistories(userId);

    if (!histories.length) {
      this.logger.debug(`No history found for userId: ${userId}`);
      return [];
    }

    const fullHistories = await Promise.allSettled(
      histories.map(async (history) => {
        try {
          const mongoData = await this.mongoHistoryDataService.findByMongoId(
            history.mongoId,
          );

          if (!mongoData) {
            this.logger.warn(
              `MongoDB data not found for mongoId: ${history.mongoId}`,
            );
            return {
              ...history,
              colDefs: [],
              rowData: [],
              aiResponse: null,
              metadata: { rowCount: 0, columnCount: 0 },
            };
          }

          return {
            id: history.id,
            title: history.title,
            fileName: history.fileName,
            mongoId: history.mongoId,
            createdAt: history.createdAt,
            updatedAt: history.updatedAt,
            colDefs: mongoData.colDefs || [],
            rowData: mongoData.rowData || [],
            aiResponse: mongoData.aiResponse,
            metadata: {
              rowCount: mongoData.rowData?.length || 0,
              columnCount: mongoData.colDefs?.length || 0,
              fileSize: mongoData.metadata?.fileSize || 0,
              ...mongoData.metadata,
            },
          };
        } catch (error) {
          this.logger.error(
            `Error fetching MongoDB data for ${history.mongoId}:`,
            error.message,
          );
          return {
            ...history,
            colDefs: [],
            rowData: [],
            aiResponse: null,
            metadata: {
              rowCount: 0,
              columnCount: 0,
              error: 'Failed to load data',
            },
          };
        }
      }),
    );

    // Filter out failed promises and return successful results
    const successfulHistories = fullHistories
      .filter(
        (result): result is PromiseFulfilledResult<any> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);

    this.logger.debug(
      `Successfully fetched ${successfulHistories.length}/${histories.length} histories for userId: ${userId}`,
    );

    return successfulHistories;
  }

  // Get recent anonymous history (from MongoDB only)
  async getRecentAnonymousHistory(limit: number = 20) {
    this.logger.debug('Fetching recent anonymous history');
    // This would need to be implemented based on how you handle anonymous users
    // For now, returning empty array
    return [];
  }

  // Get specific history by ID for a specific USER only
  async getHistoryByIdForUser(historyId: string, userId: number) {
    this.logger.debug(`Fetching history ID ${historyId} for userId: ${userId}`);

    const history = await this.postgresHistoryService.findUserHistoryById(
      userId,
      historyId,
    );
    if (!history) {
      this.logger.debug(
        `History ID ${historyId} not found for userId: ${userId} or access denied`,
      );
      return null;
    }

    // Get full data from MongoDB
    const mongoData = await this.mongoHistoryDataService.findByMongoId(
      history.mongoId,
    );

    return {
      ...history,
      colDefs: mongoData?.colDefs || [],
      rowData: mongoData?.rowData || [],
      aiResponse: mongoData?.aiResponse,
      metadata: mongoData?.metadata,
    };
  }

  // Get history by ID without user restriction
  async getHistoryById(historyId: string) {
    this.logger.debug(
      `Fetching history ID ${historyId} without user restriction`,
    );

    const history =
      await this.postgresHistoryService.findHistoryById(historyId);
    if (!history) {
      this.logger.debug(`History ID ${historyId} not found`);
      return null;
    }

    // Get full data from MongoDB
    const mongoData = await this.mongoHistoryDataService.findByMongoId(
      history.mongoId,
    );

    return {
      ...history,
      colDefs: mongoData?.colDefs || [],
      rowData: mongoData?.rowData || [],
      aiResponse: mongoData?.aiResponse,
      metadata: mongoData?.metadata,
    };
  }

  // Delete history for a specific USER only
  async deleteHistoryForUser(historyId: string, userId: number) {
    this.logger.debug(`Deleting history ID ${historyId} for userId: ${userId}`);

    // Get history to find mongoId
    const history = await this.postgresHistoryService.findUserHistoryById(
      userId,
      historyId,
    );
    if (!history) {
      return { affected: 0 };
    }

    // Delete from both databases
    const mongoDeleted = await this.mongoHistoryDataService.deleteByMongoId(
      history.mongoId,
    );
    const postgresDeleted = await this.postgresHistoryService.deleteHistory(
      historyId,
      userId,
    );

    this.logger.debug(
      `Delete result for history ID ${historyId}, userId ${userId}: postgres: ${postgresDeleted}, mongo: ${mongoDeleted}`,
    );

    return { affected: postgresDeleted ? 1 : 0 };
  }

  // Delete history without user restriction
  async deleteHistory(historyId: string) {
    this.logger.debug(
      `Deleting history ID ${historyId} without user restriction`,
    );

    // Get history to find mongoId
    const history =
      await this.postgresHistoryService.findHistoryById(historyId);
    if (!history) {
      return { affected: 0 };
    }

    // Delete from both databases
    const mongoDeleted = await this.mongoHistoryDataService.deleteByMongoId(
      history.mongoId,
    );
    const postgresDeleted = await this.postgresHistoryService.deleteHistory(
      historyId,
      history.userId,
    );

    this.logger.debug(
      `Delete result for history ID ${historyId}: postgres: ${postgresDeleted}, mongo: ${mongoDeleted}`,
    );

    return { affected: postgresDeleted ? 1 : 0 };
  }

  async updateAiResponse(historyId: string, aiResponse: any) {
    // Get history to find mongoId
    const history =
      await this.postgresHistoryService.findHistoryById(historyId);
    if (!history) {
      throw new NotFoundException(`History with ID ${historyId} not found`);
    }

    // Update AI response in MongoDB
    await this.mongoHistoryDataService.updateAiResponse(
      history.mongoId,
      aiResponse,
    );
  }

  // Main method for bulk saving session data when user logs in
  async bulkSaveSessionData(
    userId: number,
    sessionData: Array<{
      fileName: string;
      colDefs: any[];
      rowData: any[];
      aiResponse?: any;
      timestamp?: string;
    }>,
  ) {
    this.logger.debug(
      `Bulk saving ${sessionData.length} session items for userId: ${userId}`,
    );

    const savedRecords = [];

    for (const data of sessionData) {
      try {
        // Save to MongoDB first
        const mongoId = await this.mongoHistoryDataService.createHistoryData({
          userId,
          fileName: data.fileName,
          colDefs: data.colDefs,
          rowData: data.rowData,
          aiResponse: data.aiResponse,
        });

        // Then save metadata to PostgreSQL
        const history = await this.postgresHistoryService.createHistory(
          userId,
          data.fileName,
          data.fileName,
          mongoId,
        );

        savedRecords.push({
          id: history.id,
          title: history.title,
          createdAt: history.createdAt,
        });

        this.logger.debug(
          `Saved session data: ${data.fileName} with ID: ${history.id}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to save session data: ${data.fileName}`,
          error.message,
        );
      }
    }

    this.logger.debug(
      `Successfully saved ${savedRecords.length}/${sessionData.length} session records for userId: ${userId}`,
    );

    return {
      success: true,
      saved: savedRecords.length,
      total: sessionData.length,
      records: savedRecords,
      message: `Successfully saved ${savedRecords.length} session records to your account`,
    };
  }

  // Alternative method for backward compatibility
  async bulkSaveFromSession(userId: number, sessionAnalyses: any[]) {
    return this.bulkSaveSessionData(userId, sessionAnalyses);
  }

  // Bulk save for anonymous users
  async bulkSaveAnonymousFromSession(sessionAnalyses: any[]) {
    const savedRecords = [];

    for (const analysis of sessionAnalyses) {
      try {
        const anonymousUserId = -1;

        const mongoId = await this.mongoHistoryDataService.createHistoryData({
          userId: anonymousUserId,
          fileName: analysis.fileName,
          colDefs:
            typeof analysis.fileData === 'string'
              ? JSON.parse(analysis.fileData)
              : analysis.colDefs,
          rowData:
            typeof analysis.fileData === 'string'
              ? JSON.parse(analysis.fileData)
              : analysis.rowData,
          aiResponse: analysis.analysisConfig,
        });

        savedRecords.push({ id: mongoId, title: analysis.fileName });
      } catch (error) {
        this.logger.error(
          `Failed to save anonymous session data: ${analysis.fileName}`,
          error.message,
        );
      }
    }

    return {
      saved: savedRecords.length,
      records: savedRecords,
    };
  }

  // Get storage statistics for a user
  async getUserStorageStats(userId: number) {
    return await this.mongoHistoryDataService.getStorageStats(userId);
  }
}
