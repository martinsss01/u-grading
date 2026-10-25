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

