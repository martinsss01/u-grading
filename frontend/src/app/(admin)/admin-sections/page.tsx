"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { courseCodeLabel } from "@/lib/course";
import { SEMESTER } from "@/lib/semester";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEMESTERS = [SEMESTER.FALL, SEMESTER.SPRING] as const;

type Course = { id: string; name: string; code: string };
type Section = { id: string; semester: string; year: number; course: Course };

export default function AdminSectionsPage() {
  const router = useRouter();

  const [sections, setSections] = useState<Section[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [courseId, setCourseId] = useState("");
  const [semester, setSemester] = useState<string>(SEMESTER.FALL);
  const [year, setYear] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Drill-down navigation for the sections list: year -> semester -> sections.
  const [drillYear, setDrillYear] = useState<number | null>(null);
  const [drillSemester, setDrillSemester] = useState<string | null>(null);

  async function loadData() {
    const [sectionsRes, coursesRes] = await Promise.all([
      api.get<Section[]>("/api/v1/sections/"),
      api.get<Course[]>("/api/v1/courses/"),
    ]);
    setSections(sectionsRes.data);
    setCourses(coursesRes.data);
    if (coursesRes.data.length > 0) setCourseId((cur) => cur || coursesRes.data[0].id);
  }

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) { router.push("/"); return; }
    const user = JSON.parse(raw) as { role: string };
    if (user.role !== "Administrador") { router.push("/"); return; }

    (async () => {
      try {
        await loadData();
      } catch {
        setLoadError("No se pudieron cargar las secciones.");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setCourseId(courses[0]?.id ?? "");
    setSemester(SEMESTER.FALL);
    setYear("");
    setEditingId(null);
    setError(null);
  }

  function startEdit(s: Section) {
    setCourseId(s.course.id);
    setSemester(s.semester);
    setYear(String(s.year));
    setEditingId(s.id);
    setConfirmDeleteId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!courseId) { setError("Selecciona un curso."); return; }
    const yearNum = parseInt(year, 10);
    if (!yearNum) { setError("Ingresa un año válido."); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        await api.patch(`/api/v1/sections/${editingId}`, {
          course_id: courseId, semester, year: yearNum,
        });
      } else {
        await api.post("/api/v1/sections/", {
          course_id: courseId, semester, year: yearNum,
        });
      }
      resetForm();
      await loadData();
      setDrillYear(yearNum);
      setDrillSemester(semester);
    } catch {
      setError(editingId ? "No se pudo guardar la sección." : "No se pudo crear la sección.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/sections/${id}`);
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
      await loadData();
    } catch {
      setError("No se pudo eliminar la sección.");
    } finally {
      setDeleting(false);
    }
  }

  const years = [...new Set(sections.map((s) => s.year))].sort((a, b) => b - a);
  const semestersForYear = (y: number) =>
    SEMESTERS.filter((sem) => sections.some((s) => s.year === y && s.semester === sem));
  const sectionsFor = (y: number, sem: string) =>
    sections.filter((s) => s.year === y && s.semester === sem);

  function drillBack() {
    if (drillSemester !== null) setDrillSemester(null);
    else setDrillYear(null);
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">

        {/* ── Form panel ── */}
        <section className="rounded-lg bg-darkgrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              {editingId ? "Editar Sección" : "Nueva Sección"}
            </h1>
            {editingId && (
              <button onClick={resetForm} className="text-sm text-demigrey hover:text-white">
                Cancelar
              </button>
            )}
          </div>

          {courses.length === 0 && !loading && (
            <p className="mt-3 rounded-md bg-darkergrey p-3 text-sm text-demigrey">
              No hay cursos cargados en el sistema.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field>
              <FieldLabel className="text-white">Curso</FieldLabel>
              <Select value={courseId} onValueChange={(v) => setCourseId(v ?? "")}>
                <SelectTrigger className="w-full rounded-md bg-darkergrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
                  <SelectValue placeholder="Selecciona un curso">
                    {(() => {
                      const c = courses.find((course) => course.id === courseId);
                      return c ? `${c.name} (${c.code})` : null;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel className="text-white">Semestre</FieldLabel>
                <Select value={semester} onValueChange={(v) => setSemester(v ?? SEMESTER.FALL)}>
                  <SelectTrigger className="w-full rounded-md bg-darkergrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTERS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="year" className="text-white">Año</FieldLabel>
                <Input
                  id="year"
                  type="number"
                  required
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026"
                  className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
                />
              </Field>
            </div>

            {error && <p className="text-sm text-red/80">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
            >
              {submitting
                ? editingId ? "Guardando..." : "Creando..."
                : editingId ? "Guardar cambios" : "Crear sección"}
            </Button>
          </form>
        </section>

        {/* ── Sections list (year → semester → sections) ── */}
        <section className="rounded-lg bg-darkergrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Secciones</h2>
              {drillYear !== null && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-demigrey">
                  {drillYear}{drillSemester ? ` · ${drillSemester}` : ""}
                </p>
              )}
            </div>
            {drillYear !== null && (
              <button onClick={drillBack} className="text-sm text-demigrey hover:text-white">
                ← Volver
              </button>
            )}
          </div>

          {loading && <p className="mt-4 text-sm text-demigrey">Cargando...</p>}
          {loadError && <p className="mt-4 text-sm text-red/80">{loadError}</p>}

          {!loading && !loadError && drillYear === null && (
            <div className="mt-4 space-y-2">
              {years.length === 0 && (
                <p className="text-sm text-demigrey">No hay secciones creadas.</p>
              )}
              {years.map((y) => (
                <button
                  key={y}
                  onClick={() => setDrillYear(y)}
                  className="group flex w-full items-center justify-between rounded-md bg-darkgrey px-4 py-3 text-left transition-colors hover:bg-darkgrey/70"
                >
                  <span className="font-semibold text-white">{y}</span>
                  <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                </button>
              ))}
            </div>
          )}

          {!loading && !loadError && drillYear !== null && drillSemester === null && (
            <div className="mt-4 space-y-2">
              {semestersForYear(drillYear).map((sem) => (
                <button
                  key={sem}
                  onClick={() => setDrillSemester(sem)}
                  className="group flex w-full items-center justify-between rounded-md bg-darkgrey px-4 py-3 text-left transition-colors hover:bg-darkgrey/70"
                >
                  <span className="font-semibold text-white">{sem}</span>
                  <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                </button>
              ))}
            </div>
          )}

          {!loading && !loadError && drillYear !== null && drillSemester !== null && (
            <ul className="mt-4 space-y-3">
              {sectionsFor(drillYear, drillSemester).length === 0 && (
                <p className="text-sm text-demigrey">No hay secciones en este semestre.</p>
              )}
              {sectionsFor(drillYear, drillSemester).map((s) => {
                const isConfirming = confirmDeleteId === s.id;
                return (
                  <li key={s.id} className="rounded-md bg-darkgrey p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{s.course.name}</p>
                        <p className="mt-0.5 text-xs text-demigrey">
                          {courseCodeLabel(s.course)} · {s.semester} {s.year}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => router.push(`/admin-sections/${s.id}`)}
                          className="text-xs text-demigrey hover:text-white"
                        >
                          Ver miembros
                        </button>
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-demigrey hover:text-white"
                        >
                          Editar
                        </button>
                        {isConfirming ? (
                          <>
                            <button
                              onClick={() => handleDelete(s.id)}
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
                            onClick={() => setConfirmDeleteId(s.id)}
                            className="text-xs text-demigrey hover:text-red"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      </div>
    </main>
  );
}
