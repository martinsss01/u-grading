"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";
import { courseCodeLabel } from "@/lib/course";
import { getCurrentSemester } from "@/lib/semester";
import { type Area, getUserSections, readStoredUser, sectionHref, startPage, userAreas } from "@/lib/user";

/** Starting page for users with more than one area, e.g. admin and Profesor (never TAs, see startPage). */
export default function HomePage() {
  const router = useRouter();
  const [areas, setAreas] = useState<Area[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { semester, year } = getCurrentSemester();

  useEffect(() => {
    const user = readStoredUser();
    if (!user) {
      router.replace("/");
      return;
    }
    getUserSections(user.id)
      .then((sections) => {
        const mine = userAreas(user, sections);
        // Users with a single area (including TAs, see startPage) never stay here, e.g. after clicking their name.
        const start = startPage(mine);
        if (start !== "/home") router.replace(start);
        else setAreas(mine);
      })
      .catch(() => setError("No se pudieron cargar tus secciones."));
  }, [router]);

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Inicio</h1>
          <P className="mt-1 text-sm text-demigrey">
            Tu rol depende de cada sección. Elige por dónde entrar.
          </P>
        </div>

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}
        {!areas && !error && <P className="text-demigrey">Cargando...</P>}
        {areas?.length === 0 && (
          <P className="rounded-lg bg-darkgrey px-5 py-4 text-sm text-demigrey">
            Todavía no perteneces a ninguna sección. Pídele a un administrador que te agregue.
          </P>
        )}

        {areas?.map((area) => {
          const current = area.sections.filter((s) => s.semester === semester && s.year === year);
          return (
            <section key={area.key} className="rounded-lg bg-darkgrey">
              <Link
                href={area.href}
                className="group flex items-center gap-3 border-b border-grey/30 px-5 py-4 transition-colors hover:bg-darkergrey/50"
              >
                {area.key === "admin" ? (
                  <Shield className="size-6 shrink-0 text-demigrey" />
                ) : (
                  <RoleIcon role={area.key} className="size-7 shrink-0 object-contain" />
                )}
                <div className="flex-1">
                  <P className="font-semibold text-white">{area.label}</P>
                  <P className="text-xs text-demigrey">
                    {area.key === "admin" ? "Usuarios, cursos y secciones" : `Como ${area.key}`}
                  </P>
                </div>
                <span className="text-demigrey transition-colors group-hover:text-white">→</span>
              </Link>
              {area.key !== "admin" && (
                <div className="px-5 py-3">
                  <P className="mb-1 text-xs uppercase tracking-widest text-demigrey">
                    {semester} {year}
                  </P>
                  {current.length === 0 ? (
                    <P className="py-1 text-sm text-demigrey">Sin secciones este semestre.</P>
                  ) : (
                    <ul>
                      {current.map((s) => (
                        <li key={s.id}>
                          <Link
                            href={sectionHref(area.key, s)}
                            className="flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-demigrey transition-colors hover:bg-darkergrey hover:text-white"
                          >
                            <span className="text-white">{s.course.name}</span>
                            <span className="shrink-0 text-xs">{courseCodeLabel(s.course, s.section_number)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}
