"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

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
        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {data && (
          <>
            <div className="mb-8 flex items-baseline gap-3">
              <div className="flex items-center gap-2.5">
                <span className="relative size-7 shrink-0">
                  <Image src="/images/Ayudante.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
                </span>
                <h1 className="text-2xl font-bold text-white">Mis Ayudantías</h1>
              </div>
              <button
                onClick={() => router.push("/submissions")}
                className="text-sm text-demigrey transition-colors hover:text-white"
              >
                Ver todas
              </button>
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
                    {assignments.map((assignment) => {
                      const pending = assignment.submissions.filter((s) => s.needs_checking).length;
                      return (
                        <button
                          key={assignment.id}
                          onClick={() => router.push(`/submissions/${sectionId}/${assignment.id}`)}
                          className="flex w-full items-center gap-3 rounded-lg bg-darkgrey px-6 py-4 text-left shadow-lg transition-colors hover:bg-darkgrey/80"
                        >
                          <h3 className="font-bold text-white">{assignment.title}</h3>
                          <span className="ml-auto text-xs text-demigrey">
                            {assignment.submissions.length} entrega{assignment.submissions.length !== 1 ? "s" : ""}
                          </span>
                          {pending > 0 && (
                            <span className="rounded-full bg-red/20 px-2.5 py-0.5 text-xs font-medium text-red">
                              {pending} por revisar
                            </span>
                          )}
                        </button>
                      );
                    })}
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
