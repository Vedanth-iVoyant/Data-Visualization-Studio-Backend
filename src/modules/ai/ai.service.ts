// src/modules/ai/ai.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ChartConfig {
  type: string;
  title: string;
  description: string;
  config: any;
  insights: string[];
  aggregation?: 'sum' | 'avg' | 'count' | 'max' | 'min';
}

export interface DataAnalysis {
  totalRows: number;
  columns: string[];
  numericalColumns: string[];
  categoricalColumns: string[];
  dateColumns: string[];
  summary: string;
  stats: Record<string, any>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    const modelName =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: modelName });
  }

  async analyzeDataAndGenerateCharts(
    rowData: any[],
    selectedChartType?: string,
  ) {
    if (!rowData || rowData.length === 0) {
      throw new BadRequestException('No data provided for analysis');
    }

    // Analyze data structure
    const dataAnalysis = this.analyzeDataStructure(rowData);

    // Generate chart configurations with AI insights
    const chartConfigs = await this.generateChartConfigurations(
      dataAnalysis,
      rowData.slice(0, Math.min(100, rowData.length)),
      selectedChartType,
    );

    return {
      suggestions: chartConfigs,
      dataAnalysis,
    };
  }

  private analyzeDataStructure(rowData: any[]): DataAnalysis {
    const firstRow = rowData[0] || {};
    const columns = Object.keys(firstRow);
    const numericalColumns: string[] = [];
    const categoricalColumns: string[] = [];
    const dateColumns: string[] = [];
    const stats: Record<string, any> = {};

    columns.forEach((column) => {
      const sampleValues = rowData
        .slice(0, Math.min(50, rowData.length))
        .map((row) => row[column])
        .filter((val) => val != null && val !== '');

      if (this.isDateColumn(sampleValues)) {
        dateColumns.push(column);
        stats[column] = { type: 'date', sampleCount: sampleValues.length };
      } else if (this.isNumericalColumn(sampleValues)) {
        numericalColumns.push(column);
        const numericValues = sampleValues
          .map((val) => Number(val))
          .filter((val) => !isNaN(val));
        stats[column] = {
          type: 'numerical',
          min: Math.min(...numericValues),
          max: Math.max(...numericValues),
          avg: numericValues.reduce((a, b) => a + b, 0) / numericValues.length,
          sum: numericValues.reduce((a, b) => a + b, 0),
        };
      } else {
        categoricalColumns.push(column);
        const uniqueValues = [...new Set(sampleValues)];
        stats[column] = {
          type: 'categorical',
          uniqueCount: uniqueValues.length,
          topValues: this.getTopValues(rowData, column, 5),
        };
      }
    });

    return {
      totalRows: rowData.length,
      columns,
      numericalColumns,
      categoricalColumns,
      dateColumns,
      summary: `Dataset contains ${rowData.length} rows with ${numericalColumns.length} numerical, ${categoricalColumns.length} categorical, and ${dateColumns.length} date columns.`,
      stats,
    };
  }

  private async generateChartConfigurations(
    dataAnalysis: DataAnalysis,
    sampleData: any[],
    selectedChartType?: string,
  ): Promise<ChartConfig[]> {
    const { numericalColumns, categoricalColumns, dateColumns } = dataAnalysis;
    const charts: ChartConfig[] = [];

    // Enhanced Pie Chart
    if (categoricalColumns.length > 0) {
      const insights = await this.generateAIInsights(
        'pie',
        categoricalColumns[0],
        null,
        sampleData,
        dataAnalysis,
      );

      charts.push({
        type: 'pie',
        title: `Distribution of ${this.formatFieldName(categoricalColumns[0])}`,
        description: `Proportion of different ${this.formatFieldName(categoricalColumns[0])} categories in the dataset.`,
        config: {
          angleField: 'count',
          colorField: categoricalColumns[0],
          radius: 0.8,
          innerRadius: 0.4,
          label: {
            type: 'outer',
            content: '{name}: {percentage}%',
          },
          legend: { position: 'right' },
          color: [
            '#1890ff',
            '#52c41a',
            '#faad14',
            '#f5222d',
            '#722ed1',
            '#13c2c2',
          ],
          interactions: [{ type: 'element-active' }],
          meta: {
            [categoricalColumns[0]]: {
              alias: this.formatFieldName(categoricalColumns[0]),
            },
          },
        },
        insights,
        aggregation: 'count',
      });
    }

    // Enhanced Line Chart
    if (dateColumns.length > 0 && numericalColumns.length > 0) {
      const insights = await this.generateAIInsights(
        'line',
        dateColumns[0],
        numericalColumns[0],
        sampleData,
        dataAnalysis,
      );

      charts.push({
        type: 'line',
        title: `${this.formatFieldName(numericalColumns[0])} Trend Over Time`,
        description: `Time series showing ${this.formatFieldName(numericalColumns[0])} changes over ${this.formatFieldName(dateColumns[0])}.`,
        config: {
          xField: dateColumns[0],
          yField: numericalColumns[0],
          smooth: true,
          point: { size: 2 },
          color: '#1890ff',
          xAxis: {
            type: 'time',
            title: {
              text: this.formatFieldName(dateColumns[0]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
          },
          yAxis: {
            title: {
              text: this.formatFieldName(numericalColumns[0]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
          },
          slider: { start: 0, end: 1 },
          tooltip: {
            showCrosshairs: true,
            shared: true,
          },
          meta: {
            [dateColumns[0]]: {
              alias: this.formatFieldName(dateColumns[0]),
            },
            [numericalColumns[0]]: {
              alias: this.formatFieldName(numericalColumns[0]),
            },
          },
        },
        insights,
      });
    }

    // Enhanced Column Chart
    if (categoricalColumns.length > 0 && numericalColumns.length > 0) {
      const insights = await this.generateAIInsights(
        'column',
        categoricalColumns[0],
        numericalColumns[0],
        sampleData,
        dataAnalysis,
      );

      charts.push({
        type: 'column',
        title: `${this.formatFieldName(numericalColumns[0])} by ${this.formatFieldName(categoricalColumns[0])}`,
        description: `Compare ${this.formatFieldName(numericalColumns[0])} values across different ${this.formatFieldName(categoricalColumns[0])} categories.`,
        config: {
          xField: categoricalColumns[0],
          yField: numericalColumns[0],
          meta: {
            [categoricalColumns[0]]: {
              alias: this.formatFieldName(categoricalColumns[0]),
            },
            [numericalColumns[0]]: {
              alias: this.formatFieldName(numericalColumns[0]),
            },
          },
          columnWidthRatio: 0.6,
          label: {
            position: 'middle',
            style: { fill: '#FFFFFF', opacity: 0.8 },
          },
          color: '#1890ff',
          xAxis: {
            title: {
              text: this.formatFieldName(categoricalColumns[0]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
          },
          yAxis: {
            title: {
              text: this.formatFieldName(numericalColumns[0]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
          },
        },
        insights,
        aggregation: 'avg',
      });
    }

    // Enhanced Scatter Plot
    if (numericalColumns.length >= 2) {
      const insights = await this.generateAIInsights(
        'scatter',
        numericalColumns[0],
        numericalColumns[1],
        sampleData,
        dataAnalysis,
      );

      charts.push({
        type: 'scatter',
        title: `${this.formatFieldName(numericalColumns[0])} vs ${this.formatFieldName(numericalColumns[1])} Relationship`,
        description: `Analyze correlation between ${this.formatFieldName(numericalColumns[0])} and ${this.formatFieldName(numericalColumns[1])}.`,
        config: {
          xField: numericalColumns[0],
          yField: numericalColumns[1],
          colorField:
            categoricalColumns.length > 0 ? categoricalColumns[0] : undefined,
          size: 4,
          color:
            categoricalColumns.length > 0
              ? ['#1890ff', '#52c41a', '#faad14', '#f5222d']
              : '#1890ff',
          xAxis: {
            title: {
              text: this.formatFieldName(numericalColumns[0]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
            nice: true,
          },
          yAxis: {
            title: {
              text: this.formatFieldName(numericalColumns[1]),
              style: { fontSize: 12, fontWeight: 'bold' },
            },
            nice: true,
          },
          legend: categoricalColumns.length > 0 ? { position: 'top' } : false,
          tooltip: {
            showMarkers: true,
          },
          meta: {
            [numericalColumns[0]]: {
              alias: this.formatFieldName(numericalColumns[0]),
            },
            [numericalColumns[1]]: {
              alias: this.formatFieldName(numericalColumns[1]),
            },
          },
        },
        insights,
      });
    }

    if (selectedChartType) {
      return charts.filter((chart) => chart.type === selectedChartType);
    }

    return charts.slice(0, 6);
  }

  private async generateAIInsights(
    chartType: string,
    xField: string,
    yField: string | null,
    sampleData: any[],
    dataAnalysis: DataAnalysis,
  ): Promise<string[]> {
    try {
      const dataContext = this.prepareDataContext(
        sampleData,
        dataAnalysis,
        xField,
        yField,
      );

      const prompt = `
        Analyze this ${chartType} chart data and provide 2-3 concise insights.

        Requirements:
        - Each insight must be no longer than 1 line.
        - Focus only on the most important trends, anomalies, or business implications.
        - Do not include explanations or extra details.

        Chart Type: ${chartType}
        X-Field: ${xField}
        ${yField ? `Y-Field: ${yField}` : ''}

        Data Context:
        ${dataContext}

        Sample Data (first 100 rows):
        ${JSON.stringify(sampleData.slice(0, 100), null, 2)}

        Return only 2-3 numbered insights, each max 2 sentences.
        `;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      // Parse the AI response into bullet points
      const insights = text
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => line.replace(/^\d+\.?\s*/, '').trim())
        .filter((line) => line.length > 10)
        .slice(0, 4);

      return insights.length > 0
        ? insights
        : this.getFallbackInsights(chartType, xField, yField);
    } catch (error) {
      this.logger.warn(
        'Failed to generate AI insights, using fallback',
        error.message,
      );
      return this.getFallbackInsights(chartType, xField, yField);
    }
  }

  private prepareDataContext(
    sampleData: any[],
    dataAnalysis: DataAnalysis,
    xField: string,
    yField: string | null,
  ): string {
    const stats = dataAnalysis.stats;
    let context = `Dataset contains ${dataAnalysis.totalRows} rows.\n`;

    if (stats[xField]) {
      const xStats = stats[xField];
      if (xStats.type === 'numerical') {
        context += `${xField}: Range ${xStats.min}-${xStats.max}, Average ${xStats.avg.toFixed(2)}\n`;
      } else if (xStats.type === 'categorical') {
        context += `${xField}: ${xStats.uniqueCount} unique categories, Top: ${xStats.topValues.map((v: any) => v.value).join(', ')}\n`;
      }
    }

    if (yField && stats[yField]) {
      const yStats = stats[yField];
      if (yStats.type === 'numerical') {
        context += `${yField}: Range ${yStats.min}-${yStats.max}, Average ${yStats.avg.toFixed(2)}\n`;
      }
    }

    return context;
  }

  private getFallbackInsights(
    chartType: string,
    xField: string,
    yField: string | null,
  ): string[] {
    const xFieldFormatted = this.formatFieldName(xField);
    const yFieldFormatted = yField ? this.formatFieldName(yField) : '';

    switch (chartType) {
      case 'pie':
        return [
          `Shows the distribution of ${xFieldFormatted} categories in your dataset`,
          'Helps identify the most and least common categories',
          'Useful for understanding data composition and proportions',
        ];
      case 'line':
        return [
          `Track ${yFieldFormatted} trends over ${xFieldFormatted}`,
          'Identify seasonal patterns and anomalies in the data',
          'Observe long-term growth or decline trends',
        ];
      case 'column':
        return [
          `Compare ${yFieldFormatted} across different ${xFieldFormatted} categories`,
          'Identify top and bottom performing categories',
          'Useful for category-based analysis and ranking',
        ];
      case 'scatter':
        return [
          `Examine relationship between ${xFieldFormatted} and ${yFieldFormatted}`,
          'Identify correlation patterns and potential outliers',
          'Useful for understanding variable relationships and dependencies',
        ];
      default:
        return [
          'Analyze patterns and trends in your data',
          'Identify key insights and outliers',
          'Make data-driven decisions based on visualizations',
        ];
    }
  }

  transformDataForChart(rowData: any[], chartConfig: ChartConfig): any[] {
    const { type, config, aggregation } = chartConfig;

    switch (type) {
      case 'pie':
        return this.transformForPieChart(rowData, config);
      case 'column':
      case 'bar':
        return this.transformForCategoricalChart(rowData, config, aggregation);
      case 'scatter':
        return this.transformForScatterChart(rowData, config);
      case 'line':
      case 'area':
        return this.transformForTimeSeriesChart(rowData, config);
      default:
        return this.transformGenericData(rowData, config);
    }
  }

  private transformForPieChart(rowData: any[], config: any): any[] {
    const { colorField } = config;
    if (!colorField) return [];

    const grouped: Record<string, number> = {};
    const total = rowData.length;

    rowData.forEach((row) => {
      const key = row[colorField];
      if (key) {
        grouped[key] = (grouped[key] || 0) + 1;
      }
    });

    return Object.entries(grouped).map(([key, count]) => ({
      [colorField]: key,
      count: count,
      percentage: Number(((count / total) * 100).toFixed(1)),
    }));
  }

  private transformForCategoricalChart(
    rowData: any[],
    config: any,
    aggregation: string = 'avg',
  ): any[] {
    const { xField, yField } = config;
    if (!xField || !yField) return [];

    const grouped: Record<string, number[]> = {};

    rowData.forEach((row) => {
      const key = row[xField];
      const value = Number(row[yField]);

      if (key && !isNaN(value)) {
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(value);
      }
    });

    return Object.entries(grouped)
      .map(([key, values]) => {
        let aggregatedValue: number;

        switch (aggregation) {
          case 'sum':
            aggregatedValue = values.reduce((a, b) => a + b, 0);
            break;
          case 'max':
            aggregatedValue = Math.max(...values);
            break;
          case 'min':
            aggregatedValue = Math.min(...values);
            break;
          case 'count':
            aggregatedValue = values.length;
            break;
          default: // 'avg'
            aggregatedValue = values.reduce((a, b) => a + b, 0) / values.length;
        }

        return {
          [xField]: key,
          [yField]: Number(aggregatedValue.toFixed(2)),
        };
      })
      .sort((a, b) => Number(b[yField]) - Number(a[yField]));
  }

  private transformForScatterChart(rowData: any[], config: any): any[] {
    const { xField, yField, colorField } = config;

    return rowData
      .filter((row) => row[xField] != null && row[yField] != null)
      .map((row) => ({
        [xField]: Number(row[xField]) || 0,
        [yField]: Number(row[yField]) || 0,
        ...(colorField && { [colorField]: row[colorField] }),
      }));
  }

  private transformForTimeSeriesChart(rowData: any[], config: any): any[] {
    const { xField, yField } = config;

    return rowData
      .filter((row) => row[xField] && row[yField])
      .map((row) => ({
        [xField]: row[xField],
        [yField]: Number(row[yField]) || 0,
      }))
      .sort(
        (a, b) => new Date(a[xField]).getTime() - new Date(b[xField]).getTime(),
      );
  }

  private transformGenericData(rowData: any[], config: any): any[] {
    return rowData.map((row) => {
      const transformed: any = {};
      Object.keys(row).forEach((key) => {
        const value = row[key];
        transformed[key] =
          typeof value === 'string' && !isNaN(Number(value)) && value !== ''
            ? Number(value)
            : value;
      });
      return transformed;
    });
  }

  private isDateColumn(values: any[]): boolean {
    const dateCount = values.filter((val) => {
      if (!val) return false;
      const dateObj = new Date(val);
      return !isNaN(dateObj.getTime()) && val.toString().length > 8;
    }).length;

    return dateCount / values.length > 0.6;
  }

  private isNumericalColumn(values: any[]): boolean {
    const numericCount = values.filter(
      (val) =>
        val !== null && val !== undefined && val !== '' && !isNaN(Number(val)),
    ).length;

    return numericCount / values.length > 0.7;
  }

  private getTopValues(rowData: any[], column: string, limit: number = 5) {
    const counts: Record<string, number> = {};

    rowData.forEach((row) => {
      const value = row[column];
      if (value != null) {
        counts[value] = (counts[value] || 0) + 1;
      }
    });

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));
  }

  private formatFieldName(fieldName: string): string {
    return fieldName
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .trim();
  }

  generateKPIs(chartConfig: ChartConfig, transformedData: any[]): any[] {
    const kpis: any[] = [];
    const { type, config } = chartConfig;

    try {
      switch (type) {
        case 'pie':
          if (config.colorField && transformedData.length > 0) {
            const mostCommon = transformedData.reduce((max, item) =>
              item.count > max.count ? item : max,
            );
            const totalCategories = transformedData.length;

            kpis.push(
              {
                label: 'Most Common Category',
                value: `${mostCommon[config.colorField]} (${mostCommon.percentage}%)`,
                type: 'text',
              },
              {
                label: 'Total Categories',
                value: totalCategories,
                type: 'number',
              },
            );
          }
          break;

        case 'line':
        case 'area':
          if (config.yField && transformedData.length > 0) {
            const values = transformedData
              .map((item) => Number(item[config.yField]))
              .filter((v) => !isNaN(v));
            if (values.length > 0) {
              const avg = values.reduce((a, b) => a + b, 0) / values.length;
              const min = Math.min(...values);
              const max = Math.max(...values);
              const range = max - min;

              kpis.push(
                {
                  label: 'Average Value',
                  value: avg.toFixed(2),
                  type: 'text',
                },
                {
                  label: 'Value Range',
                  value: `${min.toFixed(2)} - ${max.toFixed(2)}`,
                  type: 'text',
                },
              );
            }
          }
          break;

        case 'scatter':
          if (config.xField && config.yField && transformedData.length > 0) {
            const correlation = this.calculateCorrelation(
              transformedData,
              config.xField,
              config.yField,
            );
            kpis.push(
              {
                label: 'Correlation',
                value:
                  correlation > 0.7
                    ? 'Strong Positive'
                    : correlation > 0.3
                      ? 'Moderate Positive'
                      : correlation < -0.7
                        ? 'Strong Negative'
                        : correlation < -0.3
                          ? 'Moderate Negative'
                          : 'Weak',
                type: 'text',
              },
              {
                label: 'Data Points',
                value: transformedData.length,
                type: 'number',
              },
            );
          }
          break;

        case 'column':
        case 'bar':
          if (config.yField && transformedData.length > 0) {
            const values = transformedData
              .map((item) => Number(item[config.yField]))
              .filter((v) => !isNaN(v));
            if (values.length > 0) {
              const highest = transformedData.reduce((max, item) =>
                Number(item[config.yField]) > Number(max[config.yField])
                  ? item
                  : max,
              );

              kpis.push(
                {
                  label: 'Highest Value',
                  value: `${highest[config.xField]} (${Number(highest[config.yField]).toFixed(2)})`,
                  type: 'text',
                },
                {
                  label: 'Total Categories',
                  value: transformedData.length,
                  type: 'number',
                },
              );
            }
          }
          break;
      }
    } catch (error) {
      this.logger.warn('Error generating KPIs:', error.message);
    }

    return kpis;
  }

  private calculateCorrelation(
    data: any[],
    xField: string,
    yField: string,
  ): number {
    const pairs = data
      .filter(
        (row) => !isNaN(Number(row[xField])) && !isNaN(Number(row[yField])),
      )
      .map((row) => [Number(row[xField]), Number(row[yField])]);

    if (pairs.length < 2) return 0;

    const n = pairs.length;
    const sumX = pairs.reduce((sum, [x]) => sum + x, 0);
    const sumY = pairs.reduce((sum, [, y]) => sum + y, 0);
    const sumXY = pairs.reduce((sum, [x, y]) => sum + x * y, 0);
    const sumX2 = pairs.reduce((sum, [x]) => sum + x * x, 0);
    const sumY2 = pairs.reduce((sum, [, y]) => sum + y * y, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt(
      (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
    );

    return denominator === 0 ? 0 : numerator / denominator;
  }
}
