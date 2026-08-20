"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { courseCodeLabel } from "@/lib/course";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/role-badge";
import { RoleIcon } from "@/components/role-icon";

const ROLES = ["Administrador", "Profesor", "Ayudante", "Estudiante"] as const;

type Course = { id: string; name: string; code: string };

type Member = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type SectionDetail = {
  id: string;
  semester: string;
  year: number;
  section_number: number;
  course: Course;
  members: Member[];
};

type User = { id: string; name: string; email: string; role: string };

export default function AdminSectionDetailPage() {
  const router = useRouter();
  const params = useParams<{ sectionId: string }>();
  const sectionId = params.sectionId;

  const [section, setSection] = useState<SectionDetail | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [role, setRole] = useState<string>("Estudiante");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadData() {
    const [sectionRes, usersRes] = await Promise.all([
      api.get<SectionDetail>(`/api/v1/sections/${sectionId}`),
      api.get<User[]>("/api/v1/users/"),
    ]);
    setSection(sectionRes.data);
    setUsers(usersRes.data);
  }

  useEffect(() => {
    // Role/session gating happens in the (admin) layout's RoleGuard.
    (async () => {
      try {
        await loadData();
      } catch {
        setLoadError("No se pudo cargar la sección.");
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!selectedUser) { setAddError("Selecciona un usuario."); return; }

    setAdding(true);
    try {
      await api.post(`/api/v1/sections/${sectionId}/members`, { user_id: selectedUser.id, role });
      setSelectedUser(null);
      await loadData();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setAddError(detail ?? "No se pudo agregar al miembro.");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMember(memberId: string) {
    setRemovingId(memberId);
    try {
      await api.delete(`/api/v1/sections/${sectionId}/members/${memberId}`);
      await loadData();
    } catch {
      setAddError("No se pudo eliminar al miembro.");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <button onClick={() => router.push("/admin-sections")} className="mb-6 text-sm text-demigrey hover:text-white">
          ← Volver a secciones
        </button>

        {loading && <p className="text-demigrey">Cargando...</p>}
        {loadError && <p className="text-sm text-red/80">{loadError}</p>}

        {section && (
          <>
            <h1 className="text-2xl font-bold text-white">{section.course.name}</h1>
            <p className="mt-1 text-sm text-demigrey">
              {courseCodeLabel(section.course, section.section_number)} · {section.semester} {section.year}
            </p>

            <section className="mt-8 rounded-lg bg-darkergrey p-8 shadow-lg">
              <h2 className="text-xl font-bold text-white">Miembros</h2>
              <ul className="mt-4 space-y-2">
                {section.members.length === 0 && (
                  <p className="text-sm text-demigrey">Esta sección no tiene miembros.</p>
                )}
                {section.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-darkgrey p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <RoleIcon role={m.role} className="size-8 shrink-0 object-contain" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{m.user.name}</p>
                        <p className="truncate text-xs text-demigrey">{m.user.email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <RoleBadge role={m.role} />
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        disabled={removingId === m.id}
                        className="text-xs text-demigrey hover:text-red disabled:opacity-50"
                      >
                        {removingId === m.id ? "..." : "Quitar"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-8 rounded-lg bg-darkgrey p-8 shadow-lg">
              <h2 className="text-xl font-bold text-white">Agregar miembro</h2>
              <form onSubmit={handleAddMember} className="mt-4 space-y-4">
                <Field>
                  <FieldLabel className="text-white">Usuario</FieldLabel>
                  <Combobox
                    items={users}
                    value={selectedUser}
                    onValueChange={(u) => setSelectedUser(u)}
                    itemToStringLabel={(u: User) => `${u.name} (${u.email})`}
                    isItemEqualToValue={(a: User, b: User) => a.id === b.id}
                  >
                    <ComboboxInput
                      placeholder="Buscar por nombre"
                      className="w-full rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-within:border-red/50 focus-within:ring-red/20"
                    />
                    <ComboboxContent>
                      <ComboboxEmpty>No hay usuarios que coincidan con la búsqueda.</ComboboxEmpty>
                      <ComboboxList>
                        {(u: User) => (
                          <ComboboxItem key={u.id} value={u}>
                            {u.name} ({u.email})
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </Field>

                <Field>
                  <FieldLabel className="text-white">Rol en la sección</FieldLabel>
                  <Select value={role} onValueChange={(v) => setRole(v ?? "Estudiante")}>
                    <SelectTrigger className="w-full rounded-md bg-darkergrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                {addError && <p className="text-sm text-red/80">{addError}</p>}

                <Button
                  type="submit"
                  disabled={adding}
                  className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
                >
                  {adding ? "Agregando..." : "Agregar miembro"}
                </Button>
              </form>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
