"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, ExternalLink, Minus, Plus, Sparkles, SquareDashed, Type } from "lucide-react";
import { P } from "@/components/ui/p";
import {
  type Annotation,
  type AnnotationDraft,
  type DocumentStatus,
  type Rect,
  type Redaction,
  acceptSuggestion,
  createAnnotation,
  createRedaction,
  deleteAnnotation,
  deleteRedaction,
  dismissSuggestion,
  documentPdfUrl,
  getDocumentStatus,
  listAnnotations,
  listRedactions,
  markAnonymizationChecked,
  rebuildDocument,
  sortAnnotations,
  updateAnnotation,
} from "@/lib/review";
import PdfPages, { type Tool } from "./pdf-pages";

const ZOOM_STEPS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const MAX_PAGE_WIDTH = 900;

function readUserId(): string | null {
  try {
    return (JSON.parse(localStorage.getItem("user") ?? "null") as { id: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** AI pipeline results shown to the teaching staff above the comments. */
export type ReviewInfo = {
  summary: string | null;
  difficulty: number | null;
  difficultyReason: string | null;
  needsAnonymizationCheck: boolean;
};

export default function PdfReviewer({
  submissionId,
  readOnly,
  review,
}: {
  submissionId: string;
  readOnly: boolean;
  review?: ReviewInfo;
}) {
  // Never server-rendered (see index.tsx), so localStorage is safe here.
  const [userId] = useState(readUserId);
  const [doc, setDoc] = useState<DocumentStatus | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [pollKey, setPollKey] = useState(0);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnnotationDraft | null>(null);
  const [draftText, setDraftText] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("text");
  const [zoomIdx, setZoomIdx] = useState(2);
  const [viewportWidth, setViewportWidth] = useState(0);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [redactions, setRedactions] = useState<Redaction[]>([]);
  const [censoring, setCensoring] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(review?.needsAnonymizationCheck ?? false);

  // Poll while the backend is still (re)building the merged PDF.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const status = await getDocumentStatus(submissionId);
        if (cancelled) return;
        setDoc(status);
        setDocError(null);
        if (status.status === "pending") timer = setTimeout(tick, 2000);
      } catch {
        if (!cancelled) setDocError("No se encontró el PDF de esta entrega.");
      }
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [submissionId, pollKey]);

  useEffect(() => {
    listAnnotations(submissionId, userId)
      .then((list) => setAnnotations(sortAnnotations(list)))
      .catch(() => setActionError("No se pudieron cargar los comentarios."));
  }, [submissionId, userId]);

  useEffect(() => {
    if (tool !== "censor" || !userId) return;
    listRedactions(submissionId, userId)
      .then(setRedactions)
      .catch(() => setActionError("No se pudieron cargar las censuras."));
  }, [tool, submissionId, userId]);

  /** Redactions change the anonymized PDF; refetch its status so the viewer reloads it. */
  async function applyRedactionChange(change: () => Promise<Redaction[]>) {
    setCensoring(true);
    setActionError(null);
    try {
      setRedactions(await change());
      setDoc(await getDocumentStatus(submissionId));
    } catch {
      setActionError("No se pudo actualizar la censura.");
    } finally {
      setCensoring(false);
    }
  }

  function handleCensor(page: number, rect: Rect) {
    if (!userId) return;
    applyRedactionChange(() => createRedaction(submissionId, userId, page, [rect]));
  }

  function handleDeleteRedaction(id: string) {
    if (!userId || !window.confirm("¿Quitar esta censura? Lo que cubre volverá a verse.")) return;
    applyRedactionChange(() => deleteRedaction(id, userId));
  }

  async function confirmAnonymization() {
    if (!userId) return;
    try {
      await markAnonymizationChecked(submissionId, userId);
      setNeedsCheck(false);
    } catch {
      setActionError("No se pudo marcar como revisada.");
    }
  }

  const viewportRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleSelect = useCallback((d: AnnotationDraft) => {
    setDraft(d);
    setActiveId(null);
    setActionError(null);
    // Focus after the sidebar form renders.
    setTimeout(() => draftInputRef.current?.focus(), 0);
  }, []);

  const handleAnnotationClick = useCallback((id: string) => {
    setActiveId(id);
    document.getElementById(`comment-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  function focusAnnotation(id: string) {
    setActiveId(id);
    // The wrapper has no box of its own; scroll to its first mark.
    document.getElementById(`ann-${id}`)?.firstElementChild?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function cancelDraft() {
    setDraft(null);
    setDraftText("");
  }

  async function saveDraft() {
    if (!draft || !userId || !draftText.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const created = await createAnnotation(submissionId, userId, draft, draftText.trim());
      setAnnotations((cur) => sortAnnotations([...cur, created]));
      setActiveId(created.id);
      cancelDraft();
    } catch {
      setActionError("No se pudo guardar el comentario.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!editing || !userId || !editing.text.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      // Editing a pending AI suggestion publishes it, reworded, as this TA's comment.
      const isSuggestion = annotations.find((a) => a.id === editing.id)?.status === "suggested";
      const updated = isSuggestion
        ? await acceptSuggestion(editing.id, userId, editing.text.trim())
        : await updateAnnotation(editing.id, userId, editing.text.trim());
      setAnnotations((cur) => cur.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch {
      setActionError("No se pudo editar el comentario.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!userId || !window.confirm("¿Borrar este comentario?")) return;
    setActionError(null);
    try {
      await deleteAnnotation(id, userId);
      setAnnotations((cur) => cur.filter((a) => a.id !== id));
    } catch {
      setActionError("No se pudo borrar el comentario.");
    }
  }

  async function accept(id: string) {
    if (!userId) return;
    setActionError(null);
    try {
      const updated = await acceptSuggestion(id, userId);
      setAnnotations((cur) => cur.map((a) => (a.id === id ? updated : a)));
    } catch {
      setActionError("No se pudo aceptar la sugerencia.");
    }
  }

  async function dismiss(id: string) {
    if (!userId) return;
    setActionError(null);
    try {
      await dismissSuggestion(id, userId);
      setAnnotations((cur) => cur.filter((a) => a.id !== id));
    } catch {
      setActionError("No se pudo descartar la sugerencia.");
    }
  }

  async function rebuild() {
    try {
      setDoc(await rebuildDocument(submissionId));
      setPollKey((k) => k + 1);
    } catch {
      setDocError("No se pudo regenerar el PDF.");
    }
  }

  const zoom = ZOOM_STEPS[zoomIdx];
  const pageWidth = Math.max(Math.min(viewportWidth - 32, MAX_PAGE_WIDTH) * zoom, 200);
  const ready = doc?.status === "ready";

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-grey/30 bg-darkgrey px-4 py-2">
          {!readOnly && (
            <div className="flex rounded-md bg-darkergrey p-0.5" role="group" aria-label="Herramienta de comentario">
              {(
                [
                  ["text", Type, "Resaltar texto"],
                  ["area", SquareDashed, "Marcar área"],
                  ["censor", EyeOff, "Censurar"],
                ] as const
              ).map(([value, Icon, label]) => (
                <button
                  key={value}
                  onClick={() => setTool(value)}
                  aria-pressed={tool === value}
                  className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    tool === value ? "bg-red text-white" : "text-demigrey hover:text-white"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setZoomIdx((i) => Math.max(i - 1, 0))}
              disabled={zoomIdx === 0}
              className="rounded p-1 text-demigrey hover:text-white disabled:opacity-40"
              aria-label="Alejar"
            >
              <Minus className="size-4" />
            </button>
            <span className="w-12 text-center text-xs text-lemigrey">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoomIdx((i) => Math.min(i + 1, ZOOM_STEPS.length - 1))}
              disabled={zoomIdx === ZOOM_STEPS.length - 1}
              className="rounded p-1 text-demigrey hover:text-white disabled:opacity-40"
              aria-label="Acercar"
            >
              <Plus className="size-4" />
            </button>
            {ready && (
              <a
                href={documentPdfUrl(submissionId, doc.updated_at)}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 inline-flex items-center gap-1 text-xs text-demigrey hover:text-white"
              >
                <ExternalLink className="size-3.5" />
                Abrir PDF
              </a>
            )}
          </div>
        </div>

        <div ref={viewportRef} className="min-h-[60vh] flex-1 overflow-auto bg-darkergrey">
          {docError && <P className="p-6 text-center text-sm text-red">{docError}</P>}
          {!docError && (!doc || doc.status === "pending") && (
            <P className="p-6 text-center text-sm text-demigrey">Preparando el PDF de la entrega...</P>
          )}
          {doc?.status === "failed" && (
            <div className="p-6 text-center">
              <P className="text-sm text-red">No se pudo generar el PDF de esta entrega.</P>
              {doc.error && <P className="mt-1 text-xs text-demigrey">{doc.error}</P>}
              <button
                onClick={rebuild}
                className="mt-3 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/80"
              >
                Reintentar
              </button>
            </div>
          )}
          {censoring && (
            <P className="sticky top-0 z-40 bg-darkgrey/95 px-4 py-2 text-center text-xs text-lemigrey">
              Actualizando el PDF anonimizado...
            </P>
          )}
          {ready && viewportWidth > 0 && (
            <PdfPages
              url={documentPdfUrl(submissionId, doc.updated_at)}
              width={pageWidth}
              tool={readOnly ? null : tool}
              annotations={annotations}
              activeId={activeId}
              draft={draft}
              onSelect={handleSelect}
              onAnnotationClick={handleAnnotationClick}
              redactions={redactions}
              onCensor={handleCensor}
              onDeleteRedaction={handleDeleteRedaction}
            />
          )}
        </div>
      </section>

      <aside className="flex max-h-[50vh] w-full shrink-0 flex-col border-t border-grey/30 bg-darkgrey lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
        <div className="border-b border-grey/30 px-4 py-3">
          <P className="text-xs uppercase tracking-widest text-demigrey">Comentarios ({annotations.length})</P>
          {!readOnly && !draft && (
            <P className="mt-1 text-xs text-demigrey">
              {tool === "text"
                ? "Selecciona texto del PDF para comentarlo."
                : tool === "area"
                  ? "Arrastra sobre el PDF para marcar un área."
                  : "Arrastra sobre algo que identifique al estudiante para taparlo. Con × quitas una censura."}
            </P>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-auto px-4 py-3">
          {actionError && <P className="text-xs text-red">{actionError}</P>}

          {!readOnly && needsCheck && (
            <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3">
              <P className="text-xs text-yellow-200">
                La anonimización automática podría haber dejado datos del estudiante a la vista. Revisa el PDF y
                usa <strong>Censurar</strong> si ves su nombre.
              </P>
              <button
                onClick={confirmAnonymization}
                className="mt-2 rounded-md bg-darkergrey px-2.5 py-1 text-xs font-medium text-white hover:bg-grey/30"
              >
                Ya lo revisé
              </button>
            </div>
          )}

          {!readOnly && review && (review.summary || review.difficulty != null) && (
            <div className="rounded-md bg-darkergrey p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-lemigrey" />
                <P className="text-xs font-medium text-white">Revisión con IA</P>
                {review.difficulty != null && (
                  <span
                    className="ml-auto rounded-full bg-grey/30 px-2 py-0.5 text-[11px] text-lemigrey"
                    title={review.difficultyReason ?? undefined}
                  >
                    Dificultad {review.difficulty}/100
                  </span>
                )}
              </div>
              {review.summary && <P className="mt-2 whitespace-pre-wrap text-xs text-lemigrey">{review.summary}</P>}
              {review.difficultyReason && (
                <P className="mt-1 text-[11px] italic text-demigrey">{review.difficultyReason}</P>
              )}
            </div>
          )}

          {draft && (
            <div className="rounded-md border border-red/60 bg-darkergrey p-3">
              <P className="text-xs text-demigrey">Nuevo comentario · página {draft.page}</P>
              {draft.highlighted_text && (
                <P className="mt-1 line-clamp-3 border-l-2 border-red pl-2 text-xs italic text-lemigrey">
                  {draft.highlighted_text}
                </P>
              )}
              <textarea
                ref={draftInputRef}
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") cancelDraft();
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveDraft();
                }}
                rows={3}
                placeholder="Escribe tu comentario..."
                className="mt-2 w-full resize-y rounded-md bg-darkgrey px-2 py-1.5 text-sm text-white outline-none placeholder:text-demigrey focus:ring-1 focus:ring-red"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={cancelDraft} className="px-2 py-1 text-xs text-demigrey hover:text-white">
                  Cancelar
                </button>
                <button
                  onClick={saveDraft}
                  disabled={saving || !draftText.trim()}
                  className="rounded-md bg-red px-3 py-1 text-xs font-medium text-white hover:bg-red/80 disabled:opacity-50"
                >
                  {saving ? "Guardando..." : "Comentar"}
                </button>
              </div>
            </div>
          )}

          {annotations.length === 0 && !draft && (
            <P className="text-sm text-demigrey">{readOnly ? "Esta entrega no tiene comentarios." : "Sin comentarios aún."}</P>
          )}

          {annotations.map((a, idx) => {
            const suggested = a.status === "suggested";
            const own = !readOnly && !suggested && a.author_id === userId;
            const isEditing = editing?.id === a.id;
            return (
              <div
                key={a.id}
                id={`comment-${a.id}`}
                onClick={() => !isEditing && focusAnnotation(a.id)}
                className={`cursor-pointer rounded-md p-3 transition-colors ${
                  a.id === activeId ? "bg-darkergrey ring-1 ring-red" : "bg-darkergrey/60 hover:bg-darkergrey"
                } ${suggested ? "border border-dashed border-grey/60" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                      suggested ? "bg-grey" : "bg-red"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="truncate text-xs font-medium text-white">{a.author_name}</span>
                  {/* Accepted suggestions are the TA's comment as far as students are concerned. */}
                  {!readOnly && (suggested || a.source === "ai") && (
                    <span
                      className="shrink-0 rounded bg-grey/30 px-1.5 py-0.5 text-[10px] font-semibold text-lemigrey"
                      title={suggested ? "Sugerencia de la IA: solo la ve el equipo docente" : "Sugerida por la IA"}
                    >
                      IA
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-[11px] text-demigrey">
                    p. {a.page} · {formatDate(a.created_at)}
                  </span>
                </div>
                {a.highlighted_text && (
                  <P className="mt-2 line-clamp-2 border-l-2 border-red pl-2 text-xs italic text-lemigrey">
                    {a.highlighted_text}
                  </P>
                )}
                {isEditing ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea
                      value={editing.text}
                      onChange={(e) => setEditing({ id: a.id, text: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditing(null);
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit();
                      }}
                      rows={3}
                      autoFocus
                      className="mt-2 w-full resize-y rounded-md bg-darkgrey px-2 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-red"
                    />
                    <div className="mt-1 flex justify-end gap-2">
                      <button onClick={() => setEditing(null)} className="px-2 py-1 text-xs text-demigrey hover:text-white">
                        Cancelar
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={saving || !editing.text.trim()}
                        className="rounded-md bg-red px-3 py-1 text-xs font-medium text-white hover:bg-red/80 disabled:opacity-50"
                      >
                        {suggested ? "Aceptar" : "Guardar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <P className="mt-2 whitespace-pre-wrap text-sm text-white">{a.comment}</P>
                )}
                {suggested && !readOnly && !isEditing && (
                  <div className="mt-2 flex gap-3" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => accept(a.id)} className="text-xs font-medium text-green-400 hover:text-green-300">
                      Aceptar
                    </button>
                    <button
                      onClick={() => setEditing({ id: a.id, text: a.comment })}
                      className="text-xs text-demigrey hover:text-white"
                    >
                      Editar
                    </button>
                    <button onClick={() => dismiss(a.id)} className="text-xs text-demigrey hover:text-red">
                      Descartar
                    </button>
                  </div>
                )}
                {own && !isEditing && (
                  <div className="mt-2 flex gap-3" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditing({ id: a.id, text: a.comment })}
                      className="text-xs text-demigrey hover:text-white"
                    >
                      Editar
                    </button>
                    <button onClick={() => remove(a.id)} className="text-xs text-demigrey hover:text-red">
                      Borrar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
