import type { CalendarEventType } from "@/lib/instructor/mock-data";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isoToday(): string {
  return toISODate(new Date());
}

// Parses "YYYY-MM-DD" as a local date, avoiding the UTC-midnight shift of `new Date(iso)`.
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function addMonths(
  year: number,
  month: number,
  delta: number
): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export type CalendarCell = { iso: string; day: number; inCurrentMonth: boolean };

// Monday-start 6x7 grid covering the full month plus leading/trailing days.
export function getMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const mondayIndex = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(year, month, 1 - mondayIndex);

  return Array.from({ length: 42 }, (_, i) => {
    const cellDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return {
      iso: toISODate(cellDate),
      day: cellDate.getDate(),
      inCurrentMonth: cellDate.getMonth() === month,
    };
  });
}

export const TYPE_LABEL: Record<CalendarEventType, string> = {
  "live-talk": "Live talk",
  "office-hours": "Office hours",
  "new-unit": "New unit",
  "cohort-launch": "Cohort launch",
};

export const TYPE_STYLE: Record<CalendarEventType, string> = {
  "live-talk": "bg-red-100 text-red-700",
  "office-hours": "bg-gray-100 text-gray-600",
  "new-unit": "bg-blue-100 text-blue-700",
  "cohort-launch": "bg-purple-100 text-purple-700",
};
