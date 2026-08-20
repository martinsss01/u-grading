"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { P } from "@/components/ui/p";

type Section = {
  id: string;
  semester: string;
  year: number;
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  status: string;
  due_date: string | null;
  section: Section;
  grade: number | null;
};

type CourseGroup = {
  course: { id: string; name: string; code: string };
  assignments: Assignment[];
};

type DueAssignment = Assignment & { courseName: string; courseCode: string };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function StudentCalendarPage() {
  const router = useRouter();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [assignments, setAssignments] = useState<DueAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.push("/");
      return;
    }
    const user = JSON.parse(raw) as { id: string };

    api
      .get<CourseGroup[]>(`/api/v1/assignments/student/${user.id}`)
      .then((res) => {
        const flat = res.data.flatMap((g) =>
          g.assignments
            .filter((a) => a.due_date)
            .map((a) => ({ ...a, courseName: g.course.name, courseCode: g.course.code }))
        );
        setAssignments(flat);
      })
      .catch(() => setError("No se pudieron cargar las evaluaciones."))
      .finally(() => setLoading(false));
  }, [router]);

  const dueByDay = useMemo(() => {
    const map = new Map<string, DueAssignment[]>();
    for (const a of assignments) {
      const key = dayKey(new Date(a.due_date!));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignments]);

  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    // Monday-first offset: getDay() is 0=Sun..6=Sat
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    return Array.from({ length: 42 }, (_, i) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      return date;
    });
  }, [year, month]);

  const selectedItems = selectedDay ? dueByDay.get(dayKey(selectedDay)) ?? [] : [];

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="relative size-7 shrink-0">
            <Image src="/images/Calendar.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
          </span>
          <h1 className="text-2xl font-bold text-white">Calendario</h1>
        </div>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="mb-6 rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="mb-4 flex gap-6">
              <div className="flex flex-1 items-center justify-center gap-3">
                <Button
                  variant="ghost"
                  onClick={() => setCursor(new Date(year, month - 1, 1))}
                  className="h-auto rounded-md px-3 py-1.5 text-sm text-demigrey hover:bg-darkgrey hover:text-white"
                  aria-label="Mes anterior"
                >
                  ←
                </Button>
                <P className="w-40 text-center text-lg font-semibold text-white">
                  {MONTH_NAMES[month]} {year}
                </P>
                <Button
                  variant="ghost"
                  onClick={() => setCursor(new Date(year, month + 1, 1))}
                  className="h-auto rounded-md px-3 py-1.5 text-sm text-demigrey hover:bg-darkgrey hover:text-white"
                  aria-label="Mes siguiente"
                >
                  →
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
                  className="h-auto rounded-md px-3 py-1.5 text-sm text-demigrey hover:bg-darkgrey hover:text-white"
                >
                  Hoy
                </Button>
              </div>
              <div className="w-72 shrink-0" aria-hidden />
            </div>

            <div className="flex gap-6">
              <div className="flex-1 rounded-lg bg-darkgrey p-4 shadow-lg">
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((w) => (
                    <div key={w} className="px-1 pb-2 text-center text-xs font-semibold uppercase tracking-widest text-demigrey">
                      {w}
                    </div>
                  ))}

                  {cells.map((date) => {
                    const inMonth = date.getMonth() === month;
                    const count = dueByDay.get(dayKey(date))?.length ?? 0;
                    const isToday = isSameDay(date, today);
                    const isSelected = selectedDay && isSameDay(date, selectedDay);

                    return (
                      <Button
                        key={date.toISOString()}
                        variant="ghost"
                        onClick={() => (count > 0 ? setSelectedDay(date) : setSelectedDay(null))}
                        className={`h-auto aspect-square flex-col items-center justify-start gap-1 rounded-md bg-darkergrey/70 p-1.5 pt-2 text-sm ${
                          inMonth ? "text-white" : "text-demigrey/40"
                        } ${isSelected ? "bg-darkergrey ring-1 ring-red" : "hover:bg-darkergrey"} ${
                          count > 0 ? "cursor-pointer" : "cursor-default"
                        }`}
                      >
                        <span
                          className={`flex size-6 items-center justify-center rounded-full ${
                            isToday ? "bg-red text-white" : ""
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {count > 0 && (
                          <span className="flex size-5 items-center justify-center rounded-full bg-red text-xs font-semibold text-white">
                            {count}
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="w-72 shrink-0 rounded-lg bg-darkgrey p-4 shadow-lg">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-demigrey">
                  {selectedDay
                    ? selectedDay.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
                    : "Selecciona un día"}
                </h2>

                {selectedDay && selectedItems.length === 0 && (
                  <P className="text-sm text-demigrey">Sin evaluaciones ese día.</P>
                )}

                {!selectedDay && (
                  <P className="text-sm text-demigrey">Haz clic en un día con evaluaciones para ver el detalle.</P>
                )}

                <ul className="space-y-2">
                  {selectedItems.map((a) => (
                    <li key={a.id}>
                      <Button
                        variant="ghost"
                        onClick={() => router.push(`/student-assignments/${a.id}`)}
                        className="h-auto w-full flex-col items-start rounded-md bg-darkergrey px-3 py-2 text-left hover:bg-darkergrey/70"
                      >
                        <P className="w-full truncate text-sm font-medium text-white">{a.title}</P>
                        <P className="w-full truncate text-xs text-demigrey">
                          {a.courseCode} - {a.courseName}
                        </P>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
