"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

type Answer = {
  id: string;
  question_id: string;
  grade: number | null;
  graded_at: string | null;
};

type Submission = {
  id: string;
  file_path: string;
  needs_checking: boolean;
  answers: Answer[];
};

type Assignment = {
  id: string;
  title: string;
  type: string;
  submissions: Submission[];
};

type SectionSubmissions = {
  section: {
    id: string;
    semester: string;
    year: number;
    course: { id: string; name: string; code: string };
  };
  assignments: Assignment[];
};

function averageGrade(answers: Answer[]): string {
  if (answers.length === 0) return "—";
  const graded = answers.filter((a) => a.grade !== null);
  if (graded.length === 0) return "Sin calificar";
  const total = graded.reduce((sum, a) => sum + (a.grade ?? 0), 0);
  return (total / graded.length).toFixed(1);
}

export default function AssignmentSubmissionsPage() {
  const router = useRouter();
  const { sectionId, assignmentId } = useParams<{ sectionId: string; assignmentId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("user")) {
      router.push("/");
      return;
    }

    api
      .get<SectionSubmissions>(`/api/v1/submissions/section/${sectionId}`)
      .then((res) => {
        const found = res.data.assignments.find((a) => a.id === assignmentId);
        if (!found) {
          setError("No se encontró la evaluación.");
          return;
        }
        setAssignment(found);
      })
      .catch(() => setError("No se pudieron cargar las entregas."))
      .finally(() => setLoading(false));
  }, [sectionId, assignmentId, router]);

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.push(`/submissions/${sectionId}`)}
          className="mb-6 text-sm text-demigrey transition-colors hover:text-white"
        >
          ← Volver
        </button>

        {loading && <P className="text-demigrey">Cargando...</P>}

        {error && (
          <div className="rounded-md bg-whiteish px-4 py-2">
            <P className="text-sm text-red">{error}</P>
          </div>
        )}

        {assignment && (
          <>
            <div className="mb-6 flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-white">{assignment.title}</h1>
              <span className="text-xs text-demigrey">
                {assignment.submissions.length} entrega{assignment.submissions.length !== 1 ? "s" : ""}
              </span>
            </div>

            <section className="rounded-lg bg-darkgrey shadow-lg">
              {assignment.submissions.length === 0 ? (
                <P className="px-6 py-4 text-sm text-demigrey">Sin entregas.</P>
              ) : (
                <ul className="divide-y divide-grey/20">
                  {assignment.submissions.map((sub, idx) => (
                    <li key={sub.id} className="flex items-center gap-4 px-6 py-4">
                      <div className="flex-1">
                        <P className="text-sm text-white">Entrega {idx + 1}</P>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          sub.needs_checking
                            ? "bg-red/20 text-red-400"
                            : "bg-grey/20 text-lemigrey"
                        }`}
                      >
                        {sub.needs_checking ? "Por revisar" : "Revisado"}
                      </span>
                      <span className="w-20 text-right text-sm text-white">
                        {averageGrade(sub.answers)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
