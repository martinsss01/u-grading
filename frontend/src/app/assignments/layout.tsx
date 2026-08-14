import { RoleGuard } from "@/components/role-guard";

export default function AssignmentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allow={["Profesor"]}>{children}</RoleGuard>;
}
