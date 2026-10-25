import api from "@/lib/api";

/** A role inside a section. A user has no role of their own; being an admin is a separate permission. */
export type SectionRole = "Profesor" | "Ayudante" | "Estudiante";

/** The logged-in user, as saved in localStorage["user"] by the login page. */
export type StoredUser = { id: string; name: string; email: string; is_admin?: boolean };

export type UserSection = {
  section: {
    id: string;
    semester: string;
    year: number;
    section_number: number;
    course: { id: string; name: string; code: string };
  };
  role: SectionRole;
};

export function readStoredUser(): StoredUser | null {
  try {
    const user = JSON.parse(localStorage.getItem("user") ?? "null") as StoredUser | null;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

/** Every section the user belongs to, with their role in each. */
export async function getUserSections(userId: string) {
  return (await api.get<UserSection[]>(`/api/v1/users/${userId}/sections`)).data;
}

/** One part of the app the user can enter: admin pages, or the pages for one section role. */
export type Area = {
  key: "admin" | SectionRole;
  label: string;
  href: string;
  sections: UserSection["section"][];
};

const ROLE_AREAS: { role: SectionRole; label: string; href: string }[] = [
  { role: "Profesor", label: "Mis Evaluaciones", href: "/assignments" },
  { role: "Ayudante", label: "Mis Ayudantías", href: "/submissions" },
  { role: "Estudiante", label: "Mis Cursos", href: "/student-assignments" },
];

/** The areas the user can enter, from the admin permission and their section roles. */
export function userAreas(user: StoredUser, sections: UserSection[]): Area[] {
  const areas: Area[] = user.is_admin
    ? [{ key: "admin", label: "Administración", href: "/admin-sections", sections: [] }]
    : [];
  for (const { role, label, href } of ROLE_AREAS) {
    const mine = sections.filter((s) => s.role === role).map((s) => s.section);
    if (mine.length > 0) areas.push({ key: role, label, href, sections: mine });
  }
  return areas;
}

/**
 * Where the user starts: their only area, or /home to pick one. Ayudante and
 * Estudiante count as one area (the student pages' sidebar lists both), so TAs
 * never see /home: they start on their courses, or their ayudantías if they only TA.
 */
export function startPage(areas: Area[]): string {
  const groups = new Set(areas.map((a) => (a.key === "Ayudante" ? "Estudiante" : a.key)));
  if (groups.size !== 1) return "/home";
  return (areas.find((a) => a.key === "Estudiante") ?? areas[0]).href;
}

/** Link to one section within an area's pages. */
export function sectionHref(area: Area["key"], section: UserSection["section"]): string {
  if (area === "Profesor") return `/assignments?sectionId=${section.id}`;
  if (area === "Ayudante") return `/submissions/${section.id}`;
  return `/student-assignments?courseId=${section.course.id}`;
}
