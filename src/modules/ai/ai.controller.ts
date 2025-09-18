// src/modules/ai/ai.controller.ts
import {
  Controller,
  Post,
  Body,
  Request,
  BadRequestException,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { HistoryService } from '@modules/history/history.service';
import { AnalyzeDataDto } from './dto/analyze-data.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly historyService: HistoryService,
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
      const userId = payload?.userId || payload?.id || payload?.sub;

      // Convert to number and validate
      const numericUserId = parseInt(userId, 10);
      return isNaN(numericUserId) ? null : numericUserId;
    } catch (error) {
      return null;
    }
  }

  @Post('analyze')
  @ApiOperation({ summary: 'Analyze data and generate chart configurations' })
  @ApiResponse({
    status: 200,
    description: 'Chart configurations generated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async analyzeData(
    @Body() analyzeDataDto: AnalyzeDataDto,
    @Request() req: any,
  ) {
    const { historyId, chartType, customData } = analyzeDataDto;

    let rowData: any[] = [];

    // If custom data is provided, use it directly (for session-stored data)
    if (customData && customData.length > 0) {
      rowData = customData;
    } else if (historyId) {
      // Get data from database history (requires authentication)
      const userId = this.extractUserIdFromRequest(req);

      if (!userId) {
        throw new BadRequestException(
          'Authentication required to access saved history',
        );
      }

      const history = await this.historyService.getHistoryByIdForUser(
        historyId,
        userId,
      );

      if (!history) {
        throw new BadRequestException('History not found or access denied');
      }

      rowData = history.rowData;
    } else {
      throw new BadRequestException(
        'Either historyId or customData must be provided',
      );
    }

    if (!rowData || rowData.length === 0) {
      throw new BadRequestException('No data available for analysis');
    }

    return await this.aiService.analyzeDataAndGenerateCharts(
      rowData,
      chartType,
    );
  }

  @Post('generate-chart')
  @ApiOperation({ summary: 'Generate specific chart with transformed data' })
  @ApiResponse({
    status: 200,
    description: 'Chart data generated successfully',
  })
  async generateChart(
    @Body()
    body: {
      historyId?: string;
      chartConfig: any;
      customData?: any[];
    },
    @Request() req: any,
  ) {
    const { historyId, chartConfig, customData } = body;

    let rowData: any[] = [];

    if (customData && customData.length > 0) {
      rowData = customData;
    } else if (historyId) {
      const userId = this.extractUserIdFromRequest(req);

      if (!userId) {
        throw new BadRequestException(
          'Authentication required to access saved history',
        );
      }

      const history = await this.historyService.getHistoryByIdForUser(
        historyId,
        userId,
      );

      if (!history) {
        throw new BadRequestException('History not found or access denied');
      }

      rowData = history.rowData;
    }

    // Transform data with the chart config
    const transformedData = this.aiService.transformDataForChart(
      rowData,
      chartConfig,
    );

    // Generate KPIs for this specific chart
    const kpis = this.aiService.generateKPIs
      ? this.aiService.generateKPIs(chartConfig, transformedData)
      : [];

    // Enhanced response structure matching mockApiResponse
    return {
      id: `chart_${Date.now()}`,
      type: chartConfig.type,
      title: chartConfig.title,
      description: chartConfig.description,
      config: {
        ...chartConfig.config,
        // Ensure proper formatting for Ant Design plots
        ...(chartConfig.type === 'pie' && {
          label: {
            type: 'outer',
            content: '{name}: {percentage}%',
          },
        }),
      },
      data: transformedData,
      insights: chartConfig.insights || [
        `Analysis of ${chartConfig.title}`,
        'Generated from your dataset',
        'Explore patterns and trends in your data',
      ],
      kpis: kpis,
      aggregation: chartConfig.aggregation,
    };
  }

  @Get('chart-types')
  @ApiOperation({ summary: 'Get available chart types' })
  @ApiResponse({
    status: 200,
    description: 'Available chart types retrieved successfully',
  })
  getAvailableChartTypes() {
    return {
      chartTypes: [
        {
          type: 'line',
          name: 'Line Chart',
          description: 'Perfect for time series and trend analysis',
          bestFor: ['Time series data', 'Trend analysis', 'Continuous data'],
          component: 'Line',
        },
        {
          type: 'column',
          name: 'Column Chart',
          description: 'Great for comparing values across categories',
          bestFor: ['Category comparison', 'Discrete data', 'Rankings'],
          component: 'Column',
        },
        {
          type: 'bar',
          name: 'Bar Chart',
          description: 'Horizontal bars for easy reading of category names',
          bestFor: ['Long category names', 'Ranking data', 'Comparisons'],
          component: 'Bar',
        },
        {
          type: 'area',
          name: 'Area Chart',
          description: 'Shows cumulative totals and trends over time',
          bestFor: ['Cumulative data', 'Multiple series', 'Part-to-whole'],
          component: 'Area',
        },
        {
          type: 'pie',
          name: 'Pie Chart',
          description: 'Displays proportional data as slices of a circle',
          bestFor: [
            'Part-to-whole relationships',
            'Percentages',
            'Categorical data',
          ],
          component: 'Pie',
        },
        {
          type: 'scatter',
          name: 'Scatter Plot',
          description: 'Shows correlation between two variables',
          bestFor: [
            'Correlation analysis',
            'Outlier detection',
            'Numeric relationships',
          ],
          component: 'Scatter',
        },
        {
          type: 'heatmap',
          name: 'Heatmap',
          description: 'Uses color to represent data values in a matrix',
          bestFor: [
            'Pattern recognition',
            'Large datasets',
            'Correlation matrices',
          ],
          component: 'Heatmap',
        },
        {
          type: 'radar',
          name: 'Radar Chart',
          description: 'Multivariate data visualization in a circular format',
          bestFor: [
            'Multiple metrics',
            'Performance comparison',
            'Profile analysis',
          ],
          component: 'Radar',
        },
        {
          type: 'funnel',
          name: 'Funnel Chart',
          description: 'Shows progressive reduction of data through stages',
          bestFor: ['Process analysis', 'Conversion rates', 'Sequential data'],
          component: 'Funnel',
        },
        {
          type: 'gauge',
          name: 'Gauge Chart',
          description: 'Displays a single value within a range',
          bestFor: ['KPI visualization', 'Progress tracking', 'Single metrics'],
          component: 'Gauge',
        },
      ],
    };
  }

  @Get('data-insights/:historyId')
  @ApiOperation({ summary: 'Get quick data insights for a dataset' })
  @ApiResponse({
    status: 200,
    description: 'Data insights retrieved successfully',
  })
  async getDataInsights(
    @Param('historyId') historyId: string,
    @Request() req?: any,
  ) {
    const userId = this.extractUserIdFromRequest(req);

    if (!userId) {
      throw new BadRequestException(
        'Authentication required to access saved history',
      );
    }

    const history = await this.historyService.getHistoryByIdForUser(
      historyId,
      userId,
    );

    if (!history) {
      throw new BadRequestException('History not found or access denied');
    }

    const analysis = await this.aiService.analyzeDataAndGenerateCharts(
      history.rowData,
    );

    return {
      dataAnalysis: analysis.dataAnalysis,
      recommendedCharts: analysis.suggestions.slice(0, 3), // Top 3 recommendations
    };
  }

  @Get('cached-analysis/:historyId')
  @ApiOperation({ summary: 'Get cached AI analysis from history' })
  async getCachedAnalysis(
    @Param('historyId') historyId: string,
    @Request() req?: any,
  ) {
    const userId = this.extractUserIdFromRequest(req);

    if (!userId) {
      throw new BadRequestException(
        'Authentication required to access saved history',
      );
    }

    const history = await this.historyService.getHistoryByIdForUser(
      historyId,
      userId,
    );

    if (!history) {
      throw new BadRequestException('History not found or access denied');
    }

    // If AI response exists in history, return it
    if (history.aiResponse) {
      return {
        cached: true,
        analysis: history.aiResponse,
        quickStart: {
          topRecommendations: history.aiResponse.suggestions?.slice(0, 3) || [],
          dataPreview: history.rowData.slice(0, 5),
          columnInfo: history.colDefs,
        },
      };
    }

    // If no cached AI response, generate new one and update history
    const aiAnalysis = await this.aiService.analyzeDataAndGenerateCharts(
      history.rowData,
    );

    // Update history with AI response
    await this.historyService.updateAiResponse(historyId, aiAnalysis);

    return {
      cached: false,
      analysis: aiAnalysis,
      quickStart: {
        topRecommendations: aiAnalysis.suggestions.slice(0, 3),
        dataPreview: history.rowData.slice(0, 5),
        columnInfo: history.colDefs,
      },
    };
  }

  // New endpoint for analyzing session data without saving
  @Post('analyze-session-data')
  @ApiOperation({ summary: 'Analyze session data without saving to database' })
  @ApiResponse({
    status: 200,
    description: 'Session data analyzed successfully',
  })
  async analyzeSessionData(
    @Body() body: { rowData: any[]; chartType?: string; fileName?: string },
  ) {
    const { rowData, chartType, fileName } = body;

    if (!rowData || rowData.length === 0) {
      throw new BadRequestException('No data provided for analysis');
    }

    const analysis = await this.aiService.analyzeDataAndGenerateCharts(
      rowData,
      chartType,
    );

    return {
      analysis,
      fileName: fileName || 'Session Data',
      isSessionData: true,
    };
  }
}
