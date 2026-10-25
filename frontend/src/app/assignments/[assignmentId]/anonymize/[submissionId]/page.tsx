"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { P } from "@/components/ui/p";
import {
  type ReviewSubmission,
  confirmManualAnonymization,
  getPipelineOverview,
  numberSubmissions,
} from "@/lib/review";
import { PdfReviewer } from "@/components/pdf-review";

/** Where a teacher censors a submission the pipeline failed to anonymize, then releases it to a TA. */
export default function ManualAnonymizationPage() {
  const router = useRouter();
  const { assignmentId, submissionId } = useParams<{ assignmentId: string; submissionId: string }>();
  const [userId] = useState(() =>
    typeof window === "undefined" ? "" : ((JSON.parse(localStorage.getItem("user") ?? "{}") as { id?: string }).id ?? ""),
  );
  const [title, setTitle] = useState<string | null>(null);
  const [number, setNumber] = useState<number | null>(null);
  const [submission, setSubmission] = useState<ReviewSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!userId) return;
    getPipelineOverview(assignmentId, userId)
      .then((overview) => {
        const found = numberSubmissions(overview.submissions).find(({ sub }) => sub.id === submissionId);
        setTitle(overview.title);
        setSubmission(found?.sub ?? null);
        setNumber(found?.number ?? null);
        if (!found) setError("No se encontró la entrega.");
      })
      .catch(() => setError("No se pudo cargar la entrega."));
  }, [assignmentId, submissionId, userId]);

  async function confirm() {
    if (!window.confirm("¿Confirmas que censuraste todos los datos del estudiante? La entrega pasará a un ayudante.")) {
      return;
    }
    setConfirming(true);
    setError(null);
    try {
      await confirmManualAnonymization(submissionId, userId);
      router.push(`/assignments/${assignmentId}`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      setError(typeof detail === "string" ? detail : "No se pudo confirmar la anonimización.");
      setConfirming(false);
    }
  }

  const done = submission?.manual_anonymization_done ?? false;

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-grey/30 px-6 py-3">
        <button onClick={() => router.back()} className="text-sm text-demigrey transition-colors hover:text-white">
          ← Volver
        </button>
        <h1 className="text-lg font-bold text-white">
          {title ? `${title} · Entrega ${number ?? ""} · Anonimización manual` : "Anonimización manual"}
        </h1>
        {submission && (
          <button
            onClick={confirm}
            disabled={confirming || done}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="size-3.5" />
            {done ? "Anonimización confirmada" : confirming ? "Confirmando..." : "Confirmar anonimización"}
          </button>
        )}
      </div>
      <div className="border-b border-grey/30 bg-darkgrey px-6 py-2">
        <P className="text-xs text-demigrey">
          La anonimización automática falló en esta entrega. Usa &quot;Censurar&quot; para tapar el nombre, RUT, correo
          y firma del estudiante en todas las páginas, y luego confirma para entregarla a un ayudante.
        </P>
        {submission?.pipeline_error && (
          <P className="mt-1 text-[11px] text-red-300">Error: {submission.pipeline_error}</P>
        )}
      </div>
      {error && <P className="px-6 py-3 text-sm text-red">{error}</P>}
      {submission && (
        <div className="min-h-0 flex-1">
          <PdfReviewer submissionId={submissionId} readOnly={false} initialTool="censor" />
        </div>
      )}
    </main>
  );
}
