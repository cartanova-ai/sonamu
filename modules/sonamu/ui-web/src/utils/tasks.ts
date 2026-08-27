export const STATUS_STYLES = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  running: "bg-blue-100 text-blue-800 border-blue-200",
  sleeping: "bg-purple-100 text-purple-800 border-purple-200",
  succeeded: "bg-green-100 text-green-800 border-green-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  paused: "bg-orange-100 text-orange-800 border-orange-200",
  canceled: "bg-gray-100 text-gray-800 border-gray-200",
} satisfies Record<string, string>;

export function formatDateTime(dateStr: string | null, locale?: string): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString(locale ?? "ko", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt) return "-";
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const diffMs = end - start;

  if (diffMs < 1000) return `${diffMs}ms`;
  if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s`;
  if (diffMs < 3_600_000) {
    const m = Math.floor(diffMs / 60_000);
    const s = Math.floor((diffMs % 60_000) / 1000);
    return `${m}m ${s}s`;
  }
  const h = Math.floor(diffMs / 3_600_000);
  const m = Math.floor((diffMs % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}
