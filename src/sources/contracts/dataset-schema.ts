import type { FilterOperator } from './data-query.js';

export type FieldRole = 'dimension' | 'temporal' | 'measure';

export type FieldDataType = 'string' | 'number' | 'integer' | 'boolean';

export type MeasureSemanticType =
  'count' | 'currency_per_capita' | 'percentage' | 'temperature' | 'other';

export type MeasureOperation =
  'time_series' | 'period_change' | 'ranking' | 'sum' | 'average' | 'count';

export interface FieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly role: FieldRole;
  readonly dataType: FieldDataType;
  readonly nullable: boolean;
  readonly filterOperators: readonly FilterOperator[];
  readonly sortable: boolean;
}

export interface MeasureSelector {
  readonly field: string;
  readonly value: string;
}

export interface MeasureDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly valueField: string;
  readonly selector?: MeasureSelector;
  readonly unit: string;
  readonly semanticType: MeasureSemanticType;
  readonly allowedOperations: readonly MeasureOperation[];
}

export interface DatasetCapabilities {
  readonly filterOperators: readonly FilterOperator[];
  readonly supportsYearRange: boolean;
  readonly supportsFieldSelection: boolean;
  readonly searchableDimensions: readonly string[];
}

export interface DatasetSchema {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly temporalField: string;
  readonly keyFields: readonly string[];
  readonly fields: readonly FieldDefinition[];
  readonly measures: readonly MeasureDefinition[];
  readonly capabilities: DatasetCapabilities;
}

export interface DatasetSummary {
  readonly datasetId: string;
  readonly title: string;
  readonly description: string;
  readonly schemaVersion: number;
}

export interface DimensionValue {
  readonly value: string;
  readonly label: string;
}
