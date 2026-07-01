"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  function signOut() {
    localStorage.removeItem("user");
    router.push("/");
  }

  return (
    <button
      onClick={signOut}
      className="text-sm text-demigrey transition-colors hover:text-white"
    >
      Cerrar sesión
    </button>
  );
}
