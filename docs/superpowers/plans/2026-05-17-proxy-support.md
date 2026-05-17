# Proxy Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HTTP CONNECT and SOCKS5 proxy support to SSH connections, with a global proxy setting and per-server override.

**Architecture:** The frontend computes the effective proxy for each connection (per-server config > global config > bypass check) and passes a `ProxyConfig` struct to the Rust `connect_ssh_session` command. Rust then opens a raw TCP stream through the proxy (HTTP CONNECT handshake or SOCKS5 via `tokio-socks`) and hands the resulting stream to `russh::client::connect_stream` instead of `connect`.

**Tech Stack:** Rust (russh 0.60, tokio-socks 0.5), Diesel SQLite migrations, React + Zustand (localStorage for global proxy), TypeScript (proxyResolver.ts pure module)

---

## File Map

**Create:**
- `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/up.sql`
- `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/down.sql`
- `src/lib/proxyResolver.ts`

**Modify:**
- `src-tauri/Cargo.toml` — add `tokio-socks = "0.5.2"`
- `src-tauri/src/db/schema.rs` — add `proxy_type`, `proxy_host`, `proxy_port` columns
- `src-tauri/src/db/models.rs` — add proxy fields to `Server`, `NewServer`, `UpdateServer`
- `src-tauri/src/managers/server_manager.rs` — add proxy fields to `clone_server`
- `src-tauri/src/managers/ssh_session_manager.rs` — add `ProxyConfig`, `build_proxied_stream`, replace `client::connect` with `connect_stream`
- `src-tauri/src/commands/terminal_session_commands.rs` — accept `proxy: Option<ProxyConfig>` param
- `src/lib/types.ts` — add proxy fields to `Server`, `CreateServerRequest`, `UpdateServerRequest`
- `src/stores/settingsStore.ts` — add `proxyType`, `proxyHost`, `proxyPort`, `proxyBypass`
- `src/hooks/useTerminalSession.ts` — call `resolveProxy` before connecting
- `src/lib/tauri.ts` — update `connect` to pass proxy param
- `src/components/server/ServerForm.tsx` — add proxy section + `proxy_type`, `proxy_host`, `proxy_port` to `ServerFormValues`
- `src/pages/SettingsPage.tsx` — add global proxy section

---

### Task 1: DB migration — add proxy columns to servers table

**Files:**
- Create: `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/up.sql`
- Create: `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/down.sql`

- [ ] **Step 1: Create migration directory and up.sql**

```bash
mkdir -p src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields
```

Create `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/up.sql`:
```sql
ALTER TABLE servers ADD COLUMN proxy_type TEXT NOT NULL DEFAULT 'global';
ALTER TABLE servers ADD COLUMN proxy_host TEXT;
ALTER TABLE servers ADD COLUMN proxy_port INTEGER;
```

- [ ] **Step 2: Create down.sql**

SQLite does not support `DROP COLUMN` in older versions. The down migration is a no-op comment:

Create `src-tauri/migrations/2026-05-17-000002_add_server_proxy_fields/down.sql`:
```sql
-- SQLite does not support DROP COLUMN; proxy columns remain but are unused after rollback.
SELECT 1;
```

- [ ] **Step 3: Update schema.rs to include new columns**

In `src-tauri/src/db/schema.rs`, inside the `servers` table block, add these three lines after `port_forwards -> Nullable<Text>`:

```rust
        proxy_type -> Text,
        proxy_host -> Nullable<Text>,
        proxy_port -> Nullable<Integer>,
```

Final `servers` table in schema.rs:
```rust
diesel::table! {
    servers (id) {
        id -> Text,
        name -> Text,
        host -> Text,
        port -> Integer,
        username -> Text,
        auth_type -> Text,
        password -> Nullable<Text>,
        private_key_path -> Nullable<Text>,
        passphrase -> Nullable<Text>,
        group_id -> Nullable<Text>,
        description -> Nullable<Text>,
        terminal_profile_id -> Nullable<Text>,
        startup_command -> Nullable<Text>,
        encoding -> Text,
        is_favorite -> Bool,
        tags -> Nullable<Text>,
        jump_host -> Nullable<Text>,
        keep_alive -> Bool,
        compression -> Bool,
        agent_forward -> Bool,
        port_forwards -> Nullable<Text>,
        proxy_type -> Text,
        proxy_host -> Nullable<Text>,
        proxy_port -> Nullable<Integer>,
        last_connected_at -> Nullable<Timestamp>,
        created_at -> Timestamp,
        updated_at -> Timestamp,
    }
}
```

- [ ] **Step 4: Update models.rs — Server, NewServer, UpdateServer**

In `src-tauri/src/db/models.rs`, add proxy fields to all three structs:

`Server` struct — add after `port_forwards`:
```rust
    pub proxy_type: String,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<i32>,
```

`NewServer` struct — add after `port_forwards`:
```rust
    pub proxy_type: String,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<i32>,
```

`UpdateServer` struct — add after `port_forwards`:
```rust
    pub proxy_type: Option<String>,
    pub proxy_host: Option<String>,
    pub proxy_port: Option<i32>,
```

- [ ] **Step 5: Update server_manager.rs clone_server**

In `src-tauri/src/managers/server_manager.rs`, in the `clone_server` method, add proxy fields to the `NewServer { ... }` literal after `port_forwards`:

```rust
            proxy_type: original.proxy_type,
            proxy_host: original.proxy_host,
            proxy_port: original.proxy_port,
```

- [ ] **Step 6: Verify Rust compiles**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: no errors. The migration runs automatically at app start via `run_pending_migrations`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/migrations/ src-tauri/src/db/ src-tauri/src/managers/server_manager.rs
git commit -m "feat(db): add proxy_type, proxy_host, proxy_port columns to servers"
```

---

### Task 2: Rust proxy tunnel — ProxyConfig + build_proxied_stream

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/managers/ssh_session_manager.rs`

- [ ] **Step 1: Add tokio-socks to Cargo.toml**

In `src-tauri/Cargo.toml`, add after the `uuid` line:
```toml
tokio-socks = "0.5"
```

- [ ] **Step 2: Add ProxyConfig struct and imports to ssh_session_manager.rs**

At the top of `src-tauri/src/managers/ssh_session_manager.rs`, add to the use statements:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio_socks::tcp::socks5::Socks5Stream;
```

Then add the `ProxyConfig` struct right after the `SshAuthMethod` enum:

```rust
/// Proxy configuration resolved by the frontend before connecting.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProxyConfig {
    /// "http" | "socks5"
    pub proxy_type: String,
    pub host: String,
    pub port: u16,
}
```

- [ ] **Step 3: Add proxy field to SshConnectConfig**

In the `SshConnectConfig` struct, add after `channel`:
```rust
    pub proxy: Option<ProxyConfig>,
```

Final `SshConnectConfig`:
```rust
#[derive(Clone)]
pub struct SshConnectConfig {
    pub session_id: String,
    pub server_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: SshAuthMethod,
    pub initial_cols: u16,
    pub initial_rows: u16,
    pub channel: Channel<TerminalChannelMessage>,
    pub proxy: Option<ProxyConfig>,
}
```

- [ ] **Step 4: Add build_proxied_stream function**

Add this function anywhere in `ssh_session_manager.rs` before `run_session`:

```rust
/// Opens a TCP stream to `target_host:target_port`, tunnelling through `proxy` if provided.
/// Returns a plain `TcpStream` in all cases:
/// - No proxy: direct TCP connect.
/// - HTTP CONNECT: TCP connect to proxy, then HTTP CONNECT handshake.
/// - SOCKS5: SOCKS5 handshake via tokio-socks, inner TcpStream extracted.
async fn build_proxied_stream(
    target_host: &str,
    target_port: u16,
    proxy: Option<&ProxyConfig>,
) -> Result<TcpStream, Box<dyn std::error::Error + Send + Sync>> {
    match proxy {
        None => {
            let stream = TcpStream::connect((target_host, target_port)).await?;
            Ok(stream)
        }
        Some(p) if p.proxy_type == "socks5" => {
            eprintln!("[proxy] SOCKS5 via {}:{}", p.host, p.port);
            let socks = Socks5Stream::connect(
                (p.host.as_str(), p.port),
                (target_host, target_port),
            )
            .await
            .map_err(|e| format!("SOCKS5 proxy error: {}", e))?;
            Ok(socks.into_inner())
        }
        Some(p) => {
            // HTTP CONNECT
            eprintln!("[proxy] HTTP CONNECT via {}:{}", p.host, p.port);
            let mut stream = TcpStream::connect((p.host.as_str(), p.port)).await?;
            let req = format!(
                "CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n\r\n",
                host = target_host,
                port = target_port,
            );
            stream.write_all(req.as_bytes()).await?;

            // Read response headers byte-by-byte until \r\n\r\n
            let mut resp = Vec::with_capacity(256);
            let mut buf = [0u8; 1];
            loop {
                stream.read_exact(&mut buf).await?;
                resp.push(buf[0]);
                if resp.ends_with(b"\r\n\r\n") {
                    break;
                }
                if resp.len() > 4096 {
                    return Err("HTTP proxy response too large".into());
                }
            }

            let resp_str = String::from_utf8_lossy(&resp);
            let status_line = resp_str.lines().next().unwrap_or("");
            // e.g. "HTTP/1.1 200 Connection established"
            if !status_line.contains(" 200") {
                return Err(format!("HTTP proxy rejected: {}", status_line.trim()).into());
            }
            eprintln!("[proxy] HTTP CONNECT OK");
            Ok(stream)
        }
    }
}
```

- [ ] **Step 5: Replace client::connect with build_proxied_stream + connect_stream in run_session**

In `run_session`, find the TCP connect section (currently `client::connect(russh_config, addr.as_str(), SshClientHandler).await`).

Replace these lines:
```rust
    let russh_config = Arc::new(Config::default());
    let addr = format!("{}:{}", config.host, config.port);
    eprintln!("[ssh] Connecting to {}", addr);
    let mut ssh_handle: Handle<SshClientHandler> =
        client::connect(russh_config, addr.as_str(), SshClientHandler).await
        .map_err(|e| { eprintln!("[ssh] TCP/handshake failed: {}", e); e })?;
    eprintln!("[ssh] TCP+handshake OK");
```

With:
```rust
    let russh_config = Arc::new(Config::default());
    let addr = format!("{}:{}", config.host, config.port);
    eprintln!("[ssh] Connecting to {}", addr);
    let stream = build_proxied_stream(&config.host, config.port, config.proxy.as_ref())
        .await
        .map_err(|e| { eprintln!("[ssh] TCP connect failed: {}", e); e })?;
    eprintln!("[ssh] TCP+handshake OK");
    let mut ssh_handle: Handle<SshClientHandler> =
        client::connect_stream(russh_config, stream, SshClientHandler).await
        .map_err(|e| { eprintln!("[ssh] SSH handshake failed: {}", e); e })?;
```

- [ ] **Step 6: Verify Rust compiles**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: no errors. If `connect_stream` import is missing, add `use russh::client;` (already present).

- [ ] **Step 7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/managers/ssh_session_manager.rs
git commit -m "feat(ssh): add ProxyConfig + HTTP CONNECT + SOCKS5 proxy tunneling"
```

---

### Task 3: Update connect_ssh_session command to accept proxy param

**Files:**
- Modify: `src-tauri/src/commands/terminal_session_commands.rs`

- [ ] **Step 1: Add proxy import + parameter**

In `terminal_session_commands.rs`, add `ProxyConfig` to the use statement:

```rust
use crate::managers::ssh_session_manager::{
    establish_session, ProxyConfig, SshAuthMethod, SshConnectConfig, SshSessionManager, TerminalChannelMessage,
};
```

Add `proxy: Option<ProxyConfig>` parameter to `connect_ssh_session`:

```rust
#[tauri::command]
pub async fn connect_ssh_session(
    pool: State<'_, DbPool>,
    ssh_manager: State<'_, SshSessionManager>,
    server_id: String,
    channel: Channel<TerminalChannelMessage>,
    cols: Option<u16>,
    rows: Option<u16>,
    proxy: Option<ProxyConfig>,
) -> Result<String, String> {
```

- [ ] **Step 2: Pass proxy into SshConnectConfig**

In the `config` construction, add after `channel`:
```rust
        proxy,
```

Final config block:
```rust
    let config = SshConnectConfig {
        session_id: session_id.clone(),
        server_id: server_id.clone(),
        host: server.host.clone(),
        port: server.port as u16,
        username: server.username.clone(),
        auth,
        initial_cols: cols.unwrap_or(220),
        initial_rows: rows.unwrap_or(50),
        channel,
        proxy,
    };
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd src-tauri && cargo check 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/terminal_session_commands.rs
git commit -m "feat(cmd): pass ProxyConfig through connect_ssh_session command"
```

---

### Task 4: TypeScript types + proxyResolver.ts

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/proxyResolver.ts`

- [ ] **Step 1: Add proxy fields to types.ts**

In `src/lib/types.ts`, update the `Server` interface — add after `port_forwards`:
```typescript
  proxy_type: "global" | "none" | "http" | "socks5";
  proxy_host?: string;
  proxy_port?: number;
```

Update `CreateServerRequest` — add after `port_forwards`:
```typescript
  proxy_type?: string;
  proxy_host?: string;
  proxy_port?: number;
```

Update `UpdateServerRequest` — add after `port_forwards`:
```typescript
  proxy_type?: string;
  proxy_host?: string;
  proxy_port?: number;
```

- [ ] **Step 2: Create src/lib/proxyResolver.ts**

```typescript
/** Proxy type sent to the Rust backend for each SSH connection. */
export interface ProxyConfig {
  proxy_type: "http" | "socks5";
  host: string;
  port: number;
}

export interface GlobalProxySettings {
  proxyType: "none" | "http" | "socks5";
  proxyHost: string;
  proxyPort: number;
  proxyBypass: string; // newline-separated bypass patterns
}

/**
 * Returns true if `host` matches any bypass pattern.
 *
 * Supported patterns:
 *   - Exact IP or domain: "localhost", "192.168.1.5"
 *   - IP wildcard prefix: "10.*", "192.168.*"
 *   - Domain suffix: "*.internal.com" or ".internal.com"
 */
export function matchesBypass(host: string, bypassPatterns: string): boolean {
  const h = host.toLowerCase();
  for (const raw of bypassPatterns.split(/[\n,]/)) {
    const pattern = raw.trim().replace(/^#+.*/, "").trim(); // ignore comments
    if (!pattern) continue;
    const p = pattern.toLowerCase();

    if (p === h) return true; // exact match

    if (p.endsWith(".*")) {
      // IP prefix wildcard: "10.*" matches "10.anything"
      const prefix = p.slice(0, -1); // "10."
      if (h.startsWith(prefix)) return true;
    }

    if (p.startsWith("*.")) {
      // Domain suffix wildcard: "*.internal.com" matches "foo.internal.com"
      const suffix = p.slice(1); // ".internal.com"
      if (h === suffix.slice(1) || h.endsWith(suffix)) return true;
    }

    if (p.startsWith(".")) {
      // Alternate suffix form: ".internal.com"
      if (h === p.slice(1) || h.endsWith(p)) return true;
    }
  }
  return false;
}

/**
 * Resolves the effective ProxyConfig for a connection.
 *
 * Priority: per-server override > global proxy.
 * Bypass list is checked last; if host matches, returns null (no proxy).
 *
 * Returns null when no proxy should be used.
 */
export function resolveProxy(
  serverProxyType: string,
  serverProxyHost: string | undefined,
  serverProxyPort: number | undefined,
  global: GlobalProxySettings,
  targetHost: string,
): ProxyConfig | null {
  // Check bypass list first
  if (matchesBypass(targetHost, global.proxyBypass)) return null;

  let effectiveType: string;
  let effectiveHost: string;
  let effectivePort: number;

  if (serverProxyType === "global") {
    effectiveType = global.proxyType;
    effectiveHost = global.proxyHost;
    effectivePort = global.proxyPort;
  } else if (serverProxyType === "none") {
    return null;
  } else {
    effectiveType = serverProxyType;
    effectiveHost = serverProxyHost ?? "";
    effectivePort = serverProxyPort ?? 0;
  }

  if (effectiveType === "none" || !effectiveHost || !effectivePort) return null;

  return {
    proxy_type: effectiveType as "http" | "socks5",
    host: effectiveHost,
    port: effectivePort,
  };
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/lib/proxyResolver.ts
git commit -m "feat(ts): add proxy types + proxyResolver with matchesBypass + resolveProxy"
```

---

### Task 5: Add global proxy state to settingsStore.ts

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Add proxy storage keys and readers**

After the existing `FONT_FAMILY_KEY` constant, add:

```typescript
const PROXY_TYPE_KEY = "kterminal.proxy.type";
const PROXY_HOST_KEY = "kterminal.proxy.host";
const PROXY_PORT_KEY = "kterminal.proxy.port";
const PROXY_BYPASS_KEY = "kterminal.proxy.bypass";

const readStoredProxyType = (): "none" | "http" | "socks5" => {
  const v = typeof window !== "undefined" ? window.localStorage.getItem(PROXY_TYPE_KEY) : null;
  return (v === "http" || v === "socks5") ? v : "none";
};

const readStoredProxyHost = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(PROXY_HOST_KEY)) || "";

const readStoredProxyPort = (): number => {
  const v = Number(typeof window !== "undefined" ? window.localStorage.getItem(PROXY_PORT_KEY) : "0");
  return v > 0 ? v : 0;
};

const readStoredProxyBypass = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(PROXY_BYPASS_KEY)) ||
  "localhost\n127.0.0.1\n::1";
```

- [ ] **Step 2: Add proxy fields to SettingsState interface**

```typescript
interface SettingsState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalFontFamily: string;
  setTerminalFontFamily: (family: string) => void;
  proxyType: "none" | "http" | "socks5";
  setProxyType: (type: "none" | "http" | "socks5") => void;
  proxyHost: string;
  setProxyHost: (host: string) => void;
  proxyPort: number;
  setProxyPort: (port: number) => void;
  proxyBypass: string;
  setProxyBypass: (bypass: string) => void;
}
```

- [ ] **Step 3: Add proxy state + setters to create()**

In the `create<SettingsState>((set) => ({ ... }))` call, add after the font setters:

```typescript
  proxyType: readStoredProxyType(),
  setProxyType: (type) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_TYPE_KEY, type);
    set({ proxyType: type });
  },

  proxyHost: readStoredProxyHost(),
  setProxyHost: (host) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_HOST_KEY, host);
    set({ proxyHost: host });
  },

  proxyPort: readStoredProxyPort(),
  setProxyPort: (port) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_PORT_KEY, String(port));
    set({ proxyPort: port });
  },

  proxyBypass: readStoredProxyBypass(),
  setProxyBypass: (bypass) => {
    if (typeof window !== "undefined") window.localStorage.setItem(PROXY_BYPASS_KEY, bypass);
    set({ proxyBypass: bypass });
  },
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/stores/settingsStore.ts
git commit -m "feat(store): add global proxy state (type, host, port, bypass) to settingsStore"
```

---

### Task 6: Wire proxy into tauri.ts + useTerminalSession.ts

**Files:**
- Modify: `src/lib/tauri.ts`
- Modify: `src/hooks/useTerminalSession.ts`

- [ ] **Step 1: Update tauri.ts connect() to accept proxy**

Import `ProxyConfig` type at the top of `src/lib/tauri.ts`:
```typescript
import type { ProxyConfig } from "./proxyResolver";
```

Update the `terminalSessionApi.connect` signature:
```typescript
export const terminalSessionApi = {
  connect: (
    serverId: string,
    channel: Channel<TerminalChannelMessage>,
    proxy?: ProxyConfig | null,
    cols?: number,
    rows?: number,
  ): Promise<string> =>
    invoke("connect_ssh_session", { serverId, channel, proxy: proxy ?? null, cols, rows }),

  disconnect: (sessionId: string): Promise<void> =>
    invoke("disconnect_ssh_session", { sessionId }),

  sendInput: (sessionId: string, data: number[]): Promise<void> =>
    invoke("terminal_input", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    invoke("terminal_resize", { sessionId, cols, rows }),
};
```

- [ ] **Step 2: Update useTerminalSession.ts to resolve proxy before connecting**

Add imports at the top of `src/hooks/useTerminalSession.ts`:
```typescript
import { resolveProxy } from "@/lib/proxyResolver";
import { useSettingsStore } from "@/stores/settingsStore";
import { useServerStore } from "@/stores/serverStore";
```

Update the `connect` callback in `useTerminalActions`:
```typescript
  const connect = useCallback(
    async (serverId: string, serverName: string) => {
      // Look up server for per-server proxy override
      const server = useServerStore.getState().servers.find((s) => s.id === serverId);
      const settings = useSettingsStore.getState();

      const proxy = resolveProxy(
        server?.proxy_type ?? "global",
        server?.proxy_host,
        server?.proxy_port,
        {
          proxyType: settings.proxyType,
          proxyHost: settings.proxyHost,
          proxyPort: settings.proxyPort,
          proxyBypass: settings.proxyBypass,
        },
        server?.host ?? "",
      );

      const channel = createChannel((sessionId, status, reason) => {
        updateSessionStatus(sessionId, status, reason);
      });
      const sessionId = await terminalSessionApi.connect(serverId, channel, proxy);
      storeChannel(sessionId, channel);
      addSession({
        id: sessionId,
        serverId,
        serverName,
        status: "connecting",
      });
      return sessionId;
    },
    [addSession, updateSessionStatus],
  );
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tauri.ts src/hooks/useTerminalSession.ts
git commit -m "feat(connect): resolve proxy and pass ProxyConfig to connect_ssh_session"
```

---

### Task 7: Settings page — global proxy UI section

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add proxy state selectors to SettingsPage component**

In `SettingsPage.tsx`, after the existing `terminalFontFamily`/`setTerminalFontFamily` selectors, add:

```typescript
  const proxyType = useSettingsStore((state) => state.proxyType);
  const setProxyType = useSettingsStore((state) => state.setProxyType);
  const proxyHost = useSettingsStore((state) => state.proxyHost);
  const setProxyHost = useSettingsStore((state) => state.setProxyHost);
  const proxyPort = useSettingsStore((state) => state.proxyPort);
  const setProxyPort = useSettingsStore((state) => state.setProxyPort);
  const proxyBypass = useSettingsStore((state) => state.proxyBypass);
  const setProxyBypass = useSettingsStore((state) => state.setProxyBypass);
```

- [ ] **Step 2: Add Proxy section between "Terminal Display" and "Terminal Profiles" sections**

After the closing `</section>` of the Terminal Display section, insert:

```tsx
        <section className={sectionClassName}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Proxy</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                Route SSH connections through an HTTP CONNECT or SOCKS5 proxy.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr] md:items-start">
            <label className="text-sm font-medium" htmlFor="proxy-type">
              Proxy type
            </label>
            <select
              id="proxy-type"
              value={proxyType}
              onChange={(e) => setProxyType(e.target.value as typeof proxyType)}
              className={inputClassName}
            >
              <option value="none">Disabled</option>
              <option value="http">HTTP CONNECT (port 3128, Squid…)</option>
              <option value="socks5">SOCKS5 (port 1080, v2ray, clash…)</option>
            </select>

            <label
              className={[
                "text-sm font-medium",
                proxyType === "none" ? "opacity-40" : "",
              ].join(" ")}
              htmlFor="proxy-host"
            >
              Proxy address
            </label>
            <div className="flex gap-2">
              <input
                id="proxy-host"
                type="text"
                disabled={proxyType === "none"}
                value={proxyHost}
                onChange={(e) => setProxyHost(e.target.value)}
                placeholder="10.0.0.1"
                className={inputClassName + (proxyType === "none" ? " opacity-40" : "")}
              />
              <input
                id="proxy-port"
                type="number"
                disabled={proxyType === "none"}
                value={proxyPort || ""}
                onChange={(e) => setProxyPort(Number(e.target.value))}
                placeholder="3128"
                min={1}
                max={65535}
                className={
                  inputClassName +
                  " w-28 shrink-0" +
                  (proxyType === "none" ? " opacity-40" : "")
                }
              />
            </div>

            <label
              className={[
                "text-sm font-medium",
                proxyType === "none" ? "opacity-40" : "",
              ].join(" ")}
              htmlFor="proxy-bypass"
            >
              Bypass list
            </label>
            <div>
              <textarea
                id="proxy-bypass"
                disabled={proxyType === "none"}
                value={proxyBypass}
                onChange={(e) => setProxyBypass(e.target.value)}
                rows={4}
                placeholder={"localhost\n127.0.0.1\n10.*\n*.internal.com"}
                className={
                  inputClassName +
                  " resize-y font-mono text-xs" +
                  (proxyType === "none" ? " opacity-40" : "")
                }
              />
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                One rule per line. Supports exact IPs, domains, IP prefix wildcards (10.*), and domain suffixes (*.corp.com).
              </p>
            </div>
          </div>
        </section>
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(ui): add global proxy configuration section to Settings page"
```

---

### Task 8: Server form — per-server proxy UI + CRUD pass-through

**Files:**
- Modify: `src/components/server/ServerForm.tsx`

- [ ] **Step 1: Add proxy fields to ServerFormValues interface and getInitialValues**

In `src/components/server/ServerForm.tsx`, update `ServerFormValues`:

```typescript
export interface ServerFormValues {
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: Server["auth_type"];
  password: string;
  private_key_path: string;
  passphrase: string;
  group_id: string;
  description: string;
  terminal_profile_id: string;
  startup_command: string;
  encoding: string;
  is_favorite: boolean;
  tags: string;
  jump_host: string;
  keep_alive: boolean;
  compression: boolean;
  agent_forward: boolean;
  port_forwards: string;
  proxy_type: "global" | "none" | "http" | "socks5";
  proxy_host: string;
  proxy_port: number;
}
```

In `getInitialValues`, add after `port_forwards`:

```typescript
    proxy_type: server?.proxy_type ?? "global",
    proxy_host: server?.proxy_host ?? "",
    proxy_port: server?.proxy_port ?? 0,
```

- [ ] **Step 2: Add import for useSettingsStore in ServerForm.tsx**

At the top of `ServerForm.tsx` add:

```typescript
import { useSettingsStore } from "@/stores/settingsStore";
```

- [ ] **Step 3: Read global proxy hint inside the ServerForm component**

In the `ServerForm` function body, after the `const [formValues, setFormValues] = useState(...)` line, add:

```typescript
  const globalProxyType = useSettingsStore((state) => state.proxyType);
  const globalProxyHost = useSettingsStore((state) => state.proxyHost);
  const globalProxyPort = useSettingsStore((state) => state.proxyPort);
```

- [ ] **Step 4: Add proxy section to the form JSX**

In the form JSX, after the last `</section>` (Advanced Options / Port Forwards section, near the end of the form before the submit button), insert a new proxy section. Find the submit/close buttons block which looks like:

```tsx
            <div className="flex justify-end gap-3">
```

Just before that div, insert:

```tsx
            <section className={sectionClassName}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Proxy
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={labelClassName} htmlFor="server-proxy-type">
                    Proxy type
                  </label>
                  <select
                    id="server-proxy-type"
                    value={formValues.proxy_type}
                    onChange={(e) =>
                      handleChange("proxy_type", e.target.value as ServerFormValues["proxy_type"])
                    }
                    className={inputClassName}
                  >
                    <option value="global">
                      Follow global
                      {globalProxyType !== "none"
                        ? ` (${globalProxyType.toUpperCase()} ${globalProxyHost}:${globalProxyPort})`
                        : " (disabled)"}
                    </option>
                    <option value="none">Disabled</option>
                    <option value="http">HTTP CONNECT</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </div>

                {(formValues.proxy_type === "http" || formValues.proxy_type === "socks5") && (
                  <>
                    <div>
                      <label className={labelClassName} htmlFor="server-proxy-host">
                        Proxy host
                      </label>
                      <input
                        id="server-proxy-host"
                        type="text"
                        value={formValues.proxy_host}
                        onChange={(e) => handleChange("proxy_host", e.target.value)}
                        placeholder="10.0.0.1"
                        className={inputClassName}
                      />
                    </div>
                    <div>
                      <label className={labelClassName} htmlFor="server-proxy-port">
                        Proxy port
                      </label>
                      <input
                        id="server-proxy-port"
                        type="number"
                        value={formValues.proxy_port || ""}
                        onChange={(e) => handleChange("proxy_port", Number(e.target.value))}
                        placeholder="3128"
                        min={1}
                        max={65535}
                        className={inputClassName}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>
```

- [ ] **Step 5: Verify the proxy fields flow through the submit handler**

The `handleSubmit` calls `onSubmit(formValues)` which already spreads all form values. The caller (in MainLayout or wherever ServerForm is used) passes those to `serverApi.create` or `serverApi.update`. Since `CreateServerRequest` and `UpdateServerRequest` now include `proxy_type`, `proxy_host`, `proxy_port`, these fields are sent to the Rust backend automatically.

Confirm the server create/update handlers in `src/components/layout/MainLayout.tsx` or wherever `ServerForm` is used pass all `ServerFormValues` fields to the API. No changes should be needed there since Diesel's `UpdateServer` uses `Option<T>` fields and extra fields are included in the JSON payload.

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 7: Full build check**

```bash
cd src-tauri && cargo check 2>&1 && echo "Rust OK"
```

Expected: `Rust OK`.

- [ ] **Step 8: Commit and push**

```bash
git add src/components/server/ServerForm.tsx
git commit -m "feat(ui): add per-server proxy section to server edit form"
git push origin feature/embedded-terminal
```

---

## Self-Review

**Spec coverage check:**
- ✅ HTTP CONNECT proxy → Task 2 `build_proxied_stream`
- ✅ SOCKS5 proxy → Task 2 `build_proxied_stream` via `tokio-socks`
- ✅ Global proxy config (type/host/port/bypass) → Task 5 settingsStore
- ✅ Per-server override → Tasks 1+8 DB columns + ServerForm
- ✅ Override priority (per-server > global) → Task 6 `resolveProxy`
- ✅ Bypass list (IP wildcard, domain suffix, exact) → Task 4 `matchesBypass`
- ✅ Global proxy UI → Task 7 SettingsPage section
- ✅ Per-server proxy UI → Task 8 ServerForm section
- ✅ No proxy auth (anonymous only) → correct, not implemented

**Placeholder scan:** No TBD/TODO found. All code blocks complete.

**Type consistency check:**
- `ProxyConfig` defined in `proxyResolver.ts` with `proxy_type`, `host`, `port` — matches Rust `ProxyConfig` (`proxy_type`, `host`, `port`) via serde ✅
- `resolveProxy` returns `ProxyConfig | null` — `tauri.ts` accepts `ProxyConfig | null` ✅
- `ServerFormValues.proxy_type` is `"global" | "none" | "http" | "socks5"` — matches `Server.proxy_type` in types.ts ✅
- `build_proxied_stream` returns `TcpStream` — passed to `connect_stream` which accepts `R: AsyncRead + AsyncWrite + Unpin + Send` (TcpStream satisfies all) ✅
- `Socks5Stream::connect((host, port), (target_host, target_port))` — signature matches tokio-socks 0.5.2 API ✅
