"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { courseCodeLabel } from "@/lib/course";
import { RoleIcon } from "@/components/role-icon";
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

type Submission = {
  id: string;
  needs_checking: boolean;
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  submissions: Submission[];
};

type SectionSubmissions = {
  section: {
    id: string;
    semester: string;
    year: number;
    section_number: number;
    course: { id: string; name: string; code: string };
  };
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

export default function SectionSubmissionsPage() {
  const router = useRouter();
  const { sectionId } = useParams<{ sectionId: string }>();
  const [data, setData] = useState<SectionSubmissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);

  useEffect(() => {
    if (!localStorage.getItem("user")) {
      router.push("/");
      return;
    }

    api
      .get<SectionSubmissions>(`/api/v1/submissions/section/${sectionId}`)
      .then((res) => setData(res.data))
      .catch(() => setError("No se pudieron cargar las entregas."))
      .finally(() => setLoading(false));
  }, [sectionId, router]);

  const filteredAssignments = data
    ? data.assignments.filter((a) => typeFilter.length === 0 || typeFilter.includes(a.type))
    : [];

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-2.5">
          <RoleIcon role="Ayudante" className="size-7 shrink-0 object-contain" />
          <h1 className="text-2xl font-bold text-white">Entregas</h1>

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

        {data && (
          <section className="rounded-lg bg-darkgrey shadow-lg">
            <div className="rounded-t-lg bg-darkergrey px-6 py-4">
              <h2 className="text-lg font-bold text-white">{data.section.course.name}</h2>
              <P className="mt-0.5 text-sm text-demigrey">
                {courseCodeLabel(data.section.course, data.section.section_number)} · {data.section.semester} {data.section.year}
              </P>
            </div>

            {filteredAssignments.length === 0 ? (
              <P className="px-6 py-4 text-sm text-demigrey">
                {data.assignments.length === 0
                  ? "No hay evaluaciones en esta sección."
                  : "No hay evaluaciones que coincidan con el filtro."}
              </P>
            ) : (
              <div className="divide-y divide-grey/20">
                {groupByType(filteredAssignments).map(([type, assignments]) => (
                  <div key={type}>
                    <P className="px-6 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest text-demigrey">
                      {TYPE_PLURAL[type] ?? type}
                    </P>
                    <ul>
                      {assignments.map((assignment) => {
                        const pending = assignment.submissions.filter((s) => s.needs_checking).length;
                        return (
                          <li key={assignment.id}>
                            <button
                              onClick={() => router.push(`/submissions/${sectionId}/${assignment.id}`)}
                              className="group flex w-full items-center gap-4 px-6 py-3 text-left transition-colors hover:bg-darkergrey/50"
                            >
                              <h3 className="flex-1 font-medium text-white group-hover:text-white">{assignment.title}</h3>
                              <span className="text-xs text-demigrey">
                                {assignment.submissions.length} entrega{assignment.submissions.length !== 1 ? "s" : ""}
                              </span>
                              {pending > 0 && (
                                <span className="rounded-full bg-red/20 px-2.5 py-0.5 text-xs font-medium text-red-400">
                                  {pending} por revisar
                                </span>
                              )}
                              <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
