"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";

const ASSIGNMENT_TYPES = ["Tarea", "Ejercicio", "Control", "Examen"] as const;
type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

type Section = {
  id: string;
  semester: "fall" | "spring";
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
  title: string;
  type: AssignmentType;
  status: string;
  due_date: string | null;
  questions: Question[];
};

type QuestionField = {
  description: string;
  maxPoints: string;
};

const emptyField: QuestionField = { description: "", maxPoints: "" };

const DUE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/;

function parseDueDate(value: string): Date | null {
  const match = value.trim().match(DUE_DATE_PATTERN);
  if (!match) return null;
  const [, dayStr, monthStr, yearStr, hourStr = "00", minuteStr = "00"] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  const date = new Date(year, month - 1, day, hour, minute);
  const isRealDate = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isRealDate ? date : null;
}

export default function AssignmentsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<AssignmentType>("Tarea");
  const [sectionId, setSectionId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [rubric, setRubric] = useState("");
  const [fields, setFields] = useState<QuestionField[]>([{ ...emptyField }]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadAssignments() {
    const res = await api.get<Assignment[]>("/api/v1/assignments/");
    setAssignments(res.data);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      const [sectionsRes, assignmentsRes] = await Promise.all([
        api.get<Section[]>("/api/v1/sections/"),
        api.get<Assignment[]>("/api/v1/assignments/"),
      ]);
      if (!active) return;
      setSections(sectionsRes.data);
      if (sectionsRes.data.length > 0) setSectionId((current) => current || sectionsRes.data[0].id);
      setAssignments(assignmentsRes.data);
    })();
    return () => {
      active = false;
    };
  }, []);

  function updateField(index: number, patch: Partial<QuestionField>) {
    setFields((current) => current.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((current) => [...current, { ...emptyField }]);
  }

  function removeField(index: number) {
    setFields((current) => current.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!sectionId) {
      setError("Select a class section first.");
      return;
    }

    let dueDateIso: string | null = null;
    if (dueDate.trim() !== "") {
      const parsed = parseDueDate(dueDate);
      if (!parsed) {
        setError("La fecha debe tener el formato dd/mm/aaaa (opcionalmente hh:mm).");
        return;
      }
      dueDateIso = parsed.toISOString();
    }

    setSubmitting(true);
    try {
      await api.post("/api/v1/assignments/", {
        section_id: sectionId,
        title,
        type,
        rubric: rubric || null,
        due_date: dueDateIso,
        questions: fields
          .filter((f) => f.description.trim() !== "")
          .map((f, i) => ({
            number: i + 1,
            description: f.description,
            max_points: parseFloat(f.maxPoints) || 0,
          })),
      });

      setTitle("");
      setRubric("");
      setDueDate("");
      setFields([{ ...emptyField }]);
      await loadAssignments();
    } catch {
      setError("Couldn't create the assignment. Check the fields and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
        <section className="rounded-lg bg-maroon p-8 shadow-lg">
          <h1 className="text-2xl font-bold text-white">Nueva Evaluación</h1>

          {sections.length === 0 && (
            <p className="mt-3 rounded-md bg-charcoal p-3 text-sm text-white/80">
              No class sections yet. Seed some with{" "}
              <code className="rounded bg-black/30 px-1">docker compose exec backend python -m app.seed</code> before
              creating an assignment.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field>
              <FieldLabel htmlFor="section" className="text-white">
                Clase y sección
              </FieldLabel>
              <select
                id="section"
                required
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full rounded-md bg-charcoal px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
              >
                <option value="" disabled>
                  Selecciona una sección
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.course.code} · {s.semester} {s.year}
                  </option>
                ))}
              </select>
            </Field>

            <Field>
              <FieldLabel htmlFor="title" className="text-white">
                Nombre de la evaluación
              </FieldLabel>
              <input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Control 1, Tarea 2, etc."
                className="w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="type" className="text-white">
                  Tipo de evaluación
                </FieldLabel>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as AssignmentType)}
                  className="w-full rounded-md bg-charcoal px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                >
                  {ASSIGNMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="dueDate" className="text-white">
                  Fecha
                </FieldLabel>
                <input
                  id="dueDate"
                  type="text"
                  inputMode="numeric"
                  placeholder="dd/mm/aaaa hh:mm"
                  pattern="\d{2}/\d{2}/\d{4}(\s\d{2}:\d{2})?"
                  title="Formato: dd/mm/aaaa o dd/mm/aaaa hh:mm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="rubric" className="text-white">
                Descripción y criterios de calificación
              </FieldLabel>
              <textarea
                id="rubric"
                rows={3}
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                placeholder="Criterios de calificación y contenidos para esta tarea, control o examen."
                className="w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
              />
            </Field>

            <Field>
              <div className="flex items-center justify-between">
                <FieldTitle className="text-white">Preguntas</FieldTitle>
                <Button
                  type="button"
                  variant="link"
                  onClick={addField}
                  className="text-white/80 hover:text-white"
                >
                  + Agregar pregunta
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {fields.map((field, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="mt-2 w-5 text-sm text-white/60">{i + 1}.</span>
                    <input
                      value={field.description}
                      onChange={(e) => updateField(i, { description: e.target.value })}
                      placeholder="Descripción de la pregunta"
                      className="flex-1 rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                    />
                    <input
                      value={field.maxPoints}
                      onChange={(e) => updateField(i, { maxPoints: e.target.value })}
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Pts"
                      className="w-20 rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeField(i)}
                      disabled={fields.length === 1}
                      className="text-white/60 hover:text-white disabled:opacity-30"
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </Field>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-espresso py-2 font-semibold text-white hover:bg-espresso/80"
            >
              {submitting ? "Creando..." : "Crear evaluación"}
            </Button>
          </form>
        </section>

        <section className="rounded-lg bg-charcoal p-8 shadow-lg">
          <h2 className="text-xl font-bold text-white">Evaluaciones</h2>
          <ul className="mt-4 space-y-3">
            {assignments.length === 0 && <p className="text-sm text-white/60">No hay evaluaciones creadas.</p>}
            {assignments.map((a) => (
              <li key={a.id} className="rounded-md bg-maroon p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{a.title}</span>
                  <span className="text-xs uppercase text-white/60">{a.type}</span>
                </div>
                <p className="mt-1 text-sm text-white/70">Estado {a.status}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
