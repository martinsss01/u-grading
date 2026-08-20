"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";

type Question = {
  id: string;
  number: number;
  description: string;
  max_points: number;
};

type QuestionGrade = {
  question_id: string;
  grade: number | null;
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
  answer_grades: QuestionGrade[] | null;
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    // TODO: wire up actual upload once the endpoint is ready.
    e.target.value = "";
  }

  useEffect(() => {
    if (!localStorage.getItem("user")) {
      router.push("/");
      return;
    }

    const user = JSON.parse(localStorage.getItem("user")!) as { id: string };

    api
      .get<Assignment>(`/api/v1/assignments/${assignmentId}`, { params: { user_id: user.id } })
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
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-grey/20 text-lemigrey"}`}
                  >
                    {a.status}
                  </span>

                  {a.status === "Pendiente" && (
                    <>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red/80"
                      >
                        Subir archivo
                      </button>
                    </>
                  )}

                  {a.status === "En Calificación" && (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-md bg-grey/20 px-3 py-1.5 text-xs font-medium text-demigrey"
                    >
                      Subir archivo
                    </button>
                  )}

                  {a.status === "Listo" && (
                    <button
                      // TODO: navigate to the correction-review view once it exists.
                      className="rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/30"
                    >
                      Revisar corrección
                    </button>
                  )}
                </div>
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

            {a.status === "Listo" && a.questions.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <p className="mb-3 text-xs uppercase tracking-widest text-demigrey">Notas por pregunta</p>
                <ul className="space-y-2">
                  {a.questions
                    .slice()
                    .sort((x, y) => x.number - y.number)
                    .map((q) => {
                      const grade = a.answer_grades?.find((g) => g.question_id === q.id)?.grade ?? null;
                      return (
                        <li key={q.id} className="flex items-center justify-between text-sm">
                          <span className="text-white">P{q.number}</span>
                          <span className="text-white">{grade != null ? grade.toFixed(1) : "—"}</span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
