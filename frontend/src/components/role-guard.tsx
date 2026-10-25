"use client";

import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type SectionRole, getUserSections, readStoredUser } from "@/lib/user";

type Status = "checking" | "ok" | "forbidden";

/**
 * Gates a route (or route group, via its layout) to users who have one of
 * `allow` in at least one section — roles only exist per section.
 *
 * - No logged-in user -> redirect to the login page.
 * - No section with an allowed role -> render a 404 (not a redirect), so
 *   students poking at /assignments, /submissions, etc. can't tell those
 *   routes exist. Each page still checks the specific section via the API.
 */
export function RoleGuard({ allow, children }: { allow: readonly SectionRole[]; children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const user = readStoredUser();
    if (!user) {
      router.replace("/");
      return;
    }
    getUserSections(user.id)
      .then((sections) => setStatus(sections.some((s) => allow.includes(s.role)) ? "ok" : "forbidden"))
      .catch(() => setStatus("forbidden"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "forbidden") notFound();
  if (status === "checking") return null;

  return <>{children}</>;
}

/** Gates the admin pages (users, courses, sections) to users with the admin permission. Same 404 behavior. */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const user = readStoredUser();
    // Sessions saved before is_admin existed lack it; logging in again refreshes them.
    if (!user || user.is_admin === undefined) {
      router.replace("/");
      return;
    }
    // One-shot auth check on mount, not a value derived from render output —
    // the cascading-render concern the rule guards against doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(user.is_admin ? "ok" : "forbidden");
  }, [router]);

  if (status === "forbidden") notFound();
  if (status === "checking") return null;

  return <>{children}</>;
}
