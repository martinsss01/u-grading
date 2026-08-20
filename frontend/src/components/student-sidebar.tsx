"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";

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

export function StudentSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCourseId = searchParams.get("courseId");
  const { sectionId: activeSectionId } = useParams<{ sectionId?: string }>();
  const [courses, setCourses] = useState<Course[]>([]);
  const [taSections, setTaSections] = useState<Section[]>([]);
  const [globalRole, setGlobalRole] = useState<string | null>(null);
  const { semester, year } = getCurrentSemester();

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    const user = JSON.parse(raw) as { id: string; role?: string };
    // One-shot read of the logged-in user's role on mount, not a value derived
    // from render output — the cascading-render concern the rule guards against
    // doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGlobalRole(user.role ?? null);

    // A user's role is per-section (SectionMember.role), not global, so the
    // same account can be a student in some sections and a TA in others —
    // fetch both and list them side by side.
    api
      .get<Section[]>(`/api/v1/sections/student/${user.id}`)
      .then((res) => {
        const map = new Map<string, Course>();
        for (const s of res.data) {
          if (s.semester !== semester || s.year !== year) continue;
          if (!map.has(s.course.id)) map.set(s.course.id, s.course);
        }
        setCourses([...map.values()]);
      })
      .catch(() => setCourses([]));

    api
      .get<Section[]>(`/api/v1/sections/ta/${user.id}`)
      .then((res) => {
        setTaSections(res.data.filter((s) => s.semester === semester && s.year === year));
      })
      .catch(() => setTaSections([]));
  }, [semester, year]);

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      {/* The student-only pages these link to are gated by global role, so an
          account that is a TA only (global role Ayudante, e.g. reached here
          straight from /submissions) would just 404 on them — hide them. */}
      {globalRole === "Estudiante" && (
        <nav className="space-y-1">
          <button
            onClick={() => router.push("/student-calendar")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            <span className="relative size-7 shrink-0">
              <Image src="/images/Calendar.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
            </span>
            Calendario
          </button>
          <button
            onClick={() => router.push("/student-assignments")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            <span className="relative size-7 shrink-0">
              <Image src="/images/Evaluations.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
            </span>
            Mis Evaluaciones
          </button>
          <button
            onClick={() => router.push("/student-courses")}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            <span className="relative size-7 shrink-0">
              <Image src="/images/Courses.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
            </span>
            Mis Cursos
          </button>
        </nav>
      )}

      <P className="mt-6 border-t border-grey/30 px-3 pt-4 text-sm font-semibold uppercase tracking-widest text-lightgrey">
        {semester} {year}
      </P>

      <nav className="mt-2 space-y-1">
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => router.push(`/student-assignments?courseId=${c.id}`)}
            className={`group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-darkgrey ${
              activeCourseId === c.id ? "bg-darkgrey" : ""
            }`}
          >
            <RoleIcon role="Estudiante" className="size-6 shrink-0 object-contain" />
            <div className="flex flex-col">
              <span
                className={`text-sm ${activeCourseId === c.id ? "text-white" : "text-demigrey"} group-hover:text-white`}
              >
                {c.name}
              </span>
              <span className="text-xs text-demigrey">{courseCodeLabel(c)}</span>
            </div>
          </button>
        ))}
        {taSections.map((s) => (
          <button
            key={s.id}
            onClick={() => router.push(`/submissions/${s.id}`)}
            className={`group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-darkgrey ${
              activeSectionId === s.id ? "bg-darkgrey" : ""
            }`}
          >
            <RoleIcon role="Ayudante" className="size-6 shrink-0 object-contain" />
            <div className="flex flex-col">
              <span
                className={`text-sm ${activeSectionId === s.id ? "text-white" : "text-demigrey"} group-hover:text-white`}
              >
                {s.course.name}
              </span>
              <span className="text-xs text-demigrey">{courseCodeLabel(s.course)}</span>
            </div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
