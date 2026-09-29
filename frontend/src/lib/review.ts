import api from "@/lib/api";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type DocumentStatus = {
  status: "pending" | "ready" | "failed";
  page_count: number | null;
  error: string | null;
  updated_at: string;
};

/** A rect as fractions (0–1) of its page's width/height, so it survives zoom. */
export type Rect = { x: number; y: number; width: number; height: number };

export type AnnotationPosition = {
  kind: "text" | "area";
  rects: Rect[];
};

export type Annotation = {
  id: string;
  submission_id: string;
  /** Null for AI suggestions nobody has accepted yet. */
  author_id: string | null;
  author_name: string;
  source: "ta" | "ai";
  status: "published" | "suggested" | "dismissed";
  page: number;
  position: AnnotationPosition;
  highlighted_text: string | null;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type AnnotationDraft = Pick<Annotation, "page" | "position" | "highlighted_text">;

export function documentPdfUrl(submissionId: string, version: string) {
  // `version` busts the browser cache when the PDF is rebuilt.
  return `${API_BASE}/api/v1/submissions/${submissionId}/document.pdf?v=${encodeURIComponent(version)}`;
}

export async function getDocumentStatus(submissionId: string) {
  return (await api.get<DocumentStatus>(`/api/v1/submissions/${submissionId}/document`)).data;
}

export async function rebuildDocument(submissionId: string) {
  return (await api.post<DocumentStatus>(`/api/v1/submissions/${submissionId}/document/rebuild`)).data;
}

/** Teaching staff also get pending AI suggestions; everyone else only published comments. */
export async function listAnnotations(submissionId: string, viewerId: string | null) {
  return (
    await api.get<Annotation[]>(`/api/v1/submissions/${submissionId}/annotations`, {
      params: viewerId ? { viewer_id: viewerId } : {},
    })
  ).data;
}

export async function acceptSuggestion(annotationId: string, authorId: string, comment?: string) {
  return (
    await api.post<Annotation>(`/api/v1/submissions/annotations/${annotationId}/accept`, {
      author_id: authorId,
      comment: comment ?? null,
    })
  ).data;
}

export async function dismissSuggestion(annotationId: string, userId: string) {
  await api.post(`/api/v1/submissions/annotations/${annotationId}/dismiss`, null, { params: { user_id: userId } });
}

export type Redaction = { id: string; page: number; rects: Rect[]; source: "auto" | "manual" };

export async function listRedactions(submissionId: string, userId: string) {
  return (
    await api.get<Redaction[]>(`/api/v1/submissions/${submissionId}/redactions`, { params: { user_id: userId } })
  ).data;
}

export async function createRedaction(submissionId: string, userId: string, page: number, rects: Rect[]) {
  return (
    await api.post<Redaction[]>(`/api/v1/submissions/${submissionId}/redactions`, {
      author_id: userId,
      page,
      rects,
    })
  ).data;
}

export async function deleteRedaction(redactionId: string, userId: string) {
  return (
    await api.delete<Redaction[]>(`/api/v1/submissions/redactions/${redactionId}`, { params: { user_id: userId } })
  ).data;
}

export async function markAnonymizationChecked(submissionId: string, userId: string) {
  await api.post(`/api/v1/submissions/${submissionId}/anonymization-checked`, null, { params: { user_id: userId } });
}

export type PipelineStatus = "not_started" | "queued" | "processing" | "done" | "failed";

export const PIPELINE_LABELS: Record<PipelineStatus, string> = {
  not_started: "Sin procesar",
  queued: "En cola",
  processing: "Procesando",
  done: "Procesada",
  failed: "Error",
};

/** A submission as the teaching staff see it (anonymized, with AI pipeline results). */
export type ReviewSubmission = {
  id: string;
  needs_checking: boolean;
  created_at: string;
  files: { id: string; filename: string }[];
  answers: { id: string; question_id: string; grade: number | null; graded_at: string | null }[];
  document: DocumentStatus | null;
  student_comment: string | null;
  pipeline_status: PipelineStatus;
  pipeline_error: string | null;
  difficulty: number | null;
  difficulty_reason: string | null;
  ai_summary: string | null;
  assigned_ta_id: string | null;
  assigned_ta_name: string | null;
  needs_anonymization_check: boolean;
};

/** "Entrega N" labels, numbered by submission time so every view agrees on them. */
export function numberSubmissions<T extends { created_at: string }>(submissions: T[]) {
  return [...submissions]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((sub, idx) => ({ sub, number: idx + 1 }));
}

export type PipelineOverview = {
  assignment_id: string;
  title: string;
  status: string;
  pipeline_started_at: string | null;
  has_guideline: boolean;
  tas: { id: string; name: string; count: number; total_difficulty: number }[];
  submissions: ReviewSubmission[];
};

export async function getPipelineOverview(assignmentId: string, userId: string) {
  return (
    await api.get<PipelineOverview>(`/api/v1/assignments/${assignmentId}/pipeline`, { params: { user_id: userId } })
  ).data;
}

export async function runPipeline(assignmentId: string, userId: string, force = false) {
  return (
    await api.post<PipelineOverview>(`/api/v1/assignments/${assignmentId}/pipeline/run`, { user_id: userId, force })
  ).data;
}

export async function retryPipeline(submissionId: string, userId: string, force = false) {
  return (
    await api.post<ReviewSubmission>(`/api/v1/submissions/${submissionId}/pipeline/retry`, { user_id: userId, force })
  ).data;
}

export async function setAssignee(submissionId: string, userId: string, taId: string | null) {
  return (
    await api.patch<ReviewSubmission>(`/api/v1/submissions/${submissionId}/assignee`, { user_id: userId, ta_id: taId })
  ).data;
}

/** Extensions the backend can hand out as anonymized text (see pdf_conversion.read_text). */
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".py", ".r", ".java", ".c", ".h", ".cpp",
  ".hpp", ".cc", ".cs", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".rb", ".php", ".sql", ".sh", ".m", ".jl",
  ".hs", ".kt", ".swift", ".scala", ".tex", ".html", ".css", ".ipynb",
]);

export function isTextFile(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 && TEXT_EXTENSIONS.has(filename.slice(dot).toLowerCase());
}

export function anonymizedFileUrl(fileId: string, userId: string) {
  return `${API_BASE}/api/v1/submissions/files/${fileId}/anonymized?user_id=${encodeURIComponent(userId)}`;
}

export function guidelineUrl(assignmentId: string, userId: string) {
  return `${API_BASE}/api/v1/assignments/${assignmentId}/guideline?user_id=${encodeURIComponent(userId)}`;
}

export async function createAnnotation(
  submissionId: string,
  authorId: string,
  draft: AnnotationDraft,
  comment: string,
) {
  return (
    await api.post<Annotation>(`/api/v1/submissions/${submissionId}/annotations`, {
      ...draft,
      author_id: authorId,
      comment,
    })
  ).data;
}

export async function updateAnnotation(annotationId: string, authorId: string, comment: string) {
  return (
    await api.patch<Annotation>(`/api/v1/submissions/annotations/${annotationId}`, {
      author_id: authorId,
      comment,
    })
  ).data;
}

export async function deleteAnnotation(annotationId: string, authorId: string) {
  await api.delete(`/api/v1/submissions/annotations/${annotationId}`, { params: { author_id: authorId } });
}

/** Reading order: by page, then top-to-bottom. The list index is the badge number. */
export function sortAnnotations(annotations: Annotation[]) {
  return [...annotations].sort(
    (a, b) => a.page - b.page || (a.position.rects[0]?.y ?? 0) - (b.position.rects[0]?.y ?? 0),
  );
}
