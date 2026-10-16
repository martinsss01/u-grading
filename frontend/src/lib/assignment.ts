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

export function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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
