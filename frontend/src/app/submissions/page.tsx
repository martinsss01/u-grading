"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

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
        <h1 className="mb-8 text-2xl font-bold text-white">Mis Clases</h1>

        {loading && <p className="text-demigrey">Cargando...</p>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <p className="text-sm text-red">{error}</p>
          </div>
        )}

        {!loading && !error && sections.length === 0 && (
          <p className="text-demigrey">No estás asignado como ayudante en ninguna sección.</p>
        )}

        <ul className="space-y-3">
          {sections.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => router.push(`/submissions/${s.id}`)}
                className="group w-full rounded-lg bg-darkgrey px-6 py-5 text-left shadow-lg transition-colors hover:bg-darkgrey/70"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-semibold text-white">{s.course.name}</p>
                    <p className="mt-0.5 text-sm text-demigrey">
                      {s.course.code} · {s.semester} {s.year}
                    </p>
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
