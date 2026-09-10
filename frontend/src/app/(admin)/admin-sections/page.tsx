"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { courseCodeLabel } from "@/lib/course";
import { SEMESTER } from "@/lib/semester";
import { Button } from "@/components/ui/button";
import { P } from "@/components/ui/p";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SEMESTERS = [SEMESTER.FALL, SEMESTER.SPRING, SEMESTER.SUMMER] as const;

type Course = { id: string; name: string; code: string };
type Section = { id: string; semester: string; year: number; section_number: number; course: Course };

export default function AdminSectionsPage() {
  return (
    <Suspense fallback={null}>
      <AdminSectionsContent />
    </Suspense>
  );
}

function AdminSectionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sections, setSections] = useState<Section[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [courseId, setCourseId] = useState("");
  const [semester, setSemester] = useState<string>(SEMESTER.FALL);
  const [year, setYear] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Multiselect filters for the sections list. Kept in sync with the URL so
  // "Ver miembros" -> back restores the same filters instead of resetting them.
  function parseListParam(name: string): string[] {
    const raw = searchParams.get(name);
    return raw ? raw.split(",").filter(Boolean) : [];
  }
  const [selectedCourseIds, setSelectedCourseIdsState] = useState<string[]>(() =>
    parseListParam("courses")
  );
  const [selectedSectionNumbers, setSelectedSectionNumbersState] = useState<number[]>(() =>
    parseListParam("sectionNumbers").map(Number)
  );
  const [selectedSemesters, setSelectedSemestersState] = useState<string[]>(() =>
    parseListParam("semesters")
  );

  function syncFiltersUrl(courseIds: string[], sectionNumbers: number[], semesters: string[]) {
    const params = new URLSearchParams();
    if (courseIds.length > 0) params.set("courses", courseIds.join(","));
    if (sectionNumbers.length > 0) params.set("sectionNumbers", sectionNumbers.join(","));
    if (semesters.length > 0) params.set("semesters", semesters.join(","));
    const qs = params.toString();
    router.replace(qs ? `/admin-sections?${qs}` : "/admin-sections", { scroll: false });
  }

  function setCourseFilter(ids: string[]) {
    setSelectedCourseIdsState(ids);
    syncFiltersUrl(ids, selectedSectionNumbers, selectedSemesters);
  }

  function setSectionNumberFilter(nums: number[]) {
    setSelectedSectionNumbersState(nums);
    syncFiltersUrl(selectedCourseIds, nums, selectedSemesters);
  }

  function setSemesterFilter(sems: string[]) {
    setSelectedSemestersState(sems);
    syncFiltersUrl(selectedCourseIds, selectedSectionNumbers, sems);
  }

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
    // Role/session gating happens in the (admin) layout's RoleGuard.
    (async () => {
      try {
        await loadData();
      } catch {
        setLoadError("No se pudieron cargar las secciones.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function resetForm() {
    setCourseId(courses[0]?.id ?? "");
    setSemester(SEMESTER.FALL);
    setYear("");
    setEditingId(null);
    setError(null);
  }

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function startEdit(s: Section) {
    setCourseId(s.course.id);
    setSemester(s.semester);
    setYear(String(s.year));
    setEditingId(s.id);
    setConfirmDeleteId(null);
    setError(null);
    setShowForm(true);
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
      closeForm();
      await loadData();
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
      if (editingId === id) closeForm();
      await loadData();
    } catch {
      setError("No se pudo eliminar la sección.");
    } finally {
      setDeleting(false);
    }
  }

  const courseOptions = [...new Map(sections.map((s) => [s.course.id, s.course])).values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }));
  const sectionNumberOptions = [...new Set(sections.map((s) => s.section_number))]
    .sort((a, b) => a - b)
    .map((n) => ({ value: n, label: String(n) }));
  const semesterOptions = SEMESTERS.map((s) => ({ value: s, label: s }));

  const filteredSections = sections
    .filter((s) =>
      (selectedCourseIds.length === 0 || selectedCourseIds.includes(s.course.id)) &&
      (selectedSectionNumbers.length === 0 || selectedSectionNumbers.includes(s.section_number)) &&
      (selectedSemesters.length === 0 || selectedSemesters.includes(s.semester))
    )
    .sort((a, b) =>
      b.year - a.year ||
      a.semester.localeCompare(b.semester) ||
      a.course.name.localeCompare(b.course.name) ||
      a.section_number - b.section_number
    );

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">

        {/* ── Form modal ── */}
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Sección" : "Nueva Sección"}</DialogTitle>
          </DialogHeader>

          {courses.length === 0 && !loading && (
            <P className="mt-3 rounded-md bg-darkergrey p-3 text-sm text-demigrey">
              No hay cursos cargados en el sistema.
            </P>
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

            {error && <P className="text-sm text-red/80">{error}</P>}

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
        </DialogContent>
        </Dialog>

        {/* ── Sections list, with multiselect filters ── */}
        <section className="rounded-lg bg-darkergrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Secciones</h2>
            <Button
              onClick={openNewForm}
              className="rounded-md bg-red px-4 py-2 text-sm font-semibold text-white hover:bg-red/80"
            >
              Agregar nueva sección
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MultiSelectFilter
              label="Curso"
              options={courseOptions}
              selected={selectedCourseIds}
              onChange={setCourseFilter}
            />
            <MultiSelectFilter
              label="Sección"
              options={sectionNumberOptions}
              selected={selectedSectionNumbers}
              onChange={setSectionNumberFilter}
            />
            <MultiSelectFilter
              label="Semestre"
              options={semesterOptions}
              selected={selectedSemesters}
              onChange={setSemesterFilter}
            />
          </div>

          {loading && <P className="mt-4 text-sm text-demigrey">Cargando...</P>}
          {loadError && <P className="mt-4 text-sm text-red/80">{loadError}</P>}

          {!loading && !loadError && (
            <ul className="mt-4 space-y-3">
              {filteredSections.length === 0 && (
                <P className="text-sm text-demigrey">
                  {sections.length === 0 ? "No hay secciones creadas." : "No hay secciones que coincidan con los filtros."}
                </P>
              )}
              {filteredSections.map((s) => {
                const isConfirming = confirmDeleteId === s.id;
                return (
                  <li key={s.id} className="rounded-md bg-darkgrey p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <P className="truncate font-semibold text-white">{s.course.name}</P>
                        <P className="mt-0.5 text-xs text-demigrey">
                          {courseCodeLabel(s.course, s.section_number)} · {s.semester} {s.year}
                        </P>
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
