// src/modules/ai/dto/analyze-data.dto.ts
import {
  IsOptional,
  IsNumber,
  IsString,
  IsArray,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnalyzeDataDto {
  @ApiProperty({
    description: 'History ID to analyze data from',
    required: false,
    example: 1,
  })
  @IsOptional()
  @IsString()
  historyId?: string;

  @ApiProperty({
    description: 'Specific chart type to generate',
    required: false,
    enum: [
      'line',
      'column',
      'bar',
      'area',
      'pie',
      'scatter',
      'heatmap',
      'radar',
      'funnel',
      'gauge',
    ],
    example: 'line',
  })
  @IsOptional()
  @IsString()
  chartType?: string;

  @ApiProperty({
    description: 'Custom data array instead of using history',
    required: false,
    example: [
      { name: 'Jan', value: 100 },
      { name: 'Feb', value: 200 },
    ],
  })
  @IsOptional()
  @IsArray()
  customData?: any[];

  // Validate that either historyId or customData is provided
  //   @ValidateIf((o) => !o.customData || o.customData.length === 0)
  //   @IsNumber(
  //     {},
  //     { message: 'historyId is required when customData is not provided' },
  //   )
  //   historyIdValidation?: number;
}
