import type { AdminAiScheduleConfiguration } from "./automationRepository.js";

const parts = (date: Date, timezone: string) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short", hour12: false }).formatToParts(date).filter((item) => item.type !== "literal").map((item) => [item.type, item.value]));
const localKey = (date: Date, timezone: string) => { const item = parts(date, timezone); return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}`; };
const weekday = (date: Date, timezone: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts(date, timezone).weekday);

export function nextAdminAiScheduleRun(configuration: AdminAiScheduleConfiguration, timezone: string, after: Date, previous?: Date): Date {
  if (configuration.kind === "FIXED_INTERVAL") return new Date((previous ?? after).getTime() + configuration.intervalMinutes * 60_000);
  const start = new Date(after.getTime() + 60_000 - (after.getTime() % 60_000));
  const wanted = configuration.localTime;
  for (let offset = 0; offset <= 8 * 24 * 60; offset += 1) {
    const candidate = new Date(start.getTime() + offset * 60_000);
    if (localKey(candidate, timezone).slice(11) !== wanted) continue;
    if (configuration.kind === "WEEKLY" && !configuration.weekdays.includes(weekday(candidate, timezone))) continue;
    return candidate;
  }
  throw Object.assign(new Error("A future automation schedule could not be calculated."), { code: "INVALID_ADMIN_AI_AUTOMATION", status: 400 });
}

export function adminAiScheduleOccurrenceKey(automationId: string, dueAt: Date) { return `schedule:${automationId}:${dueAt.toISOString()}`; }
