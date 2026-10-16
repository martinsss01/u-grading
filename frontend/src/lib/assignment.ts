/** Mirrors the backend's compute_status (backend/app/models/assignment.py)
 * exactly, so pages that already keep a ticking "now" for their due-date
 * countdown can also flip Pendiente/Abierto/Cerrado live between fetches,
 * instead of being frozen at whatever the server returned on page load. */
export function computeAssignmentStatus(
  openDate: string | null,
  dueDate: string | null,
  now: number
): "Pendiente" | "Abierto" | "Cerrado" {
  if (openDate && now < new Date(openDate).getTime()) return "Pendiente";
  if (dueDate && now >= new Date(dueDate).getTime()) return "Cerrado";
  return "Abierto";
}

export const TYPE_ORDER = ["Tarea", "Ejercicio", "Control", "Examen"];

export const TYPE_PLURAL: Record<string, string> = {
  Tarea: "Tareas",
  Ejercicio: "Ejercicios",
  Control: "Controles",
  Examen: "Exámenes",
};

export function groupByType<T extends { type: string }>(assignments: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const a of assignments) {
    if (!map.has(a.type)) map.set(a.type, []);
    map.get(a.type)!.push(a);
  }
  return [...map.entries()].sort(
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99)
  );
}

export const STATUS_COLORS: Record<string, string> = {
  Pendiente: "bg-grey/30 text-lemigrey",
  Abierto: "bg-green-500/20 text-green-400",
  Cerrado: "bg-red/20 text-red-400",
};

// "DD-MM-YYYY HH:MM", e.g. "28-10-2026 23:59".
export function formatDate(iso: string | null) {
  if (!iso) return null;
  return `${dayLabel(iso)} ${timeLabel(iso)}`;
}

// "DD-MM-YYYY", e.g. "28-10-2026".
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

// Human-readable countdown to a due date, e.g. "2d 5h" or "45m". Only ever
// shown for "Abierto" assignments, so a non-positive diff (due date passed
// but the backend hasn't flipped the status to "Cerrado" yet) reads as
// "Venciendo" rather than a confusing negative duration.
export function timeLeftLabel(dueIso: string, now: number): string {
  const diffMinutes = Math.floor((new Date(dueIso).getTime() - now) / 60000);
  if (diffMinutes <= 0) return "Venciendo";

  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

// Length of an in-person evaluation, e.g. "1,5 h".
export function durationLabel(openIso: string, dueIso: string): string {
  const hours = (new Date(dueIso).getTime() - new Date(openIso).getTime()) / 3_600_000;
  return `${hours.toLocaleString("es-CL", { maximumFractionDigits: 2 })} h`;
}

// Clock time as HH:MM, e.g. "16:00".
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// When an in-person evaluation is taken, e.g. "20-10-2026 14:30 - 1,5 h".
export function inPersonLabel(openIso: string, dueIso: string): string {
  return `${formatDate(openIso)} - ${durationLabel(openIso, dueIso)}`;
}
