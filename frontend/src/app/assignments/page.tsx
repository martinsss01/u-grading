"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Paperclip, PlusIcon, XIcon } from "lucide-react";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { AssignmentForm, type TeacherAssignment, type TeacherSection } from "@/components/assignment-form";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";
import {
  computeAssignmentStatus,
  formatDate,
  groupByType,
  STATUS_COLORS,
  timeLeftLabel,
  TYPE_ORDER,
  TYPE_PLURAL,
} from "@/lib/assignment";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// The create/edit dialog: which section it creates in, and the assignment
// being edited (null for a new one).
type DialogState = { section: TeacherSection; editing: TeacherAssignment | null };

export default function AssignmentsPage() {
  return (
    <Suspense fallback={null}>
      <AssignmentsContent />
    </Suspense>
  );
}

function AssignmentsContent() {
  const router = useRouter();
  const sectionId = useSearchParams().get("sectionId");

  const [sections, setSections] = useState<TeacherSection[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Ticks once a minute so open assignments' countdowns and statuses stay
  // live without a page reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  async function loadData() {
    const raw = localStorage.getItem("user");
    if (!raw) { router.push("/"); return; }
    const user = JSON.parse(raw) as { id: string };
    try {
      const [sectionsRes, assignmentsRes] = await Promise.all([
        api.get<TeacherSection[]>(`/api/v1/sections/teacher/${user.id}`),
        api.get<TeacherAssignment[]>(`/api/v1/assignments/teacher/${user.id}`),
      ]);
      setSections(sectionsRes.data);
      setAssignments(assignmentsRes.data);
    } catch {
      setError("No se pudieron cargar las evaluaciones.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => { await loadData(); })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSaved() {
    setDialog(null);
    await loadData();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/assignments/${id}`);
      setConfirmDeleteId(null);
      await loadData();
    } catch {
      setError("No se pudo eliminar la evaluación.");
    } finally {
      setDeleting(false);
    }
  }

  // A selected section is shown even if it's from another semester; the
  // plain view lists every current-semester section.
  const current = getCurrentSemester();
  const visibleSections = (
    sectionId
      ? sections.filter((s) => s.id === sectionId)
      : sections.filter((s) => s.semester === current.semester && s.year === current.year)
  ).sort((a, b) => a.course.name.localeCompare(b.course.name) || a.section_number - b.section_number);

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-baseline gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative size-7 shrink-0">
              <Image src="/images/Evaluations.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
            </span>
            <h1 className="text-2xl font-bold text-white">Mis Evaluaciones</h1>
          </div>
          <Combobox multiple value={typeFilter} onValueChange={setTypeFilter}>
            <ComboboxTrigger className="flex items-center gap-1.5 rounded-md bg-darkergrey px-3 py-2 text-sm text-white transition-colors hover:bg-darkergrey/70 focus-visible:border-red/50 focus-visible:ring-red/20">
              <ComboboxValue placeholder="Todos los tipos">
                {(value: string[]) =>
                  value.length === 0 ? "Todos los tipos" : `Tipo (${value.length})`
                }
              </ComboboxValue>
            </ComboboxTrigger>
            <ComboboxContent>
              <ComboboxList>
                {TYPE_ORDER.map((type) => (
                  <ComboboxItem key={type} value={type}>
                    {TYPE_PLURAL[type] ?? type}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          {typeFilter.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-demigrey hover:text-white"
              onClick={() => setTypeFilter([])}
              aria-label="Limpiar filtro de tipos"
            >
              <XIcon />
            </Button>
          )}
        </div>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="mb-6 rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {!loading && visibleSections.length === 0 && (
          <P className="text-demigrey">
            {sectionId ? "No se encontró el curso." : "No tienes cursos asignados este semestre."}
          </P>
        )}

        <div className="space-y-6">
          {visibleSections.map((section) => {
            const items = assignments.filter(
              (a) => a.section_id === section.id && (typeFilter.length === 0 || typeFilter.includes(a.type))
            );
            return (
              <section key={section.id} className="rounded-lg bg-darkgrey shadow-lg">
                <div className="flex items-center justify-between gap-4 rounded-t-lg bg-darkergrey px-6 py-4">
                  <div>
                    <h2 className="text-lg font-bold text-white">{section.course.name}</h2>
                    <P className="mt-0.5 text-sm text-demigrey">
                      {courseCodeLabel(section.course, section.section_number)} · {section.semester} {section.year}
                    </P>
                  </div>
                  <Button
                    onClick={() => setDialog({ section, editing: null })}
                    className="shrink-0 rounded-md bg-red font-semibold text-white hover:bg-red/80"
                  >
                    <PlusIcon />
                    Nueva evaluación
                  </Button>
                </div>

                {items.length === 0 ? (
                  <P className="px-6 py-4 text-sm text-demigrey">Sin evaluaciones.</P>
                ) : (
                  <div className="divide-y divide-grey/20">
                    {groupByType(items).map(([type, group]) => (
                      <div key={type}>
                        <div className="flex items-center gap-4 px-6 pt-4 pb-2">
                          <P className="flex-1 text-xs font-semibold uppercase tracking-widest text-demigrey">
                            {TYPE_PLURAL[type] ?? type}
                          </P>
                          <span className="w-28 shrink-0 text-center text-xs uppercase tracking-widest text-demigrey">Estado</span>
                        </div>
                        <ul>
                          {group.map((a) => {
                            const status = computeAssignmentStatus(a.open_date, a.due_date, now);
                            const isConfirming = confirmDeleteId === a.id;
                            return (
                              <li key={a.id} className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-darkergrey/50">
                                <div className="min-w-0 flex-1">
                                  <Link
                                    href={`/assignments/${a.id}`}
                                    className="font-medium text-white underline-offset-2 hover:underline"
                                  >
                                    {a.title}
                                  </Link>
                                  {a.due_date && (
                                    <P className="mt-0.5 text-xs text-demigrey">
                                      Entrega: {formatDate(a.due_date)}
                                      {status === "Abierto" && (
                                        <span className="ml-2 rounded-full bg-red/20 px-2 py-0.5 text-xs font-medium text-white">
                                          Quedan {timeLeftLabel(a.due_date, now)}
                                        </span>
                                      )}
                                    </P>
                                  )}
                                  <P className="mt-0.5 text-xs text-demigrey">
                                    {a.statement_published ? "Enunciado publicado" : "Enunciado oculto"}
                                    {" · "}
                                    {a.review_published ? "Corrección publicada" : "Corrección oculta"}
                                  </P>
                                  <div className="mt-1.5 flex items-center gap-3">
                                    <Link
                                      href={`/assignments/${a.id}`}
                                      className="text-xs font-medium text-demigrey hover:text-white"
                                    >
                                      Correcciones
                                    </Link>
                                    <button
                                      onClick={() => { setConfirmDeleteId(null); setDialog({ section, editing: a }); }}
                                      className="text-xs text-demigrey hover:text-white"
                                    >
                                      Editar
                                    </button>
                                    {isConfirming ? (
                                      <>
                                        <button
                                          onClick={() => handleDelete(a.id)}
                                          disabled={deleting}
                                          className="text-xs font-medium text-red hover:text-red/80 disabled:opacity-50"
                                        >
                                          {deleting ? "..." : "Confirmar eliminación"}
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteId(null)}
                                          className="text-xs text-demigrey hover:text-white"
                                        >
                                          Cancelar
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => setConfirmDeleteId(a.id)}
                                        className="text-xs text-demigrey hover:text-red"
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                    {a.filename && (
                                      <a
                                        href={`${API_BASE}/api/v1/assignments/${a.id}/file`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-w-0 items-center gap-1 text-xs text-demigrey hover:text-white"
                                      >
                                        <Paperclip className="size-3.5 shrink-0" />
                                        <span className="truncate">{a.filename}</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                                <span
                                  className={`w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-xs font-medium ${STATUS_COLORS[status] ?? "bg-grey/20 text-lemigrey"}`}
                                >
                                  {status}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {/* Only the X closes it: a stray click outside or Esc would throw away
          a half-filled form. */}
      <Dialog
        open={dialog !== null}
        disablePointerDismissal
        onOpenChange={(open, details) => { if (!open && details.reason === "close-press") setDialog(null); }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          {dialog && (
            <>
              <DialogHeader className="block">
                <DialogTitle>{dialog.editing ? "Editar Evaluación" : "Nueva Evaluación"}</DialogTitle>
                <P className="mt-1 text-sm text-demigrey">
                  {dialog.section.course.name} · {courseCodeLabel(dialog.section.course, dialog.section.section_number)} · {dialog.section.semester} {dialog.section.year}
                </P>
              </DialogHeader>
              <AssignmentForm
                key={dialog.editing?.id ?? `new-${dialog.section.id}`}
                sectionId={dialog.section.id}
                editing={dialog.editing}
                onSaved={handleSaved}
              />
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
