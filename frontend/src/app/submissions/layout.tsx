import { Suspense } from "react";
import { RoleGuard } from "@/components/role-guard";
import { StudentSidebar } from "@/components/student-sidebar";

export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Global role gates admin-only surfaces (/admin-sections, etc.), but TA
  // status is per-section (SectionMember.role), so a global-Estudiante user
  // can still be a TA in some section and needs into /submissions.
  return (
    <RoleGuard allow={["Ayudante", "Estudiante"]}>
      <div className="flex min-h-[calc(100vh-64px)]">
        <Suspense fallback={null}>
          <StudentSidebar />
        </Suspense>
        <div className="flex-1">{children}</div>
      </div>
    </RoleGuard>
  );
}
