"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    router.push("/assignments");
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg bg-maroon px-10 py-10 shadow-lg">
        <h1 className="text-center text-3xl font-bold text-white">U-Grading</h1>
        <p className="mt-1 text-center text-white/80">Ingrese su email y contraseña</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-white">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-white">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="mt-1 w-full rounded-md bg-charcoal px-3 py-2 text-white placeholder-white/40 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/40"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-espresso py-2 font-semibold text-white transition hover:bg-espresso/80"
          >
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
