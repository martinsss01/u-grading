"use client";

import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const pathname = usePathname();

  function signOut() {
    localStorage.removeItem("user");
    router.push("/");
  }

  if (pathname === "/") return null;

  return (
    <Button
      variant="ghost"
      onClick={signOut}
      className="h-auto rounded-md px-2 py-1 text-sm text-demigrey hover:bg-transparent hover:text-white"
    >
      Cerrar sesión
    </Button>
  );
}
