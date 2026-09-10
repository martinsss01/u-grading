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
