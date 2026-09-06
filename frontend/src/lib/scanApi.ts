import axios from "axios";

// A separate axios instance for the phone-scan flow only (see
// src/app/scan/[assignmentId]/page.tsx). The phone can't resolve
// "localhost", so that page needs a tunnel URL to reach the API — but the
// rest of the app (login included) must keep using the local API regardless
// of whether a tunnel is running. Deliberately NOT sharing `api.ts`'s
// baseURL: falls back to the normal API URL when no tunnel is configured, so
// the scan page still works over the same network.
const scanApi = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_SCAN_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

export default scanApi;
