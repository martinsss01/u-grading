import { AdminSidebar } from "@/components/admin-sidebar";
import { AdminGuard } from "@/components/role-guard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="flex min-h-[calc(100vh-64px)]">
        <AdminSidebar />
        <div className="flex-1">{children}</div>
      </div>
    </AdminGuard>
  );
}
