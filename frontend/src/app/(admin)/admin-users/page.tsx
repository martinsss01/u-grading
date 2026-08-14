"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/role-badge";

const ROLES = ["Administrador", "Profesor", "Ayudante", "Estudiante"] as const;
const ROLE_FILTER_ALL = "Todos";

type User = { id: string; name: string; email: string; role: string; created_at: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("Estudiante");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadUsers() {
    const res = await api.get<User[]>("/api/v1/users/", {
      params: {
        role: roleFilter !== ROLE_FILTER_ALL ? roleFilter : undefined,
        search: search.trim() || undefined,
      },
    });
    setUsers(res.data);
  }

  // Role/session gating happens in the (admin) layout's RoleGuard.
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadUsers()
        .catch(() => setLoadError("No se pudieron cargar los usuarios."))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter]);

  function resetForm() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("Estudiante");
    setEditingId(null);
    setError(null);
  }

  function startEdit(u: User) {
    setName(u.name);
    setEmail(u.email);
    setPassword("");
    setRole(u.role);
    setEditingId(u.id);
    setConfirmDeleteId(null);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!editingId && !password) { setError("La contraseña es obligatoria."); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        const payload: Record<string, string> = { name, email, role };
        if (password) payload.password = password;
        await api.patch(`/api/v1/users/${editingId}`, payload);
      } else {
        await api.post("/api/v1/users/", { name, email, password, role });
      }
      resetForm();
      await loadUsers();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? (editingId ? "No se pudo guardar el usuario." : "No se pudo crear el usuario."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await api.delete(`/api/v1/users/${id}`);
      setConfirmDeleteId(null);
      if (editingId === id) resetForm();
      await loadUsers();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail ?? "No se pudo eliminar el usuario.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">

        {/* ── Form panel ── */}
        <section className="rounded-lg bg-darkgrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-white">
              {editingId ? "Editar Usuario" : "Nuevo Usuario"}
            </h1>
            {editingId && (
              <button onClick={resetForm} className="text-sm text-demigrey hover:text-white">
                Cancelar
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field>
              <FieldLabel htmlFor="name" className="text-white">Nombre</FieldLabel>
              <Input
                id="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre completo"
                className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="email" className="text-white">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ugrading.cl"
                className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="password" className="text-white">
                {editingId ? "Nueva contraseña" : "Contraseña"}
              </FieldLabel>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingId ? "Dejar en blanco para no cambiar" : "••••••••"}
                className="rounded-md bg-darkergrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
              />
            </Field>

            <Field>
              <FieldLabel className="text-white">Rol</FieldLabel>
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

            {error && <p className="text-sm text-red/80">{error}</p>}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-red py-2 font-semibold text-white hover:bg-red/80"
            >
              {submitting
                ? editingId ? "Guardando..." : "Creando..."
                : editingId ? "Guardar cambios" : "Crear usuario"}
            </Button>
          </form>
        </section>

        {/* ── Users list ── */}
        <section className="rounded-lg bg-darkergrey p-8 shadow-lg">
          <h2 className="text-xl font-bold text-white">Usuarios</h2>

          <div className="mt-4 flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre"
              className="flex-1 rounded-md bg-darkgrey text-white placeholder:text-demigrey focus-visible:border-red/50 focus-visible:ring-red/20"
            />
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? ROLE_FILTER_ALL)}>
              <SelectTrigger className="w-40 rounded-md bg-darkgrey text-white focus-visible:border-red/50 focus-visible:ring-red/20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE_FILTER_ALL}>Todos</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadError && <p className="mt-4 text-sm text-red/80">{loadError}</p>}

          <ul className="mt-4 space-y-3">
            {!loading && users.length === 0 && (
              <p className="text-sm text-demigrey">No hay usuarios que coincidan con la búsqueda.</p>
            )}
            {users.map((u) => {
              const isConfirming = confirmDeleteId === u.id;
              return (
                <li key={u.id} className="rounded-md bg-darkgrey p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{u.name}</p>
                      <p className="mt-0.5 truncate text-xs text-demigrey">{u.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <RoleBadge role={u.role} />
                      <button
                        onClick={() => startEdit(u)}
                        className="text-xs text-demigrey hover:text-white"
                      >
                        Editar
                      </button>
                      {isConfirming ? (
                        <>
                          <button
                            onClick={() => handleDelete(u.id)}
                            disabled={deleting}
                            className="text-xs font-medium text-red hover:text-red/80 disabled:opacity-50"
                          >
                            {deleting ? "..." : "Confirmar"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs text-demigrey hover:text-white"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(u.id)}
                          className="text-xs text-demigrey hover:text-red"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

      </div>
    </main>
  );
}
