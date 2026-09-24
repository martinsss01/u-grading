"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import { PdfReviewer } from "@/components/pdf-review";

type Assignment = {
  title: string;
  submission_history: { id: string }[];
};

export default function StudentSubmissionViewPage() {
  const router = useRouter();
  const { assignmentId, submissionId } = useParams<{ assignmentId: string; submissionId: string }>();
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user")!) as { id: string };
    api
      .get<Assignment>(`/api/v1/assignments/${assignmentId}`, { params: { user_id: user.id } })
      .then((res) => setAssignment(res.data))
      .catch(() => setError("No se pudo cargar la evaluación."));
  }, [assignmentId]);

  // Only show submissions that belong to this student.
  const owned = assignment?.submission_history.some((s) => s.id === submissionId) ?? false;

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center gap-4 border-b border-grey/30 px-6 py-3">
        <button onClick={() => router.back()} className="text-sm text-demigrey transition-colors hover:text-white">
          ← Volver
        </button>
        <h1 className="text-lg font-bold text-white">{assignment ? `${assignment.title} · Mi entrega` : "Mi entrega"}</h1>
      </div>
      {error && <P className="p-6 text-sm text-red">{error}</P>}
      {assignment && !owned && <P className="p-6 text-sm text-demigrey">No se encontró la entrega.</P>}
      {owned && (
        <div className="min-h-0 flex-1">
          <PdfReviewer submissionId={submissionId} readOnly />
        </div>
      )}
    </main>
  );
}
