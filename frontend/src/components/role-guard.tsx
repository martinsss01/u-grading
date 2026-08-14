"use client";

import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "forbidden";

/**
 * Gates a route (or route group, via its layout) to a set of roles.
 *
 * - No logged-in user -> redirect to the login page.
 * - Logged in with a role not in `allow` -> render a 404 (not a redirect),
 *   so students poking at /admin-sections, /assignments, etc. can't tell
 *   those routes exist.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: readonly string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const raw = localStorage.getItem("user");
    if (!raw) {
      router.replace("/");
      return;
    }

    let role: string | undefined;
    try {
      role = (JSON.parse(raw) as { role?: string }).role;
    } catch {
      role = undefined;
    }

    if (!role) {
      router.replace("/");
      return;
    }

    // One-shot auth check on mount, not a value derived from render output —
    // the cascading-render concern the rule guards against doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus(allow.includes(role) ? "ok" : "forbidden");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "forbidden") notFound();
  if (status === "checking") return null;

  return <>{children}</>;
}
