"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

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

type SubmissionFile = {
  id: string;
  filename: string;
};

type Submission = {
  id: string;
  created_at: string;
  files: SubmissionFile[];
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
  submission_history: Submission[];
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
  const [uploading, setUploading] = useState(false);
  // Once the first file of a visit is uploaded, later adds reuse this id so
  // they land in the same submission instead of starting a new one. Resets
  // to null on reload — the next upload after that starts a fresh entry.
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const user = JSON.parse(localStorage.getItem("user")!) as { id: string };
    const formData = new FormData();
    formData.append("assignment_id", assignmentId);
    formData.append("user_id", user.id);
    formData.append("file", file);
    if (activeSubmissionId) {
      formData.append("submission_id", activeSubmissionId);
    }

    setUploading(true);
    try {
      const uploadRes = await api.post<Submission>("/api/v1/submissions/", formData, {
        headers: { "Content-Type": undefined },
      });
      setActiveSubmissionId(uploadRes.data.id);
      // Refetch so we pick up the new file in the history list along with
      // the updated status, rather than patching state by hand.
      const res = await api.get<Assignment>(`/api/v1/assignments/${assignmentId}`, {
        params: { user_id: user.id },
      });
      setAssignment(res.data);
    } catch {
      setError("No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
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
  const isPastDue = a?.due_date ? new Date(a.due_date) < new Date() : false;

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
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

        {a && (
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">{a.title}</h1>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[a.status] ?? "bg-grey/20 text-lemigrey"}`}
                >
                  {a.status}
                </span>
              </div>
              <P className="mt-1 text-sm text-demigrey">
                {a.section.course.name} ({a.section.course.code}) · {a.section.semester} {a.section.year}
              </P>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="text-xs uppercase tracking-widest text-demigrey">Tipo</P>
                <P className="mt-1 font-medium text-white">{a.type}</P>
              </div>
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="text-xs uppercase tracking-widest text-demigrey">Fecha de entrega</P>
                <P className="mt-1 font-medium text-white">
                  {formatDate(a.due_date) ?? "Sin fecha"}
                </P>
              </div>
            </div>

            {a.rubric && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="mb-2 text-xs uppercase tracking-widest text-demigrey">Descripción y criterios</P>
                <P className="whitespace-pre-wrap text-sm text-white">{a.rubric}</P>
              </div>
            )}

            <div className="flex justify-end">
              {!isPastDue && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? "Subiendo..." : "Subir archivo"}
                  </button>
                </>
              )}

              {isPastDue && (
                <button
                  disabled
                  className="cursor-not-allowed rounded-md bg-grey/20 px-3 py-1.5 text-xs font-medium text-demigrey"
                >
                  Fecha de entrega finalizada
                </button>
              )}

              {a.status === "Listo" && (
                <button
                  // TODO: navigate to the correction-review view once it exists.
                  className="ml-3 rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/30"
                >
                  Revisar corrección
                </button>
              )}
            </div>

            {a.submission_history.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="mb-3 text-xs uppercase tracking-widest text-demigrey">Historial de entregas</P>
                <ul className="divide-y divide-grey/20">
                  {a.submission_history.map((s, idx) => (
                    <li key={s.id} className="py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white">{formatDate(s.created_at)}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            idx === 0 ? "bg-green-500/20 text-green-400" : "bg-grey/30 text-lemigrey"
                          }`}
                        >
                          {idx === 0 ? "Vigente" : "Reemplazada"}
                        </span>
                      </div>
                      <ul className="mt-1 space-y-0.5">
                        {s.files.map((f) => (
                          <li key={f.id} className="truncate text-xs text-demigrey">
                            {f.filename}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {a.status === "Listo" && a.questions.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="mb-3 text-xs uppercase tracking-widest text-demigrey">Notas por pregunta</P>
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
