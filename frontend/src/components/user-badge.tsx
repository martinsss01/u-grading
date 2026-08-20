"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type StoredUser = {
  name?: string;
};

export function UserBadge() {
  const pathname = usePathname();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) return;
    try {
      setName((JSON.parse(raw) as StoredUser).name ?? null);
    } catch {
      setName(null);
    }
  }, [pathname]);

  if (pathname === "/" || !name) return null;

  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red text-sm font-semibold text-white">
        {initial}
      </span>
      <span className="text-sm text-white">{name}</span>
    </div>
  );
}
