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
  author_id: string;
  author_name: string;
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

export async function listAnnotations(submissionId: string) {
  return (await api.get<Annotation[]>(`/api/v1/submissions/${submissionId}/annotations`)).data;
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
