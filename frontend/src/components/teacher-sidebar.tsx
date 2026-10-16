"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";
import type { TeacherSection } from "@/components/assignment-form";

export function TeacherSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const activeSectionId = useSearchParams().get("sectionId");
  const [sections, setSections] = useState<TeacherSection[]>([]);
  const { semester, year } = getCurrentSemester();

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    const user = JSON.parse(raw) as { id: string };

    api
      .get<TeacherSection[]>(`/api/v1/sections/teacher/${user.id}`)
      .then((res) => {
        // A teacher can have more than one section of the same course, so
        // sort by course name first, then by section number within a course.
        const current = res.data.filter((s) => s.semester === semester && s.year === year);
        current.sort((a, b) =>
          a.course.name.localeCompare(b.course.name) || a.section_number - b.section_number
        );
        setSections(current);
      })
      .catch(() => setSections([]));
  }, [semester, year]);

  const overviewActive = pathname === "/assignments" && !activeSectionId;

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      <nav className="space-y-1">
        <button
          onClick={() => router.push("/assignments")}
          className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-darkgrey hover:text-white ${
            overviewActive ? "bg-darkgrey text-white" : "text-demigrey"
          }`}
        >
          <span className="relative size-7 shrink-0">
            <Image src="/images/Evaluations.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
          </span>
          Mis Evaluaciones
        </button>
      </nav>

      <P className="mt-6 border-t border-grey/30 px-3 pt-4 text-sm font-semibold uppercase tracking-widest text-lightgrey">
        {semester} {year}
      </P>

      <nav className="mt-2 space-y-1">
        {sections.length === 0 && (
          <P className="px-3 text-xs text-demigrey">Sin cursos este semestre.</P>
        )}
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => router.push(`/assignments?sectionId=${s.id}`)}
            className={`group flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-darkgrey ${
              activeSectionId === s.id ? "bg-darkgrey" : ""
            }`}
          >
            <RoleIcon role="Profesor" className="size-6 shrink-0 object-contain" />
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
