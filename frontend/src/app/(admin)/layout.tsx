import { AdminSidebar } from "@/components/admin-sidebar";
import { RoleGuard } from "@/components/role-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["Administrador"]}>
      <div className="flex min-h-[calc(100vh-64px)]">
        <AdminSidebar />
        <div className="flex-1">{children}</div>
      </div>
    </RoleGuard>
  );
}
