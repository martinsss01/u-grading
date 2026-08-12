"use client";

const NAV_ITEMS = ["Calendario", "Mis Evaluaciones", "Mis Cursos"];

export function StudentSidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-grey/30 bg-darkergrey px-4 py-6">
      <nav className="space-y-1">
        {NAV_ITEMS.map((label) => (
          <button
            key={label}
            className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-demigrey transition-colors hover:bg-darkgrey hover:text-white"
          >
            {label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
