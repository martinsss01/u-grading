"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
import api from "@/lib/api";
import { P } from "@/components/ui/p";
import {
  PIPELINE_LABELS,
  type ReviewSubmission,
  anonymizedFileUrl,
  isTextFile,
} from "@/lib/review";
import { PdfReviewer } from "@/components/pdf-review";

type SectionSubmissions = {
  assignments: { id: string; title: string; submissions: ReviewSubmission[] }[];
};

export default function ReviewSubmissionPage() {
  const router = useRouter();
  const { sectionId, assignmentId, submissionId } = useParams<{
    sectionId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const [title, setTitle] = useState<string | null>(null);
  const [submission, setSubmission] = useState<ReviewSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId] = useState(() =>
    typeof window === "undefined" ? "" : ((JSON.parse(localStorage.getItem("user") ?? "{}") as { id?: string }).id ?? ""),
  );

  useEffect(() => {
    api
      .get<SectionSubmissions>(`/api/v1/submissions/section/${sectionId}`)
      .then((res) => {
        const assignment = res.data.assignments.find((a) => a.id === assignmentId);
        const found = assignment?.submissions.find((s) => s.id === submissionId) ?? null;
        setTitle(assignment?.title ?? null);
        setSubmission(found);
        if (!found) setError("No se encontró la entrega.");
      })
      .catch(() => setError("No se pudo cargar la entrega."));
  }, [sectionId, assignmentId, submissionId]);

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-grey/30 px-6 py-3">
        <button onClick={() => router.back()} className="text-sm text-demigrey transition-colors hover:text-white">
          ← Volver
        </button>
        <h1 className="text-lg font-bold text-white">{title ? `${title} · Revisión` : "Revisión"}</h1>
        {submission && submission.pipeline_status !== "done" && (
          <span className="rounded-full bg-grey/30 px-2.5 py-0.5 text-xs text-lemigrey">
            IA: {PIPELINE_LABELS[submission.pipeline_status]}
          </span>
        )}
        {/* Files are listed under neutral names; code/text can be downloaded with the name masked, e.g. to run it. */}
        <ul className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
          {submission?.files.map((f) => (
            <li key={f.id}>
              {isTextFile(f.filename) ? (
                <a
                  href={anonymizedFileUrl(f.id, userId)}
                  className="inline-flex items-center gap-1 text-xs text-demigrey underline-offset-2 hover:text-white hover:underline"
                  title="Descargar sin datos del estudiante"
                >
                  <Download className="size-3.5 shrink-0" />
                  {f.filename}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-demigrey">
                  <FileText className="size-3.5 shrink-0" />
                  {f.filename}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      {submission?.student_comment && (
        <div className="border-b border-grey/30 bg-darkgrey px-6 py-2">
          <P className="text-xs text-demigrey">
            Comentario del estudiante:{" "}
            <span className="whitespace-pre-wrap italic text-lemigrey">{submission.student_comment}</span>
          </P>
        </div>
      )}
      {error && <P className="p-6 text-sm text-red">{error}</P>}
      {/* Mounted once the submission is loaded so the viewer starts with its AI results. */}
      {submission && (
        <div className="min-h-0 flex-1">
          <PdfReviewer
            submissionId={submissionId}
            readOnly={false}
            review={{
              summary: submission.ai_summary,
              difficulty: submission.difficulty,
              difficultyReason: submission.difficulty_reason,
              needsAnonymizationCheck: submission.needs_anonymization_check,
            }}
          />
        </div>
      )}
    </main>
  );
}
