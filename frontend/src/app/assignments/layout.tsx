import { Suspense } from "react";
import { RoleGuard } from "@/components/role-guard";
import { TeacherSidebar } from "@/components/teacher-sidebar";

export default function AssignmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["Profesor"]}>
      <div className="flex min-h-[calc(100vh-64px)]">
        <Suspense fallback={null}>
          <TeacherSidebar />
        </Suspense>
        <div className="flex-1">{children}</div>
      </div>
    </RoleGuard>
  );
}
