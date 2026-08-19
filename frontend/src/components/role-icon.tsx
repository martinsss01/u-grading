import Image from "next/image";

const ROLE_IMAGES: Record<string, string> = {
  Administrador: "/images/Coordinador.png",
  Profesor: "/images/Profesor.png",
  Ayudante: "/images/Ayudante.png",
  Estudiante: "/images/Estudiante.png",
};

// The hat-wearing roles' artwork has a brim wider than the head, so object-contain
// (constrained by that extra width) renders the head noticeably smaller than the
// borderless-circle roles. Scale those up so all four read as the same size.
const ROLE_SCALE: Record<string, number> = {
  Administrador: 1.2,
  Profesor: 1.2,
};

export function RoleIcon({ role, className }: { role: string; className?: string }) {
  const src = ROLE_IMAGES[role] ?? ROLE_IMAGES.Estudiante;
  const scale = ROLE_SCALE[role] ?? 1;
  return (
    <Image
      src={src}
      alt={role}
      width={128}
      height={128}
      className={className ?? "size-6 shrink-0 object-contain"}
      style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
    />
  );
}
