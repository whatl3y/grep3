import { ScoreboardRow } from '../types';

function padRight(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : ' '.repeat(len - str.length) + str;
}

interface ColumnConfig {
  header: string;
  key: keyof ScoreboardRow;
  width: number;
  align: 'left' | 'right';
}

const COLUMNS: ColumnConfig[] = [
  { header: 'Status', key: 'status', width: 10, align: 'left' },
  { header: 'Away', key: 'awayTeam', width: 6, align: 'left' },
  { header: 'Score', key: 'awayScore', width: 5, align: 'right' },
  { header: 'Home', key: 'homeTeam', width: 6, align: 'left' },
  { header: 'Score', key: 'homeScore', width: 5, align: 'right' },
  { header: 'Detail', key: 'detail', width: 18, align: 'left' },
];

function formatCell(value: string, col: ColumnConfig): string {
  return col.align === 'right' ? padLeft(value, col.width) : padRight(value, col.width);
}

function createSeparator(): string {
  return '+' + COLUMNS.map((col) => '-'.repeat(col.width + 2)).join('+') + '+';
}

function createRow(values: string[]): string {
  return (
    '|' +
    values
      .map((val, i) => {
        const col = COLUMNS[i];
        return ' ' + formatCell(val, col) + ' ';
      })
      .join('|') +
    '|'
  );
}

export function renderTable(rows: ScoreboardRow[]): string {
  const lines: string[] = [];
  const separator = createSeparator();

  lines.push(separator);
  lines.push(createRow(COLUMNS.map((col) => col.header)));
  lines.push(separator);

  for (const row of rows) {
    const values = COLUMNS.map((col) => row[col.key]);
    lines.push(createRow(values));
  }

  lines.push(separator);

  return lines.join('\n');
}

export function renderNoGames(): string {
  return '\nNo games scheduled for this date.\n\nTip: Try a different date with --date YYYYMMDD\n';
}
