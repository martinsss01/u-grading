"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import QRCode from "qrcode";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
// The origin a phone should use to reach this app — override with a tunnel
// URL (see docker-compose.yml) when testing the scan flow from a real phone,
// since the phone can't resolve "localhost" as this machine.
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL;

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
  open_date: string | null;
  due_date: string | null;
  created_at: string;
  filename: string | null;
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

// Human-readable countdown to a due date, e.g. "2d 5h" or "45m" — same
// format as the "Mis Evaluaciones" list view. Only ever shown for "Abierto"
// assignments, so a non-positive diff (due date passed but the backend
// hasn't flipped the status to "Cerrado" yet) reads as "Venciendo" rather
// than a confusing negative duration.
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
  const [scanQrUrl, setScanQrUrl] = useState<string | null>(null);
  const [historyShown, setHistoryShown] = useState(5);
  // Files picked via "Subir archivo"/"Agregar otro archivo", staged locally
  // and shown to the student before they're actually sent — nothing here
  // hits the backend until "Subir" is pressed.
  const [pendingFiles, setPendingFiles] = useState<{ id: string; file: File }[]>([]);
  // Ticks once a minute so the "Queda(n)" countdown below stays live without
  // a page reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  async function openScanModal() {
    const user = JSON.parse(localStorage.getItem("user")!) as { id: string };
    const origin = APP_ORIGIN ?? window.location.origin;
    const scanUrl = `${origin}/scan/${assignmentId}?user_id=${user.id}`;
    setScanQrUrl(await QRCode.toDataURL(scanUrl, { margin: 1, width: 256 }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPendingFiles((cur) => [...cur, { id: crypto.randomUUID(), file }]);
  }

  function removePendingFile(id: string) {
    setPendingFiles((cur) => cur.filter((p) => p.id !== id));
  }

  async function handleSubmitPayload() {
    if (pendingFiles.length === 0) return;

    const user = JSON.parse(localStorage.getItem("user")!) as { id: string };
    setUploading(true);
    setError(null);
    try {
      // Uploaded one at a time so they all land in the same submission —
      // the first response's id groups every file after it.
      let submissionId = activeSubmissionId;
      for (const { file } of pendingFiles) {
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
        formData.append("user_id", user.id);
        formData.append("file", file);
        if (submissionId) {
          formData.append("submission_id", submissionId);
        }
        const uploadRes = await api.post<Submission>("/api/v1/submissions/", formData, {
          headers: { "Content-Type": undefined },
        });
        submissionId = uploadRes.data.id;
      }
      setActiveSubmissionId(submissionId);
      setPendingFiles([]);
      // Refetch so we pick up the new files in the history list along with
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
  const canUpload = a?.status === "Abierto";
  const hasGrades = a?.answer_grades?.some((g) => g.grade != null) ?? false;

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
                  {a.status === "Abierto" && a.due_date && (
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

            <div className="flex justify-start">
              {canUpload && (
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
                    {pendingFiles.length === 0 ? "Subir archivo" : "Agregar otro archivo"}
                  </button>
                  <button
                    onClick={openScanModal}
                    className="ml-3 rounded-md bg-darkgrey px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-grey/30"
                  >
                    Escanear
                  </button>
                </>
              )}

              {!canUpload && (
                <button
                  disabled
                  className="cursor-not-allowed rounded-md bg-grey/20 px-3 py-1.5 text-xs font-medium text-demigrey"
                >
                  {a.status === "Pendiente" ? "Aún no disponible" : "Fecha de entrega finalizada"}
                </button>
              )}

              {hasGrades && (
                <button
                  // TODO: navigate to the correction-review view once it exists.
                  className="ml-3 rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400 transition-colors hover:bg-green-500/30"
                >
                  Revisar corrección
                </button>
              )}
            </div>

            {canUpload && pendingFiles.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="mb-2 text-xs uppercase tracking-widest text-demigrey">
                  Archivos por subir ({pendingFiles.length})
                </P>
                <ul className="divide-y divide-grey/20">
                  {pendingFiles.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="truncate text-white">📎 {p.file.name}</span>
                      <button
                        onClick={() => removePendingFile(p.id)}
                        disabled={uploading}
                        className="shrink-0 text-xs text-demigrey transition-colors hover:text-red disabled:cursor-not-allowed disabled:opacity-60"
                        aria-label={`Quitar ${p.file.name}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleSubmitPayload}
                  disabled={uploading}
                  className="mt-4 w-full rounded-md bg-red py-2 text-xs font-semibold text-white transition-colors hover:bg-red/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? "Subiendo..." : `Subir (${pendingFiles.length})`}
                </button>
              </div>
            )}

            {a.submission_history.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-5 py-4">
                <P className="mb-3 text-xs uppercase tracking-widest text-demigrey">Historial de entregas</P>
                <ul className="divide-y divide-grey/20">
                  {a.submission_history.slice(0, historyShown).map((s, idx) => (
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
                          <li key={f.id}>
                            <a
                              href={`${API_BASE}/api/v1/submissions/files/${f.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate text-xs text-demigrey underline-offset-2 hover:text-white hover:underline"
                            >
                              📎 {f.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {historyShown < a.submission_history.length && (
                  <button
                    onClick={() => setHistoryShown((n) => n + 5)}
                    className="mt-3 text-xs font-medium text-demigrey transition-colors hover:text-white"
                  >
                    Mostrar más
                  </button>
                )}
              </div>
            )}

            {hasGrades && a.questions.length > 0 && (
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

      {scanQrUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6">
          <div className="w-full max-w-xs rounded-lg bg-darkgrey p-6 text-center">
            <P className="text-sm font-medium text-white">Escanea con tu celular</P>
            <P className="mt-1 text-xs text-demigrey">
              Abre la cámara de tu teléfono y apunta al código para empezar a escanear.
            </P>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={scanQrUrl} alt="Código QR para escanear" className="mx-auto mt-4 size-56" />
            <button
              onClick={async () => {
                setScanQrUrl(null);
                // Refetch in case a page was already scanned and uploaded
                // from the phone while this modal was open.
                const user = JSON.parse(localStorage.getItem("user")!) as { id: string };
                const res = await api.get<Assignment>(`/api/v1/assignments/${assignmentId}`, {
                  params: { user_id: user.id },
                });
                setAssignment(res.data);
              }}
              className="mt-4 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/80"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
