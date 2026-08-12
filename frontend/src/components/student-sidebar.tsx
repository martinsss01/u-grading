"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
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
  const [courses, setCourses] = useState<Course[]>([]);
  const { semester, year } = getCurrentSemester();

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    const user = JSON.parse(raw) as { id: string };

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
  }, [semester, year]);

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      <nav className="space-y-1">
        <button
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
        >
          Calendario
        </button>
        <button
          onClick={() => router.push("/student-assignments")}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
        >
          Mis Evaluaciones
        </button>
        <button
          onClick={() => router.push("/student-courses")}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
        >
          Mis Cursos
        </button>
      </nav>

      <p className="mt-6 border-t border-grey/30 px-3 pt-4 text-sm font-semibold uppercase tracking-widest text-lightgrey">
        {semester} {year}
      </p>

      <nav className="mt-2 space-y-1">
        {courses.map((c) => (
          <button
            key={c.id}
            onClick={() => router.push(`/student-assignments?courseId=${c.id}`)}
            className={`group flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors hover:bg-darkgrey ${
              activeCourseId === c.id ? "bg-darkgrey" : ""
            }`}
          >
            <span
              className={`text-sm ${activeCourseId === c.id ? "text-white" : "text-demigrey"} group-hover:text-white`}
            >
              {c.name}
            </span>
            <span className="text-xs text-demigrey">{courseCodeLabel(c)}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
