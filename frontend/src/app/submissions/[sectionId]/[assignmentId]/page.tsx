"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { computeAssignmentStatus } from "@/lib/assignment";
import { PIPELINE_LABELS, type ReviewSubmission, guidelineUrl, numberSubmissions } from "@/lib/review";
import { AlertTriangle, FileText, Lock } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Submission = ReviewSubmission;
type Answer = Submission["answers"][number];

type Assignment = {
  id: string;
  title: string;
  type: string;
  rubric: string | null;
  open_date: string | null;
  due_date: string | null;
  filename: string | null;
  guideline_filename: string | null;
  pipeline_started_at: string | null;
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

function difficultyClass(d: number): string {
  if (d >= 67) return "bg-red/25 text-red-300";
  if (d >= 34) return "bg-yellow-500/20 text-yellow-300";
  return "bg-green-500/20 text-green-400";
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
  const [userId] = useState(() =>
    typeof window === "undefined" ? "" : ((JSON.parse(localStorage.getItem("user") ?? "{}") as { id?: string }).id ?? ""),
  );
  // null = not chosen yet: default to "mine" once submissions have been assigned to this TA.
  const [filter, setFilter] = useState<"mine" | "all" | null>(null);

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
  const numbered = numberSubmissions(a?.submissions ?? []);
  const mineCount = numbered.filter(({ sub }) => sub.assigned_ta_id === userId).length;
  const activeFilter = filter ?? (mineCount > 0 ? "mine" : "all");
  const shown = activeFilter === "mine" ? numbered.filter(({ sub }) => sub.assigned_ta_id === userId) : numbered;

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

            {a.guideline_filename && (
              <div className="flex items-center justify-between rounded-lg bg-darkgrey px-5 py-4">
                <div className="min-w-0">
                  <P className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest text-demigrey">
                    <Lock className="size-3" /> Pauta de corrección (privada)
                  </P>
                  <P className="mt-1 truncate text-sm text-white">{a.guideline_filename}</P>
                </div>
                <a
                  href={guidelineUrl(a.id, userId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 shrink-0 rounded-md bg-darkergrey px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-grey/30"
                >
                  Ver pauta
                </a>
              </div>
            )}

            <div className="rounded-lg bg-darkgrey px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <P className="text-xs uppercase tracking-widest text-demigrey">Entregas</P>
                <div className="flex items-center gap-3">
                  {mineCount > 0 && (
                    <div className="flex rounded-md bg-darkergrey p-0.5 text-xs" role="group" aria-label="Filtrar entregas">
                      {(
                        [
                          ["mine", `Asignadas a mí (${mineCount})`],
                          ["all", `Todas (${a.submissions.length})`],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setFilter(value)}
                          aria-pressed={activeFilter === value}
                          className={`rounded px-2.5 py-1 font-medium transition-colors ${
                            activeFilter === value ? "bg-red text-white" : "text-demigrey hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {mineCount === 0 && (
                    <span className="text-xs text-demigrey">
                      {a.submissions.length} entrega{a.submissions.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {a.submissions.length === 0 ? (
                <P className="text-sm text-demigrey">Sin entregas.</P>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-widest text-demigrey">
                        <th className="pb-2 pr-3 font-medium">Entrega</th>
                        <th className="pb-2 pr-3 font-medium">Fecha</th>
                        <th className="pb-2 pr-3 font-medium">Dificultad</th>
                        <th className="pb-2 pr-3 font-medium">Estado</th>
                        <th className="pb-2 text-right font-medium">Nota</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grey/20">
                      {shown.map(({ sub, number }) => (
                        <tr key={sub.id}>
                          <td className="py-2.5 pr-3 align-top">
                            <P className="flex items-center gap-1.5 text-sm text-white">
                              Entrega {number}
                              {sub.needs_anonymization_check && (
                                <span title="Revisar la anonimización antes de corregir">
                                  <AlertTriangle className="size-3.5 text-yellow-400" />
                                </span>
                              )}
                            </P>
                            {/* Neutral names: original filenames can identify the student. */}
                            <P className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-demigrey">
                              {sub.files.map((f) => (
                                <span key={f.id} className="inline-flex items-center gap-1">
                                  <FileText className="size-3 shrink-0" />
                                  {f.filename}
                                </span>
                              ))}
                            </P>
                            {sub.student_comment && (
                              <P className="mt-1 line-clamp-2 max-w-xs text-xs italic text-lemigrey">
                                “{sub.student_comment}”
                              </P>
                            )}
                            {activeFilter === "all" && sub.assigned_ta_name && (
                              <P className="mt-0.5 text-[11px] text-demigrey">Asignada a {sub.assigned_ta_name}</P>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 align-top text-xs text-demigrey">
                            {formatDate(sub.created_at)}
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            {sub.difficulty != null ? (
                              <span
                                title={sub.difficulty_reason ?? undefined}
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${difficultyClass(sub.difficulty)}`}
                              >
                                {sub.difficulty}
                              </span>
                            ) : (
                              <span className="text-xs text-demigrey" title={sub.pipeline_error ?? undefined}>
                                {PIPELINE_LABELS[sub.pipeline_status]}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <span
                              className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                sub.needs_checking
                                  ? "bg-red/20 text-red-400"
                                  : "bg-grey/20 text-lemigrey"
                              }`}
                            >
                              {sub.needs_checking ? "Por revisar" : "Revisado"}
                            </span>
                          </td>
                          <td className="py-2.5 text-right align-top text-white">
                            {averageGrade(sub.answers)}
                          </td>
                          <td className="py-2.5 pl-3 text-right align-top">
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
