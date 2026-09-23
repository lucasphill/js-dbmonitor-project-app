/** Shared display formatting. Missing or non-finite values are never rendered as zero. */
export type OptionalNumber = number | null | undefined
export type OptionalInstant = string | number | Date | null | undefined

const locale = "pt-BR"
const unavailable = "Indisponível"

function finite(value: OptionalNumber): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function instant(value: OptionalInstant): Date | null {
  if (value == null || value === "") return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatNumber(
  value: OptionalNumber,
  options: Intl.NumberFormatOptions = {},
): string {
  if (!finite(value)) return unavailable
  return new Intl.NumberFormat(locale, options).format(value)
}

export function formatPercent(value: OptionalNumber, digits = 1): string {
  if (!finite(value)) return unavailable
  return `${formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`
}

/** Includes an explicit UTC offset so server and local timestamps remain distinguishable. */
export function formatTimestamp(
  value: OptionalInstant,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const date = instant(value)
  if (!date) return unavailable

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "shortOffset",
    }).format(date)
  } catch (error) {
    if (error instanceof RangeError) return unavailable
    throw error
  }
}

/** Relative time from a sample/event timestamp; future times expose clock skew. */
export function formatAge(value: OptionalInstant, now: Date = new Date()): string {
  const date = instant(value)
  if (!date || !Number.isFinite(now.getTime())) return unavailable

  const elapsed = now.getTime() - date.getTime()
  const absoluteSeconds = Math.floor(Math.abs(elapsed) / 1_000)
  if (absoluteSeconds < 5) return "agora"

  const unit =
    absoluteSeconds < 60
      ? `${absoluteSeconds} s`
      : absoluteSeconds < 3_600
        ? `${Math.floor(absoluteSeconds / 60)} min`
        : absoluteSeconds < 86_400
          ? `${Math.floor(absoluteSeconds / 3_600)} h`
          : `${Math.floor(absoluteSeconds / 86_400)} d`

  return elapsed >= 0 ? `há ${unit}` : `em ${unit}`
}

/** Durations are milliseconds at the IPC boundary. */
export function formatDuration(milliseconds: OptionalNumber): string {
  if (!finite(milliseconds) || milliseconds < 0) return unavailable
  if (milliseconds < 1_000) {
    return `${formatNumber(milliseconds, { maximumFractionDigits: milliseconds < 10 ? 1 : 0 })} ms`
  }

  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${formatNumber(seconds, { maximumFractionDigits: 1 })} s`

  const wholeSeconds = Math.floor(seconds)
  const hours = Math.floor(wholeSeconds / 3_600)
  const minutes = Math.floor((wholeSeconds % 3_600) / 60)
  const remainingSeconds = wholeSeconds % 60
  return hours > 0
    ? `${hours} h ${String(minutes).padStart(2, "0")} min ${String(remainingSeconds).padStart(2, "0")} s`
    : `${minutes} min ${String(remainingSeconds).padStart(2, "0")} s`
}

/** Uses binary units for SQLite file and PostgreSQL storage sizes. */
export function formatBytes(bytes: OptionalNumber): string {
  if (!finite(bytes) || bytes < 0) return unavailable
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
  if (bytes === 0) return "0 B"
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1_024)), units.length - 1)
  const scaled = bytes / 1_024 ** unitIndex
  return `${formatNumber(scaled, { maximumFractionDigits: unitIndex === 0 ? 0 : 1 })} ${units[unitIndex]}`
}

/** PostgreSQL database sizes use decimal MB/GB in the inventory. */
export function formatDatabaseSize(bytes: OptionalNumber): string {
  if (!finite(bytes) || bytes < 0) return unavailable
  const gigabyte = 1_000_000_000
  const unit = bytes >= gigabyte ? "GB" : "MB"
  const divisor = bytes >= gigabyte ? gigabyte : 1_000_000
  return `${formatNumber(bytes / divisor, { maximumFractionDigits: 1 })} ${unit}`
}
