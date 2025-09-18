// src/database/postgres/history/history.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { History } from './entities/history.entity';
import { User } from '../auth/entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PostgresHistoryService {
  private readonly logger = new Logger(PostgresHistoryService.name);

  constructor(
    @InjectRepository(History)
    private readonly historyRepository: Repository<History>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createHistory(
    userId: number,
    title: string,
    fileName: string,
    mongoId: string,
  ): Promise<History> {
    // Verify user exists with ACID properties
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const history = this.historyRepository.create({
      title,
      fileName,
      mongoId,
      userId,
      user,
    });

    const savedHistory = await this.historyRepository.save(history);
    this.logger.log(`Created history ${savedHistory.id} for user ${userId}`);

    return savedHistory;
  }

  async findUserHistories(userId: number): Promise<History[]> {
    return await this.historyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      select: ['id', 'title', 'fileName', 'mongoId', 'createdAt', 'updatedAt'],
    });
  }

  async findHistoryById(historyId: string): Promise<History | null> {
    return await this.historyRepository.findOne({
      where: { id: historyId },
      relations: ['user'],
    });
  }

  async findUserHistoryById(
    userId: number,
    historyId: string,
  ): Promise<History | null> {
    return await this.historyRepository.findOne({
      where: {
        id: historyId,
        userId: userId,
      },
    });
  }

  async updateHistoryTitle(
    historyId: string,
    userId: number,
    newTitle: string,
  ): Promise<boolean> {
    const result = await this.historyRepository.update(
      { id: historyId, userId },
      { title: newTitle, updatedAt: new Date() },
    );

    return result.affected > 0;
  }

  async deleteHistory(historyId: string, userId: number): Promise<boolean> {
    const result = await this.historyRepository.delete({
      id: historyId,
      userId,
    });

    const deleted = result.affected > 0;
    if (deleted) {
      this.logger.log(`Deleted history ${historyId} for user ${userId}`);
    }

    return deleted;
  }

  async getUserHistoryCount(userId: number): Promise<number> {
    return await this.historyRepository.count({ where: { userId } });
  }

  async getHistoryByMongoId(mongoId: string): Promise<History | null> {
    return await this.historyRepository.findOne({
      where: { mongoId },
    });
  }

  // Bulk operations for session data migration
  async bulkCreateHistories(histories: Partial<History>[]): Promise<History[]> {
    const entities = histories.map((history) =>
      this.historyRepository.create(history),
    );
    return await this.historyRepository.save(entities);
  }
}
