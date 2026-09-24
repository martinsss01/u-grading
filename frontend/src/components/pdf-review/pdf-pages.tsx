"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import type { Annotation, AnnotationDraft, Rect } from "@/lib/review";

// Must be set in the same module that renders <Document> (see react-pdf docs).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type Tool = "text" | "area";

type Props = {
  url: string;
  width: number;
  /** null = read-only: no new selections. */
  tool: Tool | null;
  annotations: Annotation[];
  activeId: string | null;
  draft: AnnotationDraft | null;
  onSelect: (draft: AnnotationDraft) => void;
  onAnnotationClick: (id: string) => void;
};

type Drag = { page: number; x0: number; y0: number; x1: number; y1: number };

const MIN_AREA = 0.01;

function relativePoint(e: React.PointerEvent, el: HTMLElement) {
  const box = el.getBoundingClientRect();
  return {
    x: Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1),
    y: Math.min(Math.max((e.clientY - box.top) / box.height, 0), 1),
  };
}

function dragRect(d: Drag): Rect {
  return {
    x: Math.min(d.x0, d.x1),
    y: Math.min(d.y0, d.y1),
    width: Math.abs(d.x1 - d.x0),
    height: Math.abs(d.y1 - d.y0),
  };
}

/** pdf.js splits a line into many spans; collapse their rects into one per line. */
function mergeLines(rects: Rect[]): Rect[] {
  const lines: Rect[] = [];
  for (const r of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y + l.height / 2 - (r.y + r.height / 2)) < Math.max(l.height, r.height) / 2);
    if (!line) {
      lines.push({ ...r });
      continue;
    }
    const right = Math.max(line.x + line.width, r.x + r.width);
    const bottom = Math.max(line.y + line.height, r.y + r.height);
    line.x = Math.min(line.x, r.x);
    line.y = Math.min(line.y, r.y);
    line.width = right - line.x;
    line.height = bottom - line.y;
  }
  return lines;
}

function toPercentStyle(r: Rect): React.CSSProperties {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` };
}

function Marks({
  kind,
  rects,
  active,
  draft,
}: {
  kind: "text" | "area";
  rects: Rect[];
  active?: boolean;
  draft?: boolean;
}) {
  return rects.map((r, i) => (
    <div
      key={i}
      style={toPercentStyle(r)}
      className={`pointer-events-none absolute ${
        kind === "text"
          ? `mix-blend-multiply ${active || draft ? "bg-red/40" : "bg-red/20"}`
          : `rounded-sm border-2 ${active || draft ? "border-red bg-red/15" : "border-red/70 bg-red/5"}`
      } ${draft ? "animate-pulse" : ""}`}
    />
  ));
}

export default function PdfPages({ url, width, tool, annotations, activeId, draft, onSelect, onAnnotationClick }: Props) {
  const [numPages, setNumPages] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [loadError, setLoadError] = useState(false);

  function handleTextSelection(page: number, pageEl: HTMLElement) {
    if (tool !== "text") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // Selections that spill over into another page aren't supported.
    if (!pageEl.contains(range.commonAncestorContainer)) return;
    const box = pageEl.getBoundingClientRect();
    const rects = Array.from(range.getClientRects())
      .map((r) => ({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        width: r.width / box.width,
        height: r.height / box.height,
      }))
      // Drop empty rects and the full-height one pdf.js' end-of-content helper produces.
      .filter((r) => r.width > 0.002 && r.height > 0.002 && r.height < 0.08);
    const text = sel.toString().trim();
    if (rects.length === 0 || !text) return;
    sel.removeAllRanges();
    onSelect({ page, position: { kind: "text", rects: mergeLines(rects) }, highlighted_text: text });
  }

  if (loadError) {
    return <p className="p-6 text-center text-sm text-demigrey">No se pudo cargar el PDF.</p>;
  }

  return (
    <Document
      file={url}
      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      onLoadError={() => setLoadError(true)}
      loading={<p className="p-6 text-center text-sm text-demigrey">Cargando PDF...</p>}
      className="flex flex-col items-center gap-4 py-4"
    >
      {Array.from({ length: numPages }, (_, i) => {
        const page = i + 1;
        const pageAnnotations = annotations.filter((a) => a.page === page);
        return (
          <div
            key={page}
            data-page={page}
            className="relative bg-white shadow-lg"
            onMouseUp={(e) => handleTextSelection(page, e.currentTarget)}
          >
            <Page pageNumber={page} width={width} renderAnnotationLayer={false} />

            <div className="pointer-events-none absolute inset-0 z-10">
              {pageAnnotations.map((a) => (
                <div key={a.id} id={`ann-${a.id}`}>
                  <Marks kind={a.position.kind} rects={a.position.rects} active={a.id === activeId} />
                </div>
              ))}
              {draft?.page === page && <Marks kind={draft.position.kind} rects={draft.position.rects} draft />}
              {drag?.page === page && <Marks kind="area" rects={[dragRect(drag)]} draft />}
            </div>

            {tool === "area" && (
              <div
                className="absolute inset-0 z-20 cursor-crosshair touch-none"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const p = relativePoint(e, e.currentTarget);
                  setDrag({ page, x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                }}
                onPointerMove={(e) => {
                  if (drag?.page !== page) return;
                  const p = relativePoint(e, e.currentTarget);
                  setDrag({ ...drag, x1: p.x, y1: p.y });
                }}
                onPointerUp={() => {
                  if (drag?.page !== page) return;
                  const rect = dragRect(drag);
                  setDrag(null);
                  if (rect.width > MIN_AREA && rect.height > MIN_AREA) {
                    onSelect({ page, position: { kind: "area", rects: [rect] }, highlighted_text: null });
                  }
                }}
              />
            )}

            {/* Numbered pins sit above everything so they stay clickable in any tool. */}
            {pageAnnotations.map((a) => {
              const first = a.position.rects[0];
              if (!first) return null;
              return (
                <button
                  key={a.id}
                  onClick={() => onAnnotationClick(a.id)}
                  style={{ left: `${first.x * 100}%`, top: `${first.y * 100}%` }}
                  // Text pins sit in the margin left of the line so they don't cover
                  // the words; area pins sit on the box's corner.
                  className={`absolute z-30 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ${
                    a.position.kind === "text" ? "-translate-x-[125%]" : "-translate-x-1/2 -translate-y-1/2"
                  } ${
                    a.id === activeId ? "bg-red ring-2 ring-white" : "bg-red/85 hover:bg-red"
                  }`}
                  aria-label={`Comentario ${annotations.indexOf(a) + 1}`}
                >
                  {annotations.indexOf(a) + 1}
                </button>
              );
            })}
          </div>
        );
      })}
    </Document>
  );
}
