"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/assignments");
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
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="w-full rounded-md bg-darkergrey px-3 py-2 text-white placeholder-demigrey outline-none ring-1 ring-grey/30 focus:ring-2 focus:ring-red/50"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password" className="text-white">
              Contraseña
            </FieldLabel>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md bg-darkergrey px-3 py-2 text-white placeholder-demigrey outline-none ring-1 ring-grey/30 focus:ring-2 focus:ring-red/50"
            />
          </Field>

          <Button
            type="submit"
            className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
          >
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
