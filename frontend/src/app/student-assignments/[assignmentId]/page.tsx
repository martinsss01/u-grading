"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";

type Question = {
  id: string;
  number: number;
  description: string;
  max_points: number;
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  status: string;
  rubric: string | null;
  due_date: string | null;
  created_at: string;
  questions: Question[];
  section: {
    id: string;
    semester: string;
    year: number;
    course: { id: string; name: string; code: string };
  };
};

const STATUS_COLORS: Record<string, string> = {
  Pendiente: "bg-grey/30 text-lemigrey",
  "En Calificación": "bg-yellow-500/20 text-yellow-400",
  Listo: "bg-green-500/20 text-green-400",
};

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AssignmentDetailPage() {
  const router = useRouter();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("user")) {
      router.push("/");
      return;
    }

    api
      .get<Assignment>(`/api/v1/assignments/${assignmentId}`)
      .then((res) => setAssignment(res.data))
      .catch(() => setError("No se pudo cargar la evaluación."))
      .finally(() => setLoading(false));
  }, [assignmentId, router]);

  const a = assignment;

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push("/student-assignments")}
          className="mb-6 text-sm text-demigrey transition-colors hover:text-white"
        >
          ← Volver
        </button>

        {loading && <p className="text-demigrey">Cargando...</p>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <p className="text-sm text-red">{error}</p>
          </div>
        )}

        {a && (
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">{a.title}</h1>
                <span
                  className={`mt-1 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-grey/20 text-lemigrey"}`}
                >
                  {a.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-demigrey">
                {a.section.course.name} ({a.section.course.code}) · {a.section.semester} {a.section.year}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-demigrey">Tipo</p>
                <p className="mt-1 font-medium text-white">{a.type}</p>
              </div>
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <p className="text-xs uppercase tracking-widest text-demigrey">Fecha de entrega</p>
                <p className="mt-1 font-medium text-white">
                  {formatDate(a.due_date) ?? "Sin fecha"}
                </p>
              </div>
            </div>

            {a.rubric && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <p className="mb-2 text-xs uppercase tracking-widest text-demigrey">Descripción y criterios</p>
                <p className="whitespace-pre-wrap text-sm text-white">{a.rubric}</p>
              </div>
            )}

            {a.questions.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-demigrey">Preguntas</p>
                <ol className="space-y-3">
                  {a.questions
                    .slice()
                    .sort((x, y) => x.number - y.number)
                    .map((q) => (
                      <li key={q.id} className="flex gap-3">
                        <span className="mt-0.5 w-5 shrink-0 text-sm text-demigrey">{q.number}.</span>
                        <div className="flex-1">
                          <p className="text-sm text-white">{q.description}</p>
                          <p className="mt-0.5 text-xs text-demigrey">{q.max_points} pts</p>
                        </div>
                      </li>
                    ))}
                </ol>
                <p className="mt-4 border-t border-grey/20 pt-3 text-right text-xs text-demigrey">
                  Total:{" "}
                  <span className="text-white">
                    {a.questions.reduce((s, q) => s + q.max_points, 0).toFixed(1)} pts
                  </span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
