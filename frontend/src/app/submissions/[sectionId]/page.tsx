"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

type Answer = {
  id: string;
  question_id: string;
  grade: number | null;
  graded_at: string | null;
};

type Submission = {
  id: string;
  file_path: string;
  needs_checking: boolean;
  answers: Answer[];
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

function averageGrade(answers: Answer[]): string {
  if (answers.length === 0) return "—";
  const graded = answers.filter((a) => a.grade !== null);
  if (graded.length === 0) return "Sin calificar";
  const total = graded.reduce((sum, a) => sum + (a.grade ?? 0), 0);
  return (total / graded.length).toFixed(1);
}

export default function SectionSubmissionsPage() {
  const router = useRouter();
  const { sectionId } = useParams<{ sectionId: string }>();
  const [data, setData] = useState<SectionSubmissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.back()}
          className="mb-6 text-sm text-demigrey transition-colors hover:text-white"
        >
          ← Volver
        </button>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {data && (
          <>
            {/* Same shell as "Mis Evaluaciones" (icon + title) so this reads as
                that section's evaluations appended below, not a separate page. */}
            <div className="mb-8 flex items-baseline gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative size-7 shrink-0">
                  <Image src="/images/Evaluations.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
                </span>
                <h1 className="text-2xl font-bold text-white">Mis Evaluaciones</h1>
              </div>
              <span className="text-sm text-demigrey">
                {data.section.course.name} · {data.section.course.code} · {data.section.semester} {data.section.year}
              </span>
            </div>

            {data.assignments.length === 0 && (
              <P className="text-demigrey">No hay evaluaciones en esta sección.</P>
            )}

            <div className="space-y-10">
              {groupByType(data.assignments).map(([type, assignments]) => (
                <div key={type}>
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-demigrey">
                    {TYPE_PLURAL[type] ?? type}
                  </h2>
                  <div className="space-y-4">
                    {assignments.map((assignment) => (
                      <section key={assignment.id} className="rounded-lg bg-darkgrey shadow-lg">
                        <div className="flex items-baseline gap-3 rounded-t-lg bg-darkergrey px-6 py-4">
                          <h3 className="font-bold text-white">{assignment.title}</h3>
                          <span className="ml-auto text-xs text-demigrey">
                            {assignment.submissions.length} entrega{assignment.submissions.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {assignment.submissions.length === 0 ? (
                          <P className="px-6 py-4 text-sm text-demigrey">Sin entregas.</P>
                        ) : (
                          <ul className="divide-y divide-grey/20">
                            {assignment.submissions.map((sub, idx) => (
                              <li key={sub.id} className="flex items-center gap-4 px-6 py-4">
                                <span className="w-8 text-sm text-demigrey">#{idx + 1}</span>
                                <div className="flex-1">
                                  <P className="font-mono text-xs text-demigrey">{sub.file_path}</P>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    sub.needs_checking
                                      ? "bg-red/20 text-red"
                                      : "bg-grey/20 text-lemigrey"
                                  }`}
                                >
                                  {sub.needs_checking ? "Por revisar" : "Revisado"}
                                </span>
                                <span className="w-20 text-right text-sm text-white">
                                  {averageGrade(sub.answers)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
