export type SortDirection = 'asc' | 'desc';

export function compareText(a?: string, b?: string): number {
  return (a || '').localeCompare(b || '');
}

export function compareBoolean(a: boolean, b: boolean): number {
  return Number(a) - Number(b);
}

export function toggleSortState<T extends string>(
  currentField: T,
  currentDirection: SortDirection,
  requestedField: T,
): { field: T; direction: SortDirection } {
  if (currentField === requestedField) {
    return {
      field: currentField,
      direction: currentDirection === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    field: requestedField,
    direction: 'asc',
  };
}

export function getSortIcon<T extends string>(
  activeField: T,
  activeDirection: SortDirection,
  field: T,
): string {
  if (activeField !== field) {
    return 'pi-sort-alt text-slate-400';
  }

  return activeDirection === 'asc'
    ? 'pi-sort-amount-up-alt text-blue-600'
    : 'pi-sort-amount-down text-blue-600';
}
