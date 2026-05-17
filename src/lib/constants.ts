import type { Server } from "@/lib/types";

/** Sentinel ID for the hardcoded "Local Machine" entry. Never stored in DB. */
export const LOCAL_MACHINE_ID = "__local__";

/**
 * Pseudo-Server object for the local machine.
 * Always pinned at the top of the server list; cannot be edited or deleted.
 */
export const LOCAL_MACHINE_SERVER: Server = {
  id: LOCAL_MACHINE_ID,
  name: "Local Machine",
  host: "localhost",
  port: 0,
  username: "",
  auth_type: "password",
  encoding: "utf-8",
  is_favorite: false,
  keep_alive: false,
  compression: false,
  agent_forward: false,
  proxy_type: "none",
  created_at: "",
  updated_at: "",
};
