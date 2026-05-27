export type TimestampKind = 'created' | 'updated';

type TimestampRecord = {
  created?: unknown;
  created_at?: unknown;
  createdAt?: unknown;
  updated?: unknown;
  updated_at?: unknown;
  updatedAt?: unknown;
};

export function resolveTimestamp(record: TimestampRecord, kind: TimestampKind): string {
  if (kind === 'created') {
    return String(record.created || record.created_at || record.createdAt || '');
  }

  return String(record.updated || record.updated_at || record.updatedAt || '');
}

export function normalizeDateString(value: string): string {
  const source = String(value || '').trim();
  if (!source) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2} /.test(source)) {
    return source.replace(' ', 'T');
  }

  return source;
}

export function formatDateTime(value?: string): string {
  if (!value) {
    return '-';
  }

  const parsed = new Date(normalizeDateString(value));
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : '-';
}
