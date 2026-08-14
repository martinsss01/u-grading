"use client";

import { usePathname, useRouter } from "next/navigation";

export function AdminSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const items = [
    { label: "Administrar secciones", href: "/admin-sections" },
    { label: "Administrar usuarios", href: "/admin-users" },
  ];

  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      <nav className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-darkgrey hover:text-white ${
                active ? "bg-darkgrey text-white" : "text-demigrey"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
