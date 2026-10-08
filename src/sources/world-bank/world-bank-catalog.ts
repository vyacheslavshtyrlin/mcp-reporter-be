import type {
  DatasetSchema,
  DatasetSummary,
  MeasureDefinition,
} from '../contracts/index.js';

export const WORLD_BANK_SOURCE_ID = 'world-bank';
export const WORLD_BANK_DATASET_ID = '2';
export const WORLD_BANK_SCHEMA_VERSION = 1;

export const WORLD_BANK_RECORD_FIELDS = [
  'sourceId',
  'sourceDatasetId',
  'countryCode',
  'indicatorCode',
  'year',
  'value',
] as const;

export const WORLD_BANK_MEASURES = [
  {
    id: 'SP.POP.TOTL',
    label: 'Население',
    description:
      'Общая численность постоянного населения; значения являются оценками на середину года.',
    valueField: 'value',
    selector: { field: 'indicatorCode', value: 'SP.POP.TOTL' },
    unit: 'человек',
    semanticType: 'count',
    allowedOperations: ['time_series', 'period_change', 'ranking', 'count'],
  },
  {
    id: 'NY.GDP.PCAP.CD',
    label: 'ВВП на душу населения',
    description:
      'ВВП на душу населения в текущих долларах США, без поправки на изменение цен или ППС.',
    valueField: 'value',
    selector: { field: 'indicatorCode', value: 'NY.GDP.PCAP.CD' },
    unit: 'текущий доллар США на человека',
    semanticType: 'currency_per_capita',
    allowedOperations: ['time_series', 'period_change', 'ranking', 'count'],
  },
  {
    id: 'NY.GDP.MKTP.KD.ZG',
    label: 'Рост ВВП',
    description:
      'Годовое процентное изменение ВВП в постоянных ценах, выраженного в долларах США.',
    valueField: 'value',
    selector: { field: 'indicatorCode', value: 'NY.GDP.MKTP.KD.ZG' },
    unit: 'процент в год',
    semanticType: 'percentage',
    allowedOperations: ['time_series', 'period_change', 'ranking', 'count'],
  },
  {
    id: 'FP.CPI.TOTL.ZG',
    label: 'Инфляция потребительских цен',
    description:
      'Годовое процентное изменение стоимости потребительской корзины.',
    valueField: 'value',
    selector: { field: 'indicatorCode', value: 'FP.CPI.TOTL.ZG' },
    unit: 'процент в год',
    semanticType: 'percentage',
    allowedOperations: ['time_series', 'period_change', 'ranking', 'count'],
  },
  {
    id: 'SL.UEM.TOTL.ZS',
    label: 'Безработица',
    description:
      'Доля рабочей силы без работы, доступной для работы и ищущей её; моделируемая оценка ILO.',
    valueField: 'value',
    selector: { field: 'indicatorCode', value: 'SL.UEM.TOTL.ZS' },
    unit: 'процент рабочей силы',
    semanticType: 'percentage',
    allowedOperations: ['time_series', 'period_change', 'ranking', 'count'],
  },
] as const satisfies readonly MeasureDefinition[];

export const WORLD_BANK_DATASET_SUMMARY = {
  datasetId: WORLD_BANK_DATASET_ID,
  title: 'World Development Indicators',
  description:
    'Проверенный поднабор годовых показателей стран из World Development Indicators.',
  schemaVersion: WORLD_BANK_SCHEMA_VERSION,
} as const satisfies DatasetSummary;

export const WORLD_BANK_DATASET_SCHEMA = {
  sourceId: WORLD_BANK_SOURCE_ID,
  datasetId: WORLD_BANK_DATASET_ID,
  version: WORLD_BANK_SCHEMA_VERSION,
  title: WORLD_BANK_DATASET_SUMMARY.title,
  description: WORLD_BANK_DATASET_SUMMARY.description,
  temporalField: 'year',
  keyFields: ['countryCode', 'indicatorCode', 'year'],
  fields: [
    {
      name: 'sourceId',
      label: 'Идентификатор источника',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: [],
      sortable: false,
    },
    {
      name: 'sourceDatasetId',
      label: 'Идентификатор набора в источнике',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: [],
      sortable: false,
    },
    {
      name: 'countryCode',
      label: 'Код страны ISO 3166-1 alpha-3',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: ['eq', 'in'],
      sortable: true,
    },
    {
      name: 'indicatorCode',
      label: 'Код показателя World Bank',
      role: 'dimension',
      dataType: 'string',
      nullable: false,
      filterOperators: ['eq', 'in'],
      sortable: true,
    },
    {
      name: 'year',
      label: 'Год',
      role: 'temporal',
      dataType: 'integer',
      nullable: false,
      filterOperators: [],
      sortable: true,
    },
    {
      name: 'value',
      label: 'Значение показателя',
      role: 'measure',
      dataType: 'number',
      nullable: true,
      filterOperators: [],
      sortable: true,
    },
  ],
  measures: WORLD_BANK_MEASURES,
  capabilities: {
    filterOperators: ['eq', 'in'],
    supportsYearRange: true,
    supportsFieldSelection: false,
    searchableDimensions: ['countryCode'],
  },
} as const satisfies DatasetSchema;
