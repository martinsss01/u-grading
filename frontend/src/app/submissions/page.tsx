"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { RoleIcon } from "@/components/role-icon";

type Section = {
  id: string;
  semester: string;
  year: number;
  course: { id: string; name: string; code: string };
};

export default function SubmissionsPage() {
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
      .get<Section[]>(`/api/v1/sections/ta/${user.id}`)
      .then((res) => setSections(res.data))
      .catch(() => setError("No se pudieron cargar las secciones."))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="relative size-7 shrink-0">
            <Image src="/images/TACourses.png" alt="" fill sizes="28px" quality={100} unoptimized className="object-contain" />
          </span>
          <h1 className="text-2xl font-bold text-white">Mis Ayudantías</h1>
        </div>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <P className="text-demigrey">No estás asignado como ayudante en ninguna sección.</P>
        )}

        <ul className="space-y-3">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => router.push(`/submissions/${s.id}`)}
                className="group w-full rounded-lg bg-darkgrey px-6 py-5 text-left shadow-lg transition-colors hover:bg-darkgrey/70"
              >
                <div className="flex items-center gap-3">
                  <RoleIcon role="Ayudante" className="size-8 shrink-0 object-contain" />
                  <div className="flex-1">
                    <P className="text-lg font-semibold text-white">{s.course.name}</P>
                    <P className="mt-0.5 text-sm text-demigrey">
                      {s.course.code} · {s.semester} {s.year}
                    </P>
                  </div>
                  <span className="text-demigrey transition-colors group-hover:text-white">→</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
