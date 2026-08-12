import { Suspense } from "react";
import { StudentSidebar } from "@/components/student-sidebar";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <Suspense fallback={null}>
        <StudentSidebar />
      </Suspense>
      <div className="flex-1">{children}</div>
    </div>
  );
}
