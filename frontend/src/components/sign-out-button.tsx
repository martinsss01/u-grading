"use client";

import { usePathname, useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();

  function signOut() {
    localStorage.removeItem("user");
    router.push("/");
  }

  if (pathname === "/") return null;

  return (
    <button
      onClick={signOut}
      className="text-sm text-demigrey transition-colors hover:text-white"
    >
      Cerrar sesión
    </button>
  );
}
