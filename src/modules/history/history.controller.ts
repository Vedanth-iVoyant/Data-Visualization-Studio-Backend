// src/modules/history/history.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  Headers,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { HistoryService } from './history.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { JwtService } from '@nestjs/jwt';

@Controller('history')
export class HistoryController {
  private readonly logger = new Logger(HistoryController.name);

  constructor(
    private historyService: HistoryService,
    private jwtService: JwtService,
  ) {}

  // Helper method to extract and verify user from token
  private async extractUserFromToken(
    authHeader: string,
  ): Promise<{ userId: number } | null> {
    if (!authHeader?.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    try {
      const payload = this.jwtService.decode(token);
      this.logger.debug(`JWT Payload: ${JSON.stringify(payload)}`);

      // Handle different payload structures
      const userId = payload.userId || payload.sub || payload.id;

      if (!userId) {
        this.logger.error('No userId found in JWT payload', payload);
        return null;
      }

      // Ensure userId is a number
      const numericUserId =
        typeof userId === 'string' ? parseInt(userId, 10) : userId;

      this.logger.debug(`Extracted userId: ${numericUserId}`);
      return { userId: numericUserId };
    } catch (error) {
      this.logger.error('JWT verification failed', error.message);
      return null;
    }
  }

  // Save history (requires authentication)
  @Post()
  @UseGuards(JwtAuthGuard)
  saveHistory(
    @Request() req,
    @Body()
    body: {
      title: string;
      colDefs: any[];
      rowData: any[];
    },
  ) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    this.logger.debug(`Saving history for userId: ${userId}`);

    return this.historyService.saveUserHistory(
      userId,
      body.title,
      body.colDefs,
      body.rowData,
    );
  }

  // UPDATED: Get full history with MongoDB data
  @Get()
  @UseGuards(JwtAuthGuard)
  async getHistory(@Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;
    this.logger.debug(`Getting full history for userId: ${userId}`);

    // Use getFullUserHistory instead of getUserHistory to get combined data
    return this.historyService.getFullUserHistory(userId);
  }

  // Get specific history by ID - requires authentication
  @Get('id/:id')
  @UseGuards(JwtAuthGuard)
  async getHistoryByNumericId(@Param('id') id: string, @Request() req) {
    this.logger.debug(`Getting history by ID: ${id}`);

    const userId = req.user.userId || req.user.sub || req.user.id;

    this.logger.debug(`Fetching history ${id} for user ${userId}`);

    const history = await this.historyService.getHistoryByIdForUser(id, userId);

    if (!history) {
      this.logger.debug(`History ${id} not found for user ${userId}`);
      throw new NotFoundException(
        'History not found or you do not have permission to access it',
      );
    }

    this.logger.debug(`Found history for user ${userId}`);
    return history;
  }

  // Bulk save from session storage when user logs in
  @Post('bulk-save-session')
  @UseGuards(JwtAuthGuard)
  async bulkSaveFromSession(
    @Request() req,
    @Body()
    body: {
      sessionData: Array<{
        fileName: string;
        colDefs: any[];
        rowData: any[];
        aiResponse?: any;
        timestamp?: string;
      }>;
    },
  ) {
    const userId = req.user.userId || req.user.sub || req.user.id;

    this.logger.debug(
      `Bulk saving ${body.sessionData.length} session items for userId: ${userId}`,
    );

    try {
      const result = await this.historyService.bulkSaveSessionData(
        userId,
        body.sessionData,
      );
      return result;
    } catch (error) {
      this.logger.error('Bulk save session error:', error.message);
      throw new BadRequestException('Failed to save session data');
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteHistory(@Param('id') id: string, @Request() req) {
    const userId = req.user.userId || req.user.sub || req.user.id;

    const result = await this.historyService.deleteHistoryForUser(id, userId);
    if (!result.affected) {
      throw new NotFoundException('History not found');
    }
    return { message: 'History deleted successfully' };
  }
}
