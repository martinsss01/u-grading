import { RoleGuard } from "@/components/role-guard";

export default function SubmissionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allow={["Ayudante"]}>{children}</RoleGuard>;
}
