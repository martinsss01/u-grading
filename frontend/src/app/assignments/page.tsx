"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

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

    setSubmitting(true);
    try {
      await api.post("/api/v1/assignments/", {
        section_id: sectionId,
        title,
        type,
        rubric: rubric || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
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
          <h1 className="text-2xl font-bold text-white">New assignment</h1>

          {sections.length === 0 && (
            <p className="mt-3 rounded-md bg-charcoal p-3 text-sm text-white/80">
              No class sections yet. Seed some with{" "}
              <code className="rounded bg-black/30 px-1">docker compose exec backend python -m app.seed</code> before
              creating an assignment.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="section" className="block text-sm font-medium text-white">
                Class section
              </label>
              <select
                id="section"
                required
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
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
            </div>

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-white">
                Nombre de la evaluación
              </label>
              <input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Control 1, Tarea 2, etc."
                className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-white">
                  Tipo de evaluación
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as AssignmentType)}
                  className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                >
                  {ASSIGNMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="dueDate" className="block text-sm font-medium text-white">
                  Fecha
                </label>
                <input
                  id="dueDate"
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="rubric" className="block text-sm font-medium text-white">
                Temario
              </label>
              <textarea
                id="rubric"
                rows={3}
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                placeholder="Criterios de calificación y contenidos para esta tarea, control o examen."
                className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="block text-sm font-medium text-white">Preguntas</span>
                <button
                  type="button"
                  onClick={addField}
                  className="text-sm font-medium text-white/80 underline hover:text-white"
                >
                  + Agregar pregunta
                </button>
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
                    <button
                      type="button"
                      onClick={() => removeField(i)}
                      disabled={fields.length === 1}
                      className="px-2 text-white/60 hover:text-white disabled:opacity-30"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-espresso py-2 font-semibold text-white transition hover:bg-espresso/80 disabled:opacity-50"
            >
              {submitting ? "Creando..." : "Crear evaluación"}
            </button>
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
                <p className="mt-1 text-sm text-white/70">{a.questions.length} field(s)</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
