export type DataValue = string | number | boolean | null;

export type FilterValue = Exclude<DataValue, null>;

export type FilterOperator = 'eq' | 'in';

export interface EqualFilter {
  readonly field: string;
  readonly operator: 'eq';
  readonly value: FilterValue;
}

export interface InFilter {
  readonly field: string;
  readonly operator: 'in';
  readonly value: readonly FilterValue[];
}

export type DataFilter = EqualFilter | InFilter;

export interface DataPeriod {
  readonly field: string;
  readonly fromYear: number;
  readonly toYear: number;
}

export interface DataQuery {
  readonly sourceId: string;
  readonly datasetId: string;
  readonly schemaVersion: number;
  readonly filters: readonly DataFilter[];
  readonly period: DataPeriod;
  readonly fields: readonly string[];
}
