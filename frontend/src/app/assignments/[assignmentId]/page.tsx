"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, RotateCw, Sparkles } from "lucide-react";
import { P } from "@/components/ui/p";
import {
  PIPELINE_LABELS,
  type PipelineOverview,
  getPipelineOverview,
  numberSubmissions,
  retryPipeline,
  runPipeline,
  setAssignee,
} from "@/lib/review";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CLASS: Record<string, string> = {
  not_started: "bg-grey/20 text-lemigrey",
  queued: "bg-grey/30 text-lemigrey",
  processing: "bg-yellow-500/20 text-yellow-300",
  done: "bg-green-500/20 text-green-400",
  failed: "bg-red/20 text-red-400",
};

export default function AssignmentCorrectionsPage() {
  const router = useRouter();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [userId] = useState(() =>
    typeof window === "undefined" ? "" : ((JSON.parse(localStorage.getItem("user") ?? "{}") as { id?: string }).id ?? ""),
  );
  const [overview, setOverview] = useState<PipelineOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inProgress = overview?.submissions.some((s) => s.pipeline_status === "queued" || s.pipeline_status === "processing");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const data = await getPipelineOverview(assignmentId, userId);
        if (cancelled) return;
        setOverview(data);
        // Keep refreshing while the pipeline is working through the queue.
        if (data.submissions.some((s) => s.pipeline_status === "queued" || s.pipeline_status === "processing")) {
          timer = setTimeout(load, 5000);
        }
      } catch {
        if (!cancelled) setError("No se pudo cargar la evaluación.");
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `inProgress` flipping to true (after a manual run) restarts polling.
  }, [assignmentId, userId, inProgress]);

  async function act(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setOverview(await getPipelineOverview(assignmentId, userId));
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const numbers = new Map(numberSubmissions(overview?.submissions ?? []).map(({ sub, number }) => [sub.id, number]));
  const maxLoad = Math.max(1, ...(overview?.tas.map((t) => t.total_difficulty) ?? [1]));
  const notStarted = overview?.submissions.filter((s) => s.pipeline_status === "not_started").length ?? 0;

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <button onClick={() => router.back()} className="text-sm text-demigrey transition-colors hover:text-white">
          ← Volver
        </button>

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}
        {!overview && !error && <P className="text-demigrey">Cargando...</P>}

        {overview && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white">{overview.title} · Correcciones</h1>
                <P className="mt-1 text-sm text-demigrey">
                  {overview.pipeline_started_at
                    ? `Revisión con IA iniciada el ${formatDate(overview.pipeline_started_at)}`
                    : "La revisión con IA empieza automáticamente al cerrar la evaluación."}
                </P>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => act(() => runPipeline(assignmentId, userId), "No se pudo iniciar el procesamiento.")}
                  disabled={busy || notStarted === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/80 disabled:cursor-not-allowed disabled:opacity-50"
                  title={notStarted === 0 ? "No hay entregas sin procesar" : undefined}
                >
                  <Sparkles className="size-3.5" />
                  Procesar ahora{notStarted > 0 ? ` (${notStarted})` : ""}
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Esto vuelve a revisar todas las entregas con IA (tiene costo) y reemplaza las sugerencias pendientes. ¿Continuar?",
                      )
                    ) {
                      act(() => runPipeline(assignmentId, userId, true), "No se pudo reprocesar.");
                    }
                  }}
                  disabled={busy || inProgress || overview.submissions.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-darkgrey px-3 py-1.5 text-xs font-medium text-white hover:bg-grey/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCw className="size-3.5" />
                  Reprocesar todo
                </button>
              </div>
            </div>

            {!overview.has_guideline && (
              <P className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-200">
                Esta evaluación no tiene pauta de corrección. La revisión con IA funciona mejor con una: súbela desde
                &quot;Editar&quot;.
              </P>
            )}

            <section className="rounded-lg bg-darkgrey px-5 py-4">
              <P className="mb-3 text-xs uppercase tracking-widest text-demigrey">Carga por ayudante</P>
              {overview.tas.length === 0 ? (
                <P className="text-sm text-demigrey">
                  La sección no tiene ayudantes, así que las entregas no se pueden repartir.
                </P>
              ) : (
                <ul className="space-y-3">
                  {overview.tas.map((ta) => (
                    <li key={ta.id}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="text-white">{ta.name}</span>
                        <span className="text-xs text-demigrey">
                          {ta.count} entrega{ta.count !== 1 ? "s" : ""} · dificultad total {ta.total_difficulty}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-darkergrey">
                        <div
                          className="h-1.5 rounded-full bg-red"
                          style={{ width: `${(ta.total_difficulty / maxLoad) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg bg-darkgrey px-5 py-4">
              <P className="mb-3 text-xs uppercase tracking-widest text-demigrey">
                Entregas ({overview.submissions.length})
              </P>
              {overview.submissions.length === 0 ? (
                <P className="text-sm text-demigrey">Sin entregas.</P>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-widest text-demigrey">
                        <th className="pb-2 font-medium">Entrega</th>
                        <th className="pb-2 font-medium">Estado IA</th>
                        <th className="pb-2 font-medium">Dificultad</th>
                        <th className="pb-2 font-medium">Ayudante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grey/20">
                      {overview.submissions.map((s) => (
                        <tr key={s.id}>
                          <td className="py-2.5 pr-3 align-top">
                            <span className="inline-flex items-center gap-1.5 text-white">
                              Entrega {numbers.get(s.id)}
                              {s.needs_anonymization_check && (
                                <span title="La anonimización necesita revisión">
                                  <AlertTriangle className="size-3.5 text-yellow-400" />
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 align-top">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[s.pipeline_status]}`}>
                              {PIPELINE_LABELS[s.pipeline_status]}
                            </span>
                            {s.pipeline_status === "failed" && (
                              <>
                                <P className="mt-1 max-w-xs text-[11px] text-red-300">{s.pipeline_error}</P>
                                <button
                                  onClick={() => act(() => retryPipeline(s.id, userId), "No se pudo reintentar.")}
                                  disabled={busy}
                                  className="mt-1 text-xs font-medium text-demigrey hover:text-white disabled:opacity-50"
                                >
                                  Reintentar
                                </button>
                              </>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 align-top text-white" title={s.difficulty_reason ?? undefined}>
                            {s.difficulty ?? "—"}
                          </td>
                          <td className="py-2.5 align-top">
                            <select
                              value={s.assigned_ta_id ?? ""}
                              onChange={(e) =>
                                act(
                                  () => setAssignee(s.id, userId, e.target.value || null),
                                  "No se pudo reasignar la entrega.",
                                )
                              }
                              disabled={busy || overview.tas.length === 0}
                              className="rounded-md bg-darkergrey px-2 py-1 text-xs text-white outline-none focus:ring-1 focus:ring-red disabled:opacity-50"
                              aria-label={`Ayudante de la entrega ${numbers.get(s.id)}`}
                            >
                              <option value="">Sin asignar</option>
                              {overview.tas.map((ta) => (
                                <option key={ta.id} value={ta.id}>
                                  {ta.name}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
