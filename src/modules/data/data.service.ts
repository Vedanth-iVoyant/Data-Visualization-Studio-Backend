// src/modules/data/data.service.ts
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as XLSX from 'xlsx';
import { HistoryService } from '@modules/history/history.service';

@Injectable()
export class DataService {
  private readonly logger = new Logger(DataService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly historyService: HistoryService,
  ) {}

  async handleFileUpload(
    file: Express.Multer.File,
    token: string,
    aiResponse?: any,
  ) {
    // Parse the file
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    if (!jsonData || jsonData.length === 0) {
      throw new BadRequestException('File contains no data');
    }

    const colDefs = Object.keys(jsonData[0] || {}).map((key) => ({
      headerName: key,
      field: key,
    }));

    const rowData = jsonData;
    const fileName = file.originalname;

    // Extract userId from token - REQUIRED for saving
    if (!token) {
      throw new BadRequestException(
        'Authentication token required to save files',
      );
    }

    let userId: number;
    try {
      const payload: any = this.jwtService.decode(token);
      userId = payload?.userId || payload?.id || payload?.sub;

      if (!userId) {
        throw new BadRequestException('Invalid token: missing user ID');
      }

      this.logger.debug(`Extracted userId: ${userId} for file: ${fileName}`);
    } catch (error) {
      this.logger.error('Token decode error:', error.message);
      throw new BadRequestException('Invalid authentication token');
    }

    try {
      // Save to database with user association
      const savedHistory = await this.historyService.saveUserHistory(
        userId,
        fileName,
        colDefs,
        rowData,
        aiResponse,
      );

      this.logger.log(
        `Successfully saved file ${fileName} with history ID: ${savedHistory.id} for user: ${userId}`,
      );

      return {
        columnDefs: colDefs,
        rowData,
        fileName,
        historyId: savedHistory.id,
        saved: true,
        userId: userId,
        createdAt: savedHistory.createdAt,
      };
    } catch (error) {
      this.logger.error(
        `Failed to save history for user ${userId}, file: ${fileName}`,
        error.message,
      );
      throw new BadRequestException(
        `Failed to save file to database: ${error.message}`,
      );
    }
  }

  // Parse file without saving to database (for session use)
  parseFileOnly(file: Express.Multer.File) {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      if (!jsonData || jsonData.length === 0) {
        throw new BadRequestException('File contains no data');
      }

      const colDefs = Object.keys(jsonData[0] || {}).map((key) => ({
        headerName: key,
        field: key,
      }));

      this.logger.debug(
        `Parsed file ${file.originalname} with ${jsonData.length} rows for session use`,
      );

      return {
        columnDefs: colDefs,
        rowData: jsonData,
        fileName: file.originalname,
        saved: false,
        isSessionData: true,
        parsedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Failed to parse file: ${file.originalname}`,
        error.message,
      );
      throw new BadRequestException(`Failed to parse file: ${error.message}`);
    }
  }

  // Validate file format and size
  validateFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Check file extension
    if (!file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      throw new BadRequestException(
        'Only CSV, XLSX, and XLS files are allowed',
      );
    }

    // Check file size (e.g., 10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new BadRequestException(
        'File size too large. Maximum size is 10MB',
      );
    }

    this.logger.debug(
      `File validation passed: ${file.originalname} (${file.size} bytes)`,
    );

    return true;
  }
}
