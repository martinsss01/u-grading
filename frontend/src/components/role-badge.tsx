const ROLE_STYLES: Record<string, string> = {
  Administrador: "border-red/40 bg-red/15 text-red",
  Profesor: "border-lemigrey/40 bg-lemigrey/10 text-white",
  Ayudante: "border-grey/40 bg-darkgrey text-lemigrey",
  Estudiante: "border-grey/30 bg-darkgrey text-demigrey",
};

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ROLE_STYLES[role] ?? "border-grey/30 bg-darkgrey text-demigrey"
      }`}
    >
      {role}
    </span>
  );
}
