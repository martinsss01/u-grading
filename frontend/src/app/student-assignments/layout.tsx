import { StudentSidebar } from "@/components/student-sidebar";

export default function StudentAssignmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <StudentSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
