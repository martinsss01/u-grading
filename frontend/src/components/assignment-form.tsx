"use client";

import { useRef, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { P } from "@/components/ui/p";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/assignment";

export const ASSIGNMENT_TYPES = ["Tarea", "Ejercicio", "Control", "Examen"] as const;
export type AssignmentType = (typeof ASSIGNMENT_TYPES)[number];

export const MODALITIES = ["Presencial", "Remoto"] as const;
export type Modality = (typeof MODALITIES)[number];

// Evaluations usually taken in a room at a set time; the rest default to a
// date range. Only the starting choice — the professor can always switch.
const IN_PERSON_TYPES: AssignmentType[] = ["Ejercicio", "Control", "Examen"];
const defaultModality = (t: AssignmentType): Modality => (IN_PERSON_TYPES.includes(t) ? "Presencial" : "Remoto");

export type TeacherSection = {
  id: string;
  semester: string;
  year: number;
  section_number: number;
  course: { id: string; name: string; code: string };
};

export type TeacherAssignment = {
  id: string;
  section_id: string;
  title: string;
  type: AssignmentType;
  modality: Modality;
  status: string;
  open_date: string | null;
  due_date: string | null;
  rubric: string | null;
  filename: string | null;
  guideline_filename: string | null;
  statement_published: boolean;
  review_published: boolean;
};

// Converts an ISO due_date into the `yyyy-MM-ddThh:mm` format the native
// datetime-local input expects, in the browser's local time.
function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// End of an in-person evaluation: a datetime-local start plus a duration in
// hours, or null while either is missing/invalid.
function endDate(start: string, durationHours: string): Date | null {
  const hours = Number(durationHours);
  if (!start || !(hours > 0)) return null;
  return new Date(new Date(start).getTime() + hours * 3_600_000);
}

// Duration in hours between two datetime-local values, for opening an
// in-person evaluation in the form ("" if it can't be worked out).
function hoursBetween(start: string, end: string): string {
  if (!start || !end) return "";
  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  return hours > 0 ? String(Math.round(hours * 100) / 100) : "";
}

/**
 * Create/edit form for an assignment. State is initialised from props on
 * mount, so callers remount it (via `key`) to switch between assignments.
 * New assignments are created in `sectionId`.
 */
export function AssignmentForm({
  sectionId,
  editing,
  onSaved,
}: {
  sectionId: string;
  editing: TeacherAssignment | null;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [type, setType] = useState<AssignmentType>(editing?.type ?? "Tarea");
  const [openDate, setOpenDate] = useState(isoToDatetimeLocal(editing?.open_date ?? null));
  const [dueDate, setDueDate] = useState(isoToDatetimeLocal(editing?.due_date ?? null));
  const [modality, setModality] = useState<Modality>(editing?.modality ?? defaultModality(type));
  // Once the professor picks a modality themselves, changing the type stops
  // switching it for them.
  const [modalityTouched, setModalityTouched] = useState(!!editing);
  const [duration, setDuration] = useState(() => hoursBetween(openDate, dueDate));
  const [rubric, setRubric] = useState(editing?.rubric ?? "");
  // What students can see: the assignment itself, and their grades/TA comments.
  const [statementPublished, setStatementPublished] = useState(editing?.statement_published ?? false);
  const [reviewPublished, setReviewPublished] = useState(editing?.review_published ?? false);
  // The file to upload on submit, plus the name of whatever file the
  // assignment already has attached (shown while editing).
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const currentFilename = editing?.filename ?? null;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Private grading guideline (only teachers/TAs and the AI review see it).
  const [guidelineFile, setGuidelineFile] = useState<File | null>(null);
  const currentGuideline = editing?.guideline_filename ?? null;
  const guidelineInputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Switching carries over what was already entered: an end date becomes a
  // duration, and a duration becomes an end date.
  function switchModality(next: Modality) {
    if (next === modality) return;
    if (next === "Presencial") {
      setDuration(hoursBetween(openDate, dueDate));
    } else {
      const end = endDate(openDate, duration);
      if (end) setDueDate(isoToDatetimeLocal(end.toISOString()));
    }
    setModality(next);
  }

  function changeType(t: AssignmentType) {
    setType(t);
    if (!modalityTouched) switchModality(defaultModality(t));
  }

  const inPersonEnd = modality === "Presencial" ? endDate(openDate, duration) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (modality === "Presencial" && !inPersonEnd) {
      setError("Indica la fecha, hora y duración de la evaluación.");
      return;
    }

    const openDateIso = openDate ? new Date(openDate).toISOString() : null;
    const dueDateIso =
      modality === "Presencial" ? inPersonEnd!.toISOString() : dueDate ? new Date(dueDate).toISOString() : null;

    setSubmitting(true);
    try {
      let assignmentId = editing?.id ?? null;
      if (editing) {
        await api.patch(`/api/v1/assignments/${editing.id}`, {
          title, type, modality, rubric: rubric || null, open_date: openDateIso, due_date: dueDateIso,
          statement_published: statementPublished, review_published: reviewPublished,
        });
      } else {
        const res = await api.post<TeacherAssignment>("/api/v1/assignments/", {
          section_id: sectionId, title, type, modality, rubric: rubric || null, open_date: openDateIso, due_date: dueDateIso,
          statement_published: statementPublished, review_published: reviewPublished,
        });
        assignmentId = res.data.id;
      }

      if (assignmentFile && assignmentId) {
        const formData = new FormData();
        formData.append("file", assignmentFile);
        await api.post(`/api/v1/assignments/${assignmentId}/file`, formData, {
          headers: { "Content-Type": undefined },
        });
      }

      const raw = localStorage.getItem("user")!;
      const user = JSON.parse(raw) as { id: string };
      if (guidelineFile && assignmentId) {
        const formData = new FormData();
        formData.append("user_id", user.id);
        formData.append("file", guidelineFile);
        await api.post(`/api/v1/assignments/${assignmentId}/guideline`, formData, {
          headers: { "Content-Type": undefined },
        });
      }
      await onSaved();
    } catch {
      setError(editing ? "No se pudo guardar la evaluación." : "No se pudo crear la evaluación.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="type" className="text-white">Tipo</FieldLabel>
          <Select value={type} onValueChange={(v) => changeType(v as AssignmentType)}>
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
          <FieldTitle className="text-white">Modalidad</FieldTitle>
          <div role="group" aria-label="Modalidad" className="flex rounded-md bg-darkergrey p-1">
            {MODALITIES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={modality === m}
                onClick={() => { setModalityTouched(true); switchModality(m); }}
                className={`flex-1 rounded px-3 py-1 text-sm font-medium transition-colors ${
                  modality === m ? "bg-red text-white" : "text-demigrey hover:text-white"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {modality === "Presencial" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="openDate" className="text-white">Fecha y hora</FieldLabel>
            <Input
              id="openDate"
              type="datetime-local"
              lang="es-CL"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey [color-scheme:dark] focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="duration" className="text-white">Duración (horas)</FieldLabel>
            <Input
              id="duration"
              type="number"
              min={0.25}
              step={0.25}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="1.5"
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>

          {inPersonEnd && (
            <P className="-mt-2 text-xs text-demigrey sm:col-span-2">
              Termina: {formatDate(inPersonEnd.toISOString())}
            </P>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="openDate" className="text-white">Fecha de inicio</FieldLabel>
            <Input
              id="openDate"
              type="datetime-local"
              lang="es-CL"
              value={openDate}
              onChange={(e) => setOpenDate(e.target.value)}
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey [color-scheme:dark] focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="dueDate" className="text-white">Fecha de entrega</FieldLabel>
            <Input
              id="dueDate"
              type="datetime-local"
              lang="es-CL"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey [color-scheme:dark] focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>
        </div>
      )}

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
        <FieldTitle className="text-white">Documentos</FieldTitle>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => setAssignmentFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 rounded-md bg-darkergrey text-white hover:bg-grey/30"
          >
            {currentFilename || assignmentFile ? "Reemplazar archivo" : "Subir archivo"}
          </Button>
          <P className="truncate text-sm text-demigrey">
            {assignmentFile?.name ?? currentFilename ?? "Sin archivo adjunto"}
          </P>
        </div>
      </Field>

      <Field>
        <FieldTitle className="text-white">Pauta de corrección (privada)</FieldTitle>
        <P className="text-xs text-demigrey">
          Solo la ven los ayudantes y el profesor. La revisión con IA la usa como referencia.
        </P>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            ref={guidelineInputRef}
            onChange={(e) => setGuidelineFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <Button
            type="button"
            onClick={() => guidelineInputRef.current?.click()}
            className="shrink-0 rounded-md bg-darkergrey text-white hover:bg-grey/30"
          >
            {currentGuideline || guidelineFile ? "Reemplazar pauta" : "Subir pauta"}
          </Button>
          <P className="truncate text-sm text-demigrey">
            {guidelineFile?.name ?? currentGuideline ?? "Sin pauta"}
          </P>
        </div>
      </Field>

      <Field>
        <FieldTitle className="text-white">Visibilidad para estudiantes</FieldTitle>
        <label className="mt-2 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={statementPublished}
            onChange={(e) => setStatementPublished(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-red"
          />
          <span>
            <span className="block text-sm text-white">Publicar enunciado</span>
            <span className="block text-xs text-demigrey">Los estudiantes de la sección ven la evaluación y pueden entregar.</span>
          </span>
        </label>
        <label className="mt-2 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={reviewPublished}
            onChange={(e) => setReviewPublished(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-red"
          />
          <span>
            <span className="block text-sm text-white">Publicar corrección</span>
            <span className="block text-xs text-demigrey">Los estudiantes ven sus notas y los comentarios de los ayudantes.</span>
          </span>
        </label>
      </Field>

      {error && <P className="text-sm text-red/80">{error}</P>}

      <Button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
      >
        {submitting
          ? editing ? "Guardando..." : "Creando..."
          : editing ? "Guardar cambios" : "Crear evaluación"}
      </Button>
    </form>
  );
}
