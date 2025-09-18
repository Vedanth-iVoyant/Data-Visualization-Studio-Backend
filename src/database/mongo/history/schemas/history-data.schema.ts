// src/database/mongo/history/schemas/history-data.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
  collection: 'history_data',
  versionKey: false,
})
export class HistoryData extends Document {
  @Prop({
    required: true,
    unique: true,
    index: true,
  })
  mongoId: string; // UUID that matches Postgres History.mongoId

  @Prop({
    required: true,
    index: true,
  })
  userId: number; // UUID that matches Postgres User.id

  @Prop({ required: true })
  fileName: string;

  @Prop({
    type: [Object],
    required: true,
    validate: {
      validator: function (v: any[]) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'colDefs must be a non-empty array',
    },
  })
  colDefs: Record<string, any>[];

  @Prop({
    type: [Object],
    required: true,
    validate: {
      validator: function (v: any[]) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'rowData must be a non-empty array',
    },
  })
  rowData: Record<string, any>[];

  @Prop({
    type: Object,
    default: null,
  })
  aiResponse: any;

  @Prop({
    type: Object,
    default: {},
  })
  metadata: {
    fileSize?: number;
    rowCount?: number;
    columnCount?: number;
    processingTime?: number;
    [key: string]: any;
  };

  // Timestamps are automatically added by Mongoose
  createdAt: Date;
  updatedAt: Date;
}

export const HistoryDataSchema = SchemaFactory.createForClass(HistoryData);

// Add indexes for better query performance
HistoryDataSchema.index({ userId: 1, createdAt: -1 });
HistoryDataSchema.index({ mongoId: 1 }, { unique: true });
