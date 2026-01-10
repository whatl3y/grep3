export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0f');
}

export function moveCursorToTop(): void {
  process.stdout.write('\x1B[H');
}

export function hideCursor(): void {
  process.stdout.write('\x1B[?25l');
}

export function showCursor(): void {
  process.stdout.write('\x1B[?25h');
}
