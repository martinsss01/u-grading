import { Suspense } from "react";
import { RoleGuard } from "@/components/role-guard";
import { StudentSidebar } from "@/components/student-sidebar";

export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["Ayudante"]}>
      <div className="flex min-h-[calc(100vh-64px)]">
        <Suspense fallback={null}>
          <StudentSidebar />
        </Suspense>
        <div className="flex-1">{children}</div>
      </div>
    </RoleGuard>
  );
}
