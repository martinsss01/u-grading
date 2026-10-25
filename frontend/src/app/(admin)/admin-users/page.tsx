"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { P } from "@/components/ui/p";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RoleBadge } from "@/components/role-badge";

// Users have no role of their own: "Administrador" filters by the admin permission,
// the rest list users with that role in at least one section.
const ROLE_FILTERS = [
  ["Administrador", "Administradores"],
  ["Profesor", "Profesores"],
  ["Ayudante", "Ayudantes"],
  ["Estudiante", "Estudiantes"],
] as const;
const ROLE_FILTER_ALL = "Todos";

type User = { id: string; name: string; email: string; is_admin: boolean; created_at: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [showForm, setShowForm] = useState(false);
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
    setIsAdmin(false);
    setEditingId(null);
    setError(null);
  }

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  function closeForm() {
    resetForm();
    setShowForm(false);
  }

  function startEdit(u: User) {
    setName(u.name);
    setEmail(u.email);
    setPassword("");
    setIsAdmin(u.is_admin);
    setEditingId(u.id);
    setConfirmDeleteId(null);
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!editingId && !password) { setError("La contraseña es obligatoria."); return; }

    setSubmitting(true);
    try {
      if (editingId) {
        const payload: Record<string, string | boolean> = { name, email, is_admin: isAdmin };
        if (password) payload.password = password;
        await api.patch(`/api/v1/users/${editingId}`, payload);
      } else {
        await api.post("/api/v1/users/", { name, email, password, is_admin: isAdmin });
      }
      closeForm();
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
      if (editingId === id) closeForm();
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
      <div className="mx-auto max-w-3xl">

        {/* ── Form modal ── */}
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) closeForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Usuario" : "Nuevo Usuario"}</DialogTitle>
          </DialogHeader>

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

            {/* Roles (Profesor/Ayudante/Estudiante) are assigned per section, in "Administrar secciones". */}
            <label className="flex cursor-pointer items-start gap-3 rounded-md bg-darkergrey px-3 py-2.5">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-red"
              />
              <span>
                <span className="block text-sm font-medium text-white">Administrador</span>
                <span className="block text-xs text-demigrey">
                  Puede administrar usuarios, cursos y secciones. Los roles de Profesor, Ayudante y Estudiante se
                  asignan en cada sección.
                </span>
              </span>
            </label>

            {error && <P className="text-sm text-red/80">{error}</P>}

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
        </DialogContent>
        </Dialog>

        {/* ── Users list ── */}
        <section className="rounded-lg bg-darkergrey p-8 shadow-lg">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Usuarios</h2>
            <Button
              onClick={openNewForm}
              className="rounded-md bg-red px-4 py-2 text-sm font-semibold text-white hover:bg-red/80"
            >
              Agregar nuevo usuario
            </Button>
          </div>

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
                {ROLE_FILTERS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadError && <P className="mt-4 text-sm text-red/80">{loadError}</P>}

          <ul className="mt-4 space-y-3">
            {!loading && users.length === 0 && (
              <P className="text-sm text-demigrey">No hay usuarios que coincidan con la búsqueda.</P>
            )}
            {users.map((u) => {
              const isConfirming = confirmDeleteId === u.id;
              return (
                <li key={u.id} className="rounded-md bg-darkgrey p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <P className="truncate font-semibold text-white">{u.name}</P>
                      <P className="mt-0.5 truncate text-xs text-demigrey">{u.email}</P>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {u.is_admin && <RoleBadge role="Administrador" />}
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
