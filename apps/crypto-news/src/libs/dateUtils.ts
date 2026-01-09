/**
 * Get today's date in UTC as YYYY-MM-DD string
 */
export function getTodayUTC(): string {
  const now = new Date();
  return formatDateToString(now);
}

/**
 * Format a Date object to YYYY-MM-DD string (UTC)
 */
export function formatDateToString(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to a Date object
 */
export function parseDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Add days to a date string
 */
export function addDays(dateString: string, days: number): string {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateToString(date);
}

/**
 * Subtract days from a date string
 */
export function subtractDays(dateString: string, days: number): string {
  return addDays(dateString, -days);
}

/**
 * Format date for display (e.g., "January 9, 2026")
 */
export function formatDateForDisplay(dateString: string): string {
  const date = parseDate(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Format date and time for display (e.g., "January 9, 2026 at 3:45 PM")
 */
export function formatDateTimeForDisplay(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Validate a date string is in YYYY-MM-DD format
 */
export function isValidDateString(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const date = parseDate(dateString);
  return !isNaN(date.getTime());
}

/**
 * Get the summary date for a given timestamp
 * (The UTC date the news should be grouped under)
 */
export function getSummaryDateForTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return formatDateToString(date);
}
