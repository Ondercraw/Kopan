import { Injectable } from '@angular/core';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

@Injectable({ providedIn: 'root' })
export class CsvExportService {
  download<T>(baseName: string, rows: T[], columns: CsvColumn<T>[]): void {
    const lines = [
      columns.map((column) => this.escape(column.header)).join(';'),
      ...rows.map((row) => columns.map((column) => this.escape(column.value(row))).join(';')),
    ];
    const date = new Intl.DateTimeFormat('sv-SE').format(new Date());
    const blob = new Blob([`\ufeff${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}-${date}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private escape(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }
}
