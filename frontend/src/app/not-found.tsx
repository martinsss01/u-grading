"use client";

import { useRouter } from "next/navigation";
import { P } from "@/components/ui/p";

export default function NotFound() {
  const router = useRouter();

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-6 text-center">
      <P className="text-sm font-semibold uppercase tracking-widest text-demigrey">Error 404</P>
      <h1 className="mt-2 text-3xl font-bold text-white">Página no encontrada</h1>
      <P className="mt-2 text-demigrey">Esta página no existe o no tienes acceso a ella.</P>
      <button
        onClick={() => router.back()}
        className="mt-8 rounded-md bg-red px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red/80"
      >
        Volver
      </button>
    </main>
  );
}
