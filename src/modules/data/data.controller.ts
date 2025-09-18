// src/modules/data/data.controller.ts
import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  Req,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DataService } from './data.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { AiService } from '@modules/ai/ai.service';
import * as XLSX from 'xlsx';

@ApiTags('data')
@Controller('data')
export class DataController {
  constructor(
    private readonly dataService: DataService,
    private readonly aiService: AiService,
  ) {}

  // Helper method to extract user ID from token (optional)
  private extractUserIdFromRequest(req: any): number | null {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

      if (!token) return null;

      const jwt = require('jsonwebtoken');
      const payload = jwt.decode(token);
      return payload?.userId || payload?.id || payload?.sub || null;
    } catch (error) {
      return null;
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Upload CSV file - saves to DB if authenticated, returns session data if not',
  })
  @ApiResponse({
    status: 201,
    description: 'File processed successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body()
    body: {
      generateInsights?: boolean;
      preferredChartType?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    if (!file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      throw new BadRequestException(
        'Only CSV, XLSX, and XLS files are allowed',
      );
    }

    const userId = this.extractUserIdFromRequest(req);

    // Parse file data first
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

    const baseResponse = {
      columnDefs: colDefs,
      rowData: jsonData,
      fileName: file.originalname,
    };

    // If user is NOT authenticated - return session data
    if (!userId) {
      let aiInsights = null;

      // Generate AI insights if requested
      if (body.generateInsights) {
        try {
          aiInsights = await this.aiService.analyzeDataAndGenerateCharts(
            jsonData,
            body.preferredChartType,
          );
        } catch (error) {
          console.warn('AI analysis failed:', error.message);
          aiInsights = {
            error: 'Failed to generate AI insights',
          };
        }
      }

      return {
        ...baseResponse,
        isAuthenticated: false,
        saved: false,
        sessionData: true,
        message: 'Data processed successfully. Log in to save permanently.',
        aiInsights,
      };
    }

    // If user IS authenticated - save to database
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

      let aiInsights = null;

      // Generate AI insights if requested
      if (body.generateInsights) {
        try {
          aiInsights = await this.aiService.analyzeDataAndGenerateCharts(
            jsonData,
            body.preferredChartType,
          );
        } catch (error) {
          console.warn('AI analysis failed:', error.message);
        }
      }

      // Save to database
      const uploadResult = await this.dataService.handleFileUpload(
        file,
        token,
        aiInsights,
      );

      return {
        ...uploadResult,
        isAuthenticated: true,
        saved: true,
        sessionData: false,
        message: 'File uploaded and saved successfully.',
        aiInsights,
      };
    } catch (error) {
      // If DB save fails, still return session data
      console.error('Database save failed:', error.message);

      let aiInsights = null;
      if (body.generateInsights) {
        try {
          aiInsights = await this.aiService.analyzeDataAndGenerateCharts(
            jsonData,
            body.preferredChartType,
          );
        } catch (aiError) {
          console.warn('AI analysis failed:', aiError.message);
        }
      }

      return {
        ...baseResponse,
        isAuthenticated: true,
        saved: false,
        sessionData: true,
        error: 'Failed to save to database, data available for session use',
        message: 'File processed but not saved. Please try again.',
        aiInsights,
      };
    }
  }

  @Post('upload-and-analyze')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Upload file and get AI analysis - works for both authenticated and guest users',
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded and analyzed successfully',
  })
  async uploadAndAnalyze(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
    @Body()
    body: {
      preferredChartType?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    if (!file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      throw new BadRequestException(
        'Only CSV, XLSX, and XLS files are allowed',
      );
    }

    const userId = this.extractUserIdFromRequest(req);

    // Parse file first to get data
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

    // Generate AI analysis
    const aiAnalysis = await this.aiService.analyzeDataAndGenerateCharts(
      jsonData,
      body.preferredChartType,
    );

    const baseData = {
      columnDefs: colDefs,
      rowData: jsonData,
      fileName: file.originalname,
      analysis: aiAnalysis,
      quickStart: {
        topRecommendations: aiAnalysis.suggestions.slice(0, 3),
        dataPreview: jsonData.slice(0, 5),
        columnInfo: colDefs,
      },
    };

    // If user is NOT authenticated
    if (!userId) {
      return {
        ...baseData,
        isAuthenticated: false,
        saved: false,
        sessionData: true,
        message: 'File analyzed successfully. Log in to save permanently.',
      };
    }

    // If user IS authenticated - try to save to database
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : null;

      // FIXED: Call handleFileUpload and properly handle the response
      const uploadResult = await this.dataService.handleFileUpload(
        file,
        token,
        aiAnalysis,
      );

      // FIXED: Return the uploadResult data directly merged with baseData
      return {
        ...baseData,
        // Include all the upload result data
        historyId: uploadResult.historyId,
        saved: uploadResult.saved,
        userId: uploadResult.userId,
        createdAt: uploadResult.createdAt,
        isAuthenticated: true,
        sessionData: false,
        message: 'File uploaded, analyzed, and saved successfully.',
      };
    } catch (error) {
      console.error('Database save failed:', error.message);

      return {
        ...baseData,
        isAuthenticated: true,
        saved: false,
        sessionData: true,
        error: 'Analysis completed but failed to save to database',
        message: 'File analyzed but not saved. Data available for session use.',
      };
    }
  }

  // Keep existing endpoint for parsing files without saving
  @Post('parse-file')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Parse file and return data without saving - no authentication required',
  })
  @ApiResponse({
    status: 200,
    description: 'File parsed successfully',
  })
  async parseFileOnly(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      generateInsights?: boolean;
      preferredChartType?: string;
    },
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    if (!file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      throw new BadRequestException(
        'Only CSV, XLSX, and XLS files are allowed',
      );
    }

    // Parse file without saving to database
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    const colDefs = Object.keys(jsonData[0] || {}).map((key) => ({
      headerName: key,
      field: key,
    }));

    const result = {
      columnDefs: colDefs,
      rowData: jsonData,
      fileName: file.originalname,
      isSessionData: true,
      saved: false,
      message: 'File parsed successfully for session use.',
    };

    // If AI insights are requested, generate them
    if (body.generateInsights) {
      try {
        const insights = await this.aiService.analyzeDataAndGenerateCharts(
          jsonData,
          body.preferredChartType,
        );

        return {
          ...result,
          aiInsights: insights,
        };
      } catch (error) {
        console.warn('AI analysis failed:', error.message);
        return {
          ...result,
          aiInsights: null,
          aiError: 'Failed to generate AI insights',
        };
      }
    }

    return result;
  }
}
