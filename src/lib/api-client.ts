import type { AppType } from "@/api";
import { hc } from "hono/client";

export const client = hc<AppType>(
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3000",
);
