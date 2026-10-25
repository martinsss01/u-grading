"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";
import { getUserSections, readStoredUser } from "@/lib/user";

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

type CourseWithSection = Course & { section_number: number };

export function StudentSidebar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCourseId = searchParams.get("courseId");
  const { sectionId: activeSectionId } = useParams<{ sectionId?: string }>();
  const [courses, setCourses] = useState<CourseWithSection[]>([]);
  const [taSections, setTaSections] = useState<Section[]>([]);
  // Any Estudiante membership, in any semester: the student pages are gated on it.
  const [isStudent, setIsStudent] = useState(false);
  const { semester, year } = getCurrentSemester();

  useEffect(() => {
    const user = readStoredUser();
    if (!user) return;

    // Roles are per section, so the same account can be a student in some
    // sections and a TA in others — list both side by side.
    getUserSections(user.id)
      .then((memberships) => {
        setIsStudent(memberships.some((m) => m.role === "Estudiante"));
        const current = memberships.filter((m) => m.section.semester === semester && m.section.year === year);

        const map = new Map<string, CourseWithSection>();
        for (const { section: s } of current.filter((m) => m.role === "Estudiante")) {
          if (!map.has(s.course.id)) map.set(s.course.id, { ...s.course, section_number: s.section_number });
        }
        setCourses([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));

        // A TA can be assigned to more than one section of the same course, so
        // sort by course name first, then by section number within a course.
        const ta = current.filter((m) => m.role === "Ayudante").map((m) => m.section);
        ta.sort((a, b) => a.course.name.localeCompare(b.course.name) || a.section_number - b.section_number);
        setTaSections(ta);
      })
      .catch(() => {
        setCourses([]);
        setTaSections([]);
      });
  }, [semester, year]);

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      {(isStudent || taSections.length > 0) && (
        <nav className="space-y-1">
          {/* The student pages these link to need an Estudiante membership,
              so a TA-only account (e.g. reached here from /submissions) would 404 on them. */}
          {isStudent && (
            <>
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
            </>
          )}
          {/* Only shown to accounts with at least one TA membership; links to
              the "Mis Clases" overview of every section they TA for. */}
          {taSections.length > 0 && (
            <button
              onClick={() => router.push("/submissions")}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
            >
              <span className="relative size-7 shrink-0">
                <Image src="/images/TACourses.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
              </span>
              Mis Ayudantías
            </button>
          )}
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
              <span className="text-xs text-demigrey">{courseCodeLabel(c, c.section_number)}</span>
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
              <span className="text-xs text-demigrey">{courseCodeLabel(s.course, s.section_number)}</span>
            </div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
