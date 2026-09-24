"use client";

import dynamic from "next/dynamic";

// pdf.js touches the DOM on import, so the reviewer is client-only.
export const PdfReviewer = dynamic(() => import("./pdf-reviewer"), {
  ssr: false,
  loading: () => <p className="p-6 text-center text-sm text-demigrey">Cargando visor...</p>,
});
