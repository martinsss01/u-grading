"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
// Vendored from the jscanify npm package's browser build (src/jscanify.js) —
// the published package's main entry pulls in `canvas`/`jsdom` for Node.js
// use, which needs native compilation we don't want in this container. This
// is the pure client-side class, MIT licensed, unmodified.
import jscanify from "@/lib/jscanify";
import api from "@/lib/api";
import { P } from "@/components/ui/p";

// jscanify needs OpenCV.js's global `cv` loaded first. This exact build
// (self-hosted in /public) exposes it via the classic onRuntimeInitialized
// callback, but we also handle a Promise-returning build defensively.
declare global {
  interface Window {
    cv?: { onRuntimeInitialized?: () => void; then?: (cb: () => void) => void };
  }
}

type CapturedPage = { id: string; blob: Blob; previewUrl: string };

// A4-ish aspect ratio at ~200dpi — legible enough to read handwriting,
// still a reasonably small JPEG to upload over a phone connection.
const OUTPUT_WIDTH = 1654;
const OUTPUT_HEIGHT = 2339;

export default function ScanPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const searchParams = useSearchParams();
  const userId = searchParams.get("user_id");

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<InstanceType<typeof jscanify> | null>(null);
  const submissionIdRef = useRef<string | null>(null);

  const [cvReady, setCvReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Load OpenCV.js manually via a plain <script> tag instead of next/script:
  // next/script's "afterInteractive" managed loader never actually inserted
  // the tag for this file in testing (it only preloaded it), leaving
  // window.cv undefined forever. A hand-appended script element works.
  useEffect(() => {
    function waitForRuntime(cv: NonNullable<Window["cv"]>) {
      if (typeof cv.then === "function") {
        cv.then(() => setCvReady(true));
      } else {
        cv.onRuntimeInitialized = () => setCvReady(true);
      }
    }

    if (window.cv) {
      waitForRuntime(window.cv);
      return;
    }

    const script = document.createElement("script");
    script.src = "/opencv.js";
    script.async = true;
    script.onload = () => {
      if (window.cv) waitForRuntime(window.cv);
    };
    document.head.appendChild(script);
  }, []);

  // Start the camera once OpenCV is ready.
  useEffect(() => {
    if (!cvReady || !userId) return;
    scannerRef.current = new jscanify();

    let stream: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({
        // Without explicit ideal dimensions, browsers default to a low-res
        // stream (often 640x480) — nowhere near what a phone camera can do,
        // and the bottleneck for legibility no matter how big we render the
        // extracted page afterward. Ask for the camera's max reasonable res.
        video: { facingMode: "environment", width: { ideal: 4096 }, height: { ideal: 4096 } },
      })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play();
        }
      })
      .catch(() => setCameraError("No se pudo acceder a la cámara. Revisa los permisos del navegador."));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cvReady, userId]);

  // Live edge-detection overlay. Throttled (not every animation frame) and
  // run on a downscaled copy of the frame — paper detection is expensive,
  // and doesn't need the full camera resolution just to draw a guide outline.
  // The full-res frame is only used at capture time, in handleCapture.
  useEffect(() => {
    if (!cvReady) return;
    const preview = document.createElement("canvas");
    const interval = setInterval(() => {
      const video = videoRef.current;
      const frame = frameRef.current;
      const overlay = overlayRef.current;
      const scanner = scannerRef.current;
      if (!video || !frame || !overlay || !scanner || video.videoWidth === 0) return;

      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")?.drawImage(video, 0, 0, frame.width, frame.height);

      const scale = Math.min(1, 720 / video.videoWidth);
      preview.width = video.videoWidth * scale;
      preview.height = video.videoHeight * scale;
      preview.getContext("2d")?.drawImage(frame, 0, 0, preview.width, preview.height);

      try {
        const highlighted = scanner.highlightPaper(preview, undefined);
        overlay.width = highlighted.width;
        overlay.height = highlighted.height;
        overlay.getContext("2d")?.drawImage(highlighted, 0, 0);
      } catch {
        // No paper detected in this frame — leave the overlay as-is.
      }
    }, 200);
    return () => clearInterval(interval);
  }, [cvReady]);

  function handleCapture() {
    const frame = frameRef.current;
    const scanner = scannerRef.current;
    if (!frame || !scanner || frame.width === 0) return;

    setCaptureError(null);
    const extracted = scanner.extractPaper(frame, OUTPUT_WIDTH, OUTPUT_HEIGHT, undefined);
    if (!extracted) {
      setCaptureError("No se detectó una hoja. Acerca la cámara y vuelve a intentar.");
      return;
    }

    extracted.toBlob(
      (blob) => {
        if (!blob) return;
        const id = crypto.randomUUID();
        setPages((cur) => [...cur, { id, blob, previewUrl: URL.createObjectURL(blob) }]);
      },
      "image/jpeg",
      0.9
    );
  }

  function removePage(id: string) {
    setPages((cur) => {
      const target = cur.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return cur.filter((p) => p.id !== id);
    });
  }

  async function handleUpload() {
    if (!userId || pages.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (let i = 0; i < pages.length; i++) {
        const formData = new FormData();
        formData.append("assignment_id", assignmentId);
        formData.append("user_id", userId);
        formData.append("file", pages[i].blob, `pagina_${i + 1}.jpg`);
        if (submissionIdRef.current) {
          formData.append("submission_id", submissionIdRef.current);
        }
        const res = await api.post<{ id: string }>("/api/v1/submissions/", formData, {
          headers: { "Content-Type": undefined },
        });
        submissionIdRef.current = res.data.id;
      }
      pages.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPages([]);
      setDone(true);
    } catch {
      setUploadError("No se pudo subir el escaneo. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  }

  if (!userId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-darkergrey px-6">
        <P className="text-sm text-red">Enlace inválido: falta el usuario.</P>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-darkergrey px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-center text-lg font-bold text-white">Escanear entrega</h1>

        {done ? (
          <div className="rounded-lg bg-darkgrey px-5 py-6 text-center">
            <P className="text-sm text-white">Escaneo subido correctamente.</P>
            <P className="mt-1 text-xs text-demigrey">Ya puedes volver a tu computador.</P>
            <button
              onClick={() => setDone(false)}
              className="mt-4 rounded-md bg-red px-3 py-1.5 text-xs font-medium text-white hover:bg-red/80"
            >
              Escanear otra entrega
            </button>
          </div>
        ) : (
          <>
            {!cvReady && !cameraError && (
              <P className="text-center text-sm text-demigrey">Cargando escáner...</P>
            )}

            {cameraError && <P className="text-center text-sm text-red">{cameraError}</P>}

            <video ref={videoRef} playsInline muted className="hidden" />
            <canvas ref={frameRef} className="hidden" />

            {cvReady && !cameraError && (
              <canvas ref={overlayRef} className="w-full rounded-lg bg-black" />
            )}

            {captureError && <P className="text-center text-xs text-red">{captureError}</P>}

            {cvReady && !cameraError && (
              <button
                onClick={handleCapture}
                className="mx-auto block size-16 rounded-full border-4 border-white bg-red active:bg-red/80"
                aria-label="Capturar página"
              />
            )}

            {pages.length > 0 && (
              <div className="rounded-lg bg-darkgrey px-4 py-3">
                <P className="mb-2 text-xs uppercase tracking-widest text-demigrey">
                  Páginas capturadas ({pages.length})
                </P>
                <div className="flex flex-wrap gap-2">
                  {pages.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <div key={p.id} className="relative">
                      <img src={p.previewUrl} alt={`Página ${i + 1}`} className="h-20 w-14 rounded object-cover" />
                      <button
                        onClick={() => removePage(p.id)}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red text-xs text-white"
                        aria-label="Quitar página"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadError && <P className="text-center text-xs text-red">{uploadError}</P>}

            {pages.length > 0 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? "Subiendo..." : `Subir ${pages.length} página${pages.length !== 1 ? "s" : ""}`}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
