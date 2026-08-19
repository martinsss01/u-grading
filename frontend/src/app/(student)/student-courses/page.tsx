"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { courseCodeLabel } from "@/lib/course";
import { SEMESTER } from "@/lib/semester";

type Course = {
  id: string;
  name: string;
  code: string;
};

type Section = {
  id: string;
  semester: string;
  year: number;
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

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/");
      return;
    }
    const user = JSON.parse(raw) as { id: string };

    api
      .get<Section[]>(`/api/v1/sections/student/${user.id}`)
      .then((res) => setSections(res.data))
      .catch(() => setError("No se pudieron cargar los cursos."))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-8 text-2xl font-bold text-white">Mis Cursos</h1>

        {loading && <p className="text-demigrey">Cargando...</p>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <p className="text-sm text-red">{error}</p>
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <p className="text-demigrey">No estás inscrito en ningún curso.</p>
        )}

        <div className="space-y-6">
          {groupBySemester(sections).map((group) => (
            <section key={group.label}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-demigrey">
                {group.label}
              </p>
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
                    <div>
                      <p className="font-medium text-white">{s.course.name}</p>
                      <p className="mt-0.5 text-xs text-demigrey">{courseCodeLabel(s.course)}</p>
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
