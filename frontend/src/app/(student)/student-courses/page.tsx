"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";
import { courseCodeLabel } from "@/lib/course";
import { SEMESTER } from "@/lib/semester";
import {
  Combobox,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";

type Course = {
  id: string;
  name: string;
  code: string;
};

type Section = {
  id: string;
  semester: string;
  year: number;
  section_number: number;
  course: Course;
};

type SemesterGroup = {
  label: string;
  year: number;
  semester: string;
  sections: Section[];
};

// Within a year, Verano (Dec-Jan) comes after Primavera (Aug-Nov), which
// comes after Otoño (Mar-Jul), so Verano is listed first when sorting
// most-recent-first.
const SEMESTER_ORDER = [SEMESTER.SUMMER, SEMESTER.SPRING, SEMESTER.FALL];

function groupBySemester(sections: Section[]): SemesterGroup[] {
  const map = new Map<string, SemesterGroup>();
  for (const s of sections) {
    const key = `${s.semester}-${s.year}`;
    if (!map.has(key)) {
      map.set(key, { label: `${s.semester} ${s.year}`, year: s.year, semester: s.semester, sections: [] });
    }
    map.get(key)!.sections.push(s);
  }
  return [...map.values()].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return SEMESTER_ORDER.indexOf(a.semester as (typeof SEMESTER_ORDER)[number]) -
      SEMESTER_ORDER.indexOf(b.semester as (typeof SEMESTER_ORDER)[number]);
  });
}

export default function StudentCoursesPage() {
  const router = useRouter();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("Estudiante");
  const [semesterFilter, setSemesterFilter] = useState<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/");
      return;
    }
    const user = JSON.parse(raw) as { id: string; role?: string };
    // One-shot read of the logged-in user's role on mount, not a value derived
    // from render output — the cascading-render concern the rule guards against
    // doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user.role) setRole(user.role);

    api
      .get<Section[]>(`/api/v1/sections/student/${user.id}`)
      .then((res) => setSections(res.data))
      .catch(() => setError("No se pudieron cargar los cursos."))
      .finally(() => setLoading(false));
  }, [router]);

  const allGroups = groupBySemester(sections);
  const semesterOptions = allGroups.map((g) => ({ key: `${g.semester}-${g.year}`, label: g.label }));
  const visibleGroups =
    semesterFilter.length === 0
      ? allGroups
      : allGroups.filter((g) => semesterFilter.includes(`${g.semester}-${g.year}`));

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="relative size-7 shrink-0">
            <Image src="/images/Courses.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
          </span>
          <h1 className="text-2xl font-bold text-white">Mis Cursos</h1>

          {semesterOptions.length > 0 && (
            <Combobox multiple value={semesterFilter} onValueChange={setSemesterFilter}>
              <ComboboxTrigger className="flex items-center gap-1.5 rounded-md bg-darkergrey px-3 py-2 text-sm text-white transition-colors hover:bg-darkergrey/70 focus-visible:border-red/50 focus-visible:ring-red/20">
                <ComboboxValue placeholder="Todos los semestres">
                  {(value: string[]) =>
                    value.length === 0 ? "Todos los semestres" : `Semestre (${value.length})`
                  }
                </ComboboxValue>
              </ComboboxTrigger>
              <ComboboxContent>
                <ComboboxList>
                  {semesterOptions.map((opt) => (
                    <ComboboxItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </ComboboxItem>
                  ))}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          )}

          {semesterFilter.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="text-demigrey hover:text-white"
              onClick={() => setSemesterFilter([])}
              aria-label="Limpiar filtro de semestres"
            >
              <XIcon />
            </Button>
          )}
        </div>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <P className="text-demigrey">No estás inscrito en ningún curso.</P>
        )}

        {!loading && !error && sections.length > 0 && visibleGroups.length === 0 && (
          <P className="text-demigrey">No hay cursos para los semestres seleccionados.</P>
        )}

        <div className="space-y-6">
          {visibleGroups.map((group) => (
            <section key={group.label}>
              <P className="mb-3 text-xs font-semibold uppercase tracking-widest text-demigrey">
                {group.label}
              </P>
              <div className="divide-y divide-grey/20 rounded-lg bg-darkgrey shadow-lg">
                {group.sections.map((s) => (
                  <button
                    key={s.id}
                    onClick={() =>
                      router.push(
                        `/student-assignments?courseId=${s.course.id}&sectionId=${s.id}&semester=${encodeURIComponent(s.semester)}&year=${s.year}`
                      )
                    }
                    className="group flex w-full items-center justify-between px-6 py-4 text-left transition-colors hover:bg-darkergrey/50"
                  >
                    <div className="flex items-center gap-3">
                      <RoleIcon role={role} className="size-6 shrink-0 object-contain" />
                      <div>
                        <P className="font-medium text-white">{s.course.name}</P>
                        <P className="mt-0.5 text-xs text-demigrey">{courseCodeLabel(s.course, s.section_number)}</P>
                      </div>
                    </div>
                    <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
