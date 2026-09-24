"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import api from "@/lib/api";
import { API_BASE } from "@/lib/review";
import { PdfReviewer } from "@/components/pdf-review";

type SectionSubmissions = {
  assignments: {
    id: string;
    title: string;
    submissions: { id: string; files: { id: string; filename: string }[] }[];
  }[];
};

export default function ReviewSubmissionPage() {
  const router = useRouter();
  const { sectionId, assignmentId, submissionId } = useParams<{
    sectionId: string;
    assignmentId: string;
    submissionId: string;
  }>();
  const [title, setTitle] = useState<string | null>(null);
  const [files, setFiles] = useState<{ id: string; filename: string }[]>([]);

  useEffect(() => {
    api
      .get<SectionSubmissions>(`/api/v1/submissions/section/${sectionId}`)
      .then((res) => {
        const assignment = res.data.assignments.find((a) => a.id === assignmentId);
        setTitle(assignment?.title ?? null);
        setFiles(assignment?.submissions.find((s) => s.id === submissionId)?.files ?? []);
      })
      .catch(() => {});
  }, [sectionId, assignmentId, submissionId]);

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-grey/30 px-6 py-3">
        <button onClick={() => router.back()} className="text-sm text-demigrey transition-colors hover:text-white">
          ← Volver
        </button>
        <h1 className="text-lg font-bold text-white">{title ? `${title} · Revisión` : "Revisión"}</h1>
        {/* Original files stay downloadable, e.g. for code the TA wants to run. */}
        <ul className="ml-auto flex flex-wrap gap-x-3 gap-y-1">
          {files.map((f) => (
            <li key={f.id}>
              <a
                href={`${API_BASE}/api/v1/submissions/files/${f.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-48 items-center gap-1 text-xs text-demigrey underline-offset-2 hover:text-white hover:underline"
              >
                <Paperclip className="size-3.5 shrink-0" />
                <span className="truncate">{f.filename}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-h-0 flex-1">
        <PdfReviewer submissionId={submissionId} readOnly={false} />
      </div>
    </main>
  );
}
