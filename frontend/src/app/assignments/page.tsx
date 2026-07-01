"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const ASSIGNMENT_TYPES = ["Tarea", "Ejercicio", "Control", "Examen"] as const;
type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

type Section = {
  id: string;
  semester: string;
  year: number;
  course: { id: string; name: string; code: string };
};

type Question = {
  id: string;
  number: number;
  description: string;
  max_points: number;
};

type Assignment = {
  id: string;
  section_id: string;
  title: string;
  type: AssignmentType;
  status: string;
  due_date: string | null;
  rubric: string | null;
  questions: Question[];
};

type QuestionField = { description: string; maxPoints: string };

const emptyField: QuestionField = { description: "", maxPoints: "" };

const DUE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;

function parseDueDate(value: string): Date | null {
  const match = value.trim().match(DUE_DATE_PATTERN);
  if (!match) return null;
  const [, d, m, y, h = "00", min = "00"] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  return date.getFullYear() === Number(y) && date.getMonth() === Number(m) - 1 && date.getDate() === Number(d)
    ? date
    : null;
}

function formatDueDateForInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AssignmentsPage() {
  const router = useRouter();
  const formRef = useRef<HTMLElement>(null);

  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AssignmentType>("Tarea");
  const [sectionId, setSectionId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [rubric, setRubric] = useState("");
  const [fields, setFields] = useState<QuestionField[]>([{ ...emptyField }]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadData(userId: string) {
    const [sectionsRes, assignmentsRes] = await Promise.all([
      api.get<Section[]>(`/api/v1/sections/teacher/${userId}`),
      api.get<Assignment[]>(`/api/v1/assignments/teacher/${userId}`),
    ]);
    setSections(sectionsRes.data);
    if (sectionsRes.data.length > 0) setSectionId((cur) => cur || sectionsRes.data[0].id);
    setAssignments(assignmentsRes.data);
  }

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { router.push("/"); return; }
    const user = JSON.parse(raw) as { id: string };
    (async () => { await loadData(user.id); })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setTitle("");
    setType("Tarea");
    setDueDate("");
    setRubric("");
    setFields([{ ...emptyField }]);
    setEditingId(null);
    setError(null);
  }

  function startEdit(a: Assignment) {
    setTitle(a.title);
    setType(a.type);
    setSectionId(a.section_id);
    setDueDate(formatDueDateForInput(a.due_date));
    setRubric(a.rubric ?? "");
    setFields(
      a.questions.length > 0
        ? a.questions
            .slice()
            .sort((x, y) => x.number - y.number)
            .map((q) => ({ description: q.description, maxPoints: String(q.max_points) }))
        : [{ ...emptyField }]
    );
    setEditingId(a.id);
    setConfirmDeleteId(null);
    setError(null);
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function updateField(index: number, patch: Partial<QuestionField>) {
    setFields((cur) => cur.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sectionId) { setError("Selecciona una sección primero."); return; }

    let dueDateIso: string | null = null;
    if (dueDate.trim()) {
      const parsed = parseDueDate(dueDate);
      if (!parsed) { setError("La fecha debe tener el formato dd/mm/aaaa (opcionalmente hh:mm)."); return; }
      dueDateIso = parsed.toISOString();
    }

    const questions = fields
      .filter((f) => f.description.trim())
      .map((f, i) => ({ number: i + 1, description: f.description, max_points: parseFloat(f.maxPoints) || 0 }));

    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/api/v1/assignments/${editingId}`, {
          title, type, rubric: rubric || null, due_date: dueDateIso, questions,
        });
      } else {
        await api.post("/api/v1/assignments/", {
          section_id: sectionId, title, type, rubric: rubric || null, due_date: dueDateIso, questions,
        });
      }
      const raw = localStorage.getItem("user")!;
      const user = JSON.parse(raw) as { id: string };
      resetForm();
      await loadData(user.id);
    } catch {
      setError(editingId ? "No se pudo guardar la evaluación." : "No se pudo crear la evaluación.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/assignments/${id}`);
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
      const raw = localStorage.getItem("user")!;
      const user = JSON.parse(raw) as { id: string };
      await loadData(user.id);
    } catch {
      setError("No se pudo eliminar la evaluación.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">

        {/* ── Form panel ── */}
        <section ref={formRef} className="rounded-lg bg-darkgrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              {editingId ? "Editar Evaluación" : "Nueva Evaluación"}
            </h1>
            {editingId && (
              <button onClick={resetForm} className="text-sm text-demigrey hover:text-white">
                Cancelar
              </button>
            )}
          </div>

          {sections.length === 0 && (
            <p className="mt-3 rounded-md bg-darkergrey p-3 text-sm text-demigrey">
              No tienes secciones asignadas. Ejecuta{" "}
              <code className="rounded bg-black/30 px-1 text-lightgrey">docker compose exec backend python -m app.seed</code>.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field>
              <FieldLabel className="text-white">Clase y sección</FieldLabel>
              <Select value={sectionId} onValueChange={(v) => setSectionId(v ?? "")} disabled={!!editingId}>
                <SelectTrigger className="w-full rounded-md bg-darkergrey text-white focus-visible:border-red/50 focus-visible:ring-red/20 disabled:opacity-50">
                  <SelectValue placeholder="Selecciona una sección">
                    {(() => {
                      const s = sections.find((sec) => sec.id === sectionId);
                      return s ? `${s.course.name} (${s.course.code}) · ${s.semester} ${s.year}` : null;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.course.name} ({s.course.code}) · {s.semester} {s.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="title" className="text-white">Nombre de la evaluación</FieldLabel>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Control 1, Tarea 2, etc."
                className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="type" className="text-white">Tipo</FieldLabel>
                <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
                  <SelectTrigger className="w-full rounded-md bg-darkergrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="dueDate" className="text-white">Fecha de entrega</FieldLabel>
                <Input
                  id="dueDate"
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa hh:mm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rubric" className="text-white">Descripción y criterios</FieldLabel>
              <Textarea
                id="rubric"
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                placeholder="Criterios de calificación y contenidos."
                className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldTitle className="text-white">Preguntas</FieldTitle>
                <Button type="button" variant="link" onClick={() => setFields((f) => [...f, { ...emptyField }])} className="text-white">
                  + Agregar pregunta
                </Button>
              </div>
              <div className="mt-2 space-y-2">
                {fields.map((field, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="mt-2 w-5 text-sm text-demigrey">{i + 1}.</span>
                    <Input
                      value={field.description}
                      onChange={(e) => updateField(i, { description: e.target.value })}
                      placeholder="Descripción de la pregunta"
                      className="flex-1 rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
                    />
                    <Input
                      value={field.maxPoints}
                      onChange={(e) => updateField(i, { maxPoints: e.target.value })}
                      type="number" min="0" step="0.5" placeholder="Pts"
                      className="w-20 rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
                    />
                    <Button
                      type="button" variant="ghost" size="icon-sm"
                      onClick={() => setFields((f) => f.filter((_, j) => j !== i))}
                      disabled={fields.length === 1}
                      className="text-demigrey hover:text-white disabled:opacity-30"
                    >✕</Button>
                  </div>
                ))}
              </div>
            </Field>

            {error && <p className="text-sm text-red/80">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
            >
              {submitting
                ? editingId ? "Guardando..." : "Creando..."
                : editingId ? "Guardar cambios" : "Crear evaluación"}
            </Button>
          </form>
        </section>

        {/* ── Assignments list ── */}
        <section className="rounded-lg bg-darkergrey p-8 shadow-lg">
          <h2 className="text-xl font-bold text-white">Evaluaciones</h2>
          <ul className="mt-4 space-y-3">
            {assignments.length === 0 && (
              <p className="text-sm text-demigrey">No hay evaluaciones creadas.</p>
            )}
            {assignments.map((a) => {
              const section = sections.find((s) => s.id === a.section_id);
              const isConfirming = confirmDeleteId === a.id;
              return (
                <li key={a.id} className="rounded-md bg-darkgrey p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{a.title}</p>
                      <p className="mt-0.5 text-xs text-demigrey">
                        {a.type}
                        {section ? ` · ${section.course.code} ${section.semester} ${section.year}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => startEdit(a)}
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
                            {deleting ? "..." : "Confirmar"}
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
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-demigrey">Estado: {a.status}</p>
                </li>
              );
            })}
          </ul>
        </section>

      </div>
    </main>
  );
}
