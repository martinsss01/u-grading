"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getCurrentSemester } from "@/lib/semester";

const NAV_ITEMS = ["Calendario", "Mis Evaluaciones", "Mis Cursos"];

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
          if (!map.has(s.course.id)) map.set(s.course.id, s.course);
        }
        setCourses([...map.values()]);
      })
      .catch(() => setCourses([]));
  }, []);

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      <nav className="space-y-1">
        {NAV_ITEMS.map((label) => (
          <button
            key={label}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            {label}
          </button>
        ))}
      </nav>

      <p className="mt-6 px-3 text-xs font-semibold uppercase tracking-widest text-demigrey">
        {semester} {year}
      </p>

      <nav className="mt-2 space-y-1">
        {courses.map((c) => (
          <button
            key={c.id}
            className="w-full rounded-md px-3 py-2 text-left text-sm text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            {c.name}
          </button>
        ))}
      </nav>
    </aside>
  );
}
