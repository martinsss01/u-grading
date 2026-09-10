"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

type Section = {
  id: string;
  semester: string;
  year: number;
  section_number: number;
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  status: string;
  due_date: string | null;
  section: Section;
  grade: number | null;
};

type CourseGroup = {
  course: { id: string; name: string; code: string };
  assignments: Assignment[];
};

const TYPE_ORDER = ["Tarea", "Ejercicio", "Control", "Examen"];

const TYPE_PLURAL: Record<string, string> = {
  Tarea: "Tareas",
  Ejercicio: "Ejercicios",
  Control: "Controles",
  Examen: "Exámenes",
};

function groupByType(assignments: Assignment[]): [string, Assignment[]][] {
  const map = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!map.has(a.type)) map.set(a.type, []);
    map.get(a.type)!.push(a);
  }
  return [...map.entries()].sort(
    ([a], [b]) => (TYPE_ORDER.indexOf(a) ?? 99) - (TYPE_ORDER.indexOf(b) ?? 99)
  );
}

const STATUS_COLORS: Record<string, string> = {
  Pendiente: "bg-grey/30 text-lemigrey",
  Abierto: "bg-green-500/20 text-green-400",
  Cerrado: "bg-red/20 text-red-400",
};

function formatDate(iso: string | null) {
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
function timeLeftLabel(dueIso: string, now: number): string {
  const diffMinutes = Math.floor((new Date(dueIso).getTime() - now) / 60000);
  if (diffMinutes <= 0) return "Venciendo";

  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function StudentAssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentAssignmentsContent />
    </Suspense>
  );
}

function StudentAssignmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId");
  const sectionId = searchParams.get("sectionId");
  const semester = searchParams.get("semester");
  const year = searchParams.get("year");
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  // Ticks once a minute so open assignments' countdowns stay live without a
  // page reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/");
      return;
    }
    const user = JSON.parse(raw) as { id: string };

    api
      .get<CourseGroup[]>(`/api/v1/assignments/student/${user.id}`)
      .then((res) => setGroups(res.data))
      .catch(() => setError("No se pudieron cargar las evaluaciones."))
      .finally(() => setLoading(false));
  }, [router]);

  const current = getCurrentSemester();
  const courseFiltered = courseId ? groups.filter((g) => g.course.id === courseId) : groups;
  const visibleGroups = courseFiltered
    .map((g) => ({
      ...g,
      assignments: (sectionId
        ? g.assignments.filter((a) => a.section.id === sectionId)
        : g.assignments.filter(
            (a) => a.section.semester === current.semester && a.section.year === current.year
          )
      ).filter((a) => typeFilter.length === 0 || typeFilter.includes(a.type)),
    }))
    // Only drop courses with nothing to show in the plain "current semester" view;
    // an explicitly selected course/section keeps showing even if empty.
    .filter((g) => courseId || g.assignments.length > 0);

  // All of a course's currently visible assignments share the same section
  // (the list above already filters to one semester/section), so any of them
  // gives the section/semester/year to show in the course header. When the
  // visible list is filtered down to nothing (e.g. a course explicitly
  // selected but with no assignments this semester), fall back to the
  // unfiltered groups instead.
  function sectionForCourse(courseId: string, visibleAssignments: Assignment[]) {
    return (
      visibleAssignments[0]?.section ??
      groups.find((g) => g.course.id === courseId)?.assignments[0]?.section
    );
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-baseline gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative size-7 shrink-0">
              <Image src="/images/Evaluations.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
            </span>
            <h1 className="text-2xl font-bold text-white">Mis Evaluaciones</h1>
          </div>
          {semester && year && (
            <span className="text-sm text-demigrey">
              {semester} {year}
            </span>
          )}
          <Combobox multiple value={typeFilter} onValueChange={setTypeFilter}>
            <ComboboxTrigger className="flex items-center gap-1.5 rounded-md bg-darkergrey px-3 py-2 text-sm text-white transition-colors hover:bg-darkergrey/70 focus-visible:border-red/50 focus-visible:ring-red/20">
              <ComboboxValue placeholder="Todos los tipos">
                {(value: string[]) =>
                  value.length === 0 ? "Todos los tipos" : `Tipo (${value.length})`
                }
              </ComboboxValue>
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxList>
                {TYPE_ORDER.map((type) => (
                  <ComboboxItem key={type} value={type}>
                    {TYPE_PLURAL[type] ?? type}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          {typeFilter.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-demigrey hover:text-white"
              onClick={() => setTypeFilter([])}
              aria-label="Limpiar filtro de tipos"
            >
              <XIcon />
            </Button>
          )}
        </div>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {!loading && !error && visibleGroups.length === 0 && (
          <P className="text-demigrey">No estás inscrito en ninguna sección con evaluaciones.</P>
        )}

        <div className="space-y-6">
          {visibleGroups.map(({ course, assignments }) => {
            const section = sectionForCourse(course.id, assignments);
            return (
            <section key={course.id} className="rounded-lg bg-darkgrey shadow-lg">
              <div className="rounded-t-lg bg-darkergrey px-6 py-4">
                <h2 className="text-lg font-bold text-white">{course.name}</h2>
                <P className="mt-0.5 text-sm text-demigrey">
                  {courseCodeLabel(course, section?.section_number)}
                  {section && ` · ${section.semester} ${section.year}`}
                </P>
              </div>

              {assignments.length === 0 ? (
                <P className="px-6 py-4 text-sm text-demigrey">Sin evaluaciones.</P>
              ) : (
                <div className="divide-y divide-grey/20">
                  {groupByType(assignments).map(([type, items]) => (
                    <div key={type}>
                      <div className="flex items-center gap-4 px-6 pt-4 pb-2">
                        <P className="flex-1 text-xs font-semibold uppercase tracking-widest text-demigrey">
                          {TYPE_PLURAL[type] ?? type}
                        </P>
                        <span className="w-10 text-right text-xs uppercase tracking-widest text-demigrey">Nota</span>
                        <span className="w-28 shrink-0 text-center text-xs uppercase tracking-widest text-demigrey">Estado</span>
                        <span className="w-4" />
                      </div>
                      <ul>
                        {items.map((a) => (
                          <li key={a.id}>
                            <button
                              onClick={() => router.push(`/student-assignments/${a.id}`)}
                              className="group flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-darkergrey/50"
                            >
                              <div className="flex-1">
                                <P className="font-medium text-white group-hover:text-white">{a.title}</P>
                                {a.due_date && (
                                  <P className="mt-0.5 text-xs text-demigrey">
                                    Entrega: {formatDate(a.due_date)}
                                    {a.status === "Abierto" && (
                                      <span className="ml-2 rounded-full bg-red/20 px-2 py-0.5 text-xs font-medium text-white">
                                        Quedan {timeLeftLabel(a.due_date, now)}
                                      </span>
                                    )}
                                  </P>
                                )}
                              </div>
                              <span className="w-10 text-right text-sm text-white">
                                {a.grade != null ? a.grade.toFixed(1) : "—"}
                              </span>
                              <span
                                className={`w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-grey/20 text-lemigrey"}`}
                              >
                                {a.status}
                              </span>
                              <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
