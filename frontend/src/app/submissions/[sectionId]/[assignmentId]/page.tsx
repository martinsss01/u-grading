"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { computeAssignmentStatus } from "@/lib/assignment";
import { Paperclip } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Answer = {
  id: string;
  question_id: string;
  grade: number | null;
  graded_at: string | null;
};

type SubmissionFile = {
  id: string;
  filename: string;
};

type Submission = {
  id: string;
  needs_checking: boolean;
  created_at: string;
  files: SubmissionFile[];
  answers: Answer[];
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  rubric: string | null;
  open_date: string | null;
  due_date: string | null;
  filename: string | null;
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

// Same countdown format as the student assignment detail page.
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

function averageGrade(answers: Answer[]): string {
  if (answers.length === 0) return "—";
  const graded = answers.filter((a) => a.grade !== null);
  if (graded.length === 0) return "Sin calificar";
  const total = graded.reduce((sum, a) => sum + (a.grade ?? 0), 0);
  return (total / graded.length).toFixed(1);
}

export default function AssignmentSubmissionsPage() {
  const router = useRouter();
  const { sectionId, assignmentId } = useParams<{ sectionId: string; assignmentId: string }>();
  const [section, setSection] = useState<SectionSubmissions["section"] | null>(null);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ticks once a minute so the status badge and "Queda" countdown stay live
  // without a page reload — same pattern as the other assignment views.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!localStorage.getItem("user")) {
      router.push("/");
      return;
    }

    api
      .get<SectionSubmissions>(`/api/v1/submissions/section/${sectionId}`)
      .then((res) => {
        const found = res.data.assignments.find((a) => a.id === assignmentId);
        if (!found) {
          setError("No se encontró la evaluación.");
          return;
        }
        setSection(res.data.section);
        setAssignment(found);
      })
      .catch(() => setError("No se pudieron cargar las entregas."))
      .finally(() => setLoading(false));
  }, [sectionId, assignmentId, router]);

  const a = assignment;
  const status = a ? computeAssignmentStatus(a.open_date, a.due_date, now) : null;

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

        {a && section && (
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-2xl font-bold text-white">{a.title}</h1>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status ?? ""] ?? "bg-grey/20 text-lemigrey"}`}
                >
                  {status}
                </span>
              </div>
              <P className="mt-1 text-sm text-demigrey">
                {section.course.name} ({section.course.code}) · {section.semester} {section.year}
              </P>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="text-xs uppercase tracking-widest text-demigrey">Fecha de inicio</P>
                <P className="mt-1 font-medium text-white">
                  {formatDate(a.open_date) ?? "Sin fecha"}
                </P>
              </div>
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <div className="flex items-center gap-2">
                  <P className="text-xs uppercase tracking-widest text-demigrey">Fecha de entrega</P>
                  {status === "Abierto" && a.due_date && (
                    <span className="rounded-full bg-red/20 px-2 py-0.5 text-xs font-medium text-white">
                      Queda {timeLeftLabel(a.due_date, now)}
                    </span>
                  )}
                </div>
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

            {a.filename && (
              <div className="flex items-center justify-between rounded-lg bg-darkgrey px-5 py-4">
                <div className="min-w-0">
                  <P className="text-xs uppercase tracking-widest text-demigrey">Material de la evaluación</P>
                  <P className="mt-1 truncate text-sm text-white">{a.filename}</P>
                </div>
                <a
                  href={`${API_BASE}/api/v1/assignments/${a.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 shrink-0 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red/80"
                >
                  Descargar
                </a>
              </div>
            )}

            <div className="rounded-lg bg-darkgrey px-5 py-4">
              <div className="mb-3 flex items-center justify-between">
                <P className="text-xs uppercase tracking-widest text-demigrey">Entregas</P>
                <span className="text-xs text-demigrey">
                  {a.submissions.length} entrega{a.submissions.length !== 1 ? "s" : ""}
                </span>
              </div>

              {a.submissions.length === 0 ? (
                <P className="text-sm text-demigrey">Sin entregas.</P>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-widest text-demigrey">
                        <th className="pb-2 font-medium">Entrega</th>
                        <th className="pb-2 font-medium">Fecha</th>
                        <th className="pb-2 font-medium">Estado</th>
                        <th className="pb-2 text-right font-medium">Nota</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grey/20">
                      {a.submissions.map((sub, idx) => (
                        <tr key={sub.id}>
                          <td className="py-2.5 pr-3">
                            <P className="text-sm text-white">Entrega {idx + 1}</P>
                            <ul className="mt-0.5 space-y-0.5">
                              {sub.files.map((f) => (
                                <li key={f.id}>
                                  <a
                                    href={`${API_BASE}/api/v1/submissions/files/${f.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-w-0 items-center gap-1 text-xs text-demigrey underline-offset-2 hover:text-white hover:underline"
                                  >
                                    <Paperclip className="size-3.5 shrink-0" />
                                    <span className="truncate">{f.filename}</span>
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </td>
                          <td className="py-2.5 pr-3 text-xs text-demigrey">
                            {formatDate(sub.created_at)}
                          </td>
                          <td className="py-2.5 pr-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                sub.needs_checking
                                  ? "bg-red/20 text-red-400"
                                  : "bg-grey/20 text-lemigrey"
                              }`}
                            >
                              {sub.needs_checking ? "Por revisar" : "Revisado"}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-white">
                            {averageGrade(sub.answers)}
                          </td>
                          <td className="py-2.5 pl-3 text-right">
                            <Link
                              href={`/submissions/${sectionId}/${assignmentId}/${sub.id}`}
                              className="rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red/80"
                            >
                              Revisar
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
