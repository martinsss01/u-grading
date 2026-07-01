"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/auth/login", { email, password });
      localStorage.setItem("user", JSON.stringify(data));
      const dest =
        data.role === "Estudiante" ? "/student-assignments" :
        data.role === "Ayudante"   ? "/submissions" :
        "/assignments";
      router.push(dest);
    } catch {
      setError("Email o contraseña equivocadas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg bg-darkgrey px-10 py-10 shadow-lg">
        <h1 className="text-center text-3xl font-bold text-white">U-Grading</h1>
        <p className="mt-1 text-center text-demigrey">Ingrese su email y contraseña</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <Field>
            <FieldLabel htmlFor="email" className="text-white">
              Email
            </FieldLabel>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@ugrading.cl"
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password" className="text-white">
              Contraseña
            </FieldLabel>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
            />
          </Field>

          {error && (
            <div className="rounded-md bg-whiteish px-4 py-2">
              <p className="text-sm text-red">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80 disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
