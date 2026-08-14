import { Suspense } from "react";
import { StudentSidebar } from "@/components/student-sidebar";
import { RoleGuard } from "@/components/role-guard";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["Estudiante"]}>
      <div className="flex min-h-[calc(100vh-64px)]">
        <Suspense fallback={null}>
          <StudentSidebar />
        </Suspense>
        <div className="flex-1">{children}</div>
      </div>
    </RoleGuard>
  );
}
