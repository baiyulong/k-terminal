# Proxy Support — Design Spec

**Date:** 2026-05-17  
**Branch:** feature/embedded-terminal  
**Status:** Approved for implementation

---

## Problem

KTerminal currently makes direct TCP connections from the app host to remote SSH servers. Users behind corporate firewalls or who route traffic through a privacy proxy (Squid, v2ray, clash, etc.) have no way to tunnel those connections. A global proxy configuration plus per-server override is required.

---

## Goals

- Support HTTP CONNECT proxy and SOCKS5 proxy for SSH connections.
- One global proxy configuration (host, port, type, bypass list).
- Per-server override: each server can use its own proxy, opt out, or inherit the global setting.
- Bypass list: patterns that skip the proxy regardless of global/server setting.
- No proxy authentication (anonymous proxies only, for now).

---

## Out of Scope

- Proxy authentication (username/password).
- Proxying the Tauri webview's HTTP traffic (only SSH connections are proxied).
- SSH ProxyJump / bastion host (a separate feature).

---

## Data Model

### Global proxy (localStorage)

Stored on the frontend alongside theme/font settings:

| Key | Type | Values |
|-----|------|--------|
| `kterminal.proxy.type` | string | `"none"` \| `"http"` \| `"socks5"` |
| `kterminal.proxy.host` | string | e.g. `"10.0.0.1"` |
| `kterminal.proxy.port` | string | e.g. `"3128"` |
| `kterminal.proxy.bypass` | string | newline-separated patterns |

Defaults: `type = "none"`, host/port/bypass empty.

### Per-server proxy (SQLite — new columns on `servers` table)

```sql
ALTER TABLE servers ADD COLUMN proxy_type TEXT NOT NULL DEFAULT 'global';
ALTER TABLE servers ADD COLUMN proxy_host TEXT;
ALTER TABLE servers ADD COLUMN proxy_port INTEGER;
```

`proxy_type` values:
- `"global"` — inherit from global proxy setting (default)
- `"none"` — no proxy for this server, bypass global
- `"http"` — use this server's own HTTP CONNECT proxy
- `"socks5"` — use this server's own SOCKS5 proxy

`proxy_host` and `proxy_port` are only used when `proxy_type` is `"http"` or `"socks5"`.

---

## Bypass List

Evaluated **before** proxy selection. If the SSH target host matches any bypass rule, `ProxyConfig.type` is forced to `"none"` regardless of the selected proxy.

Supported patterns (one per line):

| Pattern | Example | Matches |
|---------|---------|---------|
| Exact IP | `192.168.1.5` | `192.168.1.5` |
| IP wildcard prefix | `10.*` or `192.168.*` | any IP starting with that prefix |
| Exact domain | `localhost` | `localhost` |
| Domain suffix | `*.internal.com` or `.internal.com` | any subdomain of `internal.com` |

Matching is case-insensitive. Empty lines and lines starting with `#` are ignored.

---

## Architecture

### Connection flow (per SSH session)

```
User clicks Connect
    │
    ▼
[Frontend] resolveProxy(server, globalProxy, bypassList) → ProxyConfig
    │  ProxyConfig = { type: "none"|"http"|"socks5", host, port }
    │  Priority: server.proxy_type → (if "global") → globalProxy
    │  Bypass: if host matches bypass list → force type="none"
    ▼
[Frontend → Rust] connect_ssh_session(..., proxy: ProxyConfig)
    │
    ▼
[Rust] establishTcpStream(sshHost, sshPort, proxy)
    │  type="none"   → TcpStream::connect(sshHost:sshPort)
    │  type="http"   → TcpStream::connect(proxy.host:proxy.port)
    │                   → send HTTP CONNECT header
    │                   → assert 200 response
    │  type="socks5" → tokio_socks::Socks5Stream::connect(proxyAddr, sshHost:sshPort)
    ▼
[Rust] client::connect_stream(russh_config, stream, SshClientHandler)
    │  (existing auth, PTY, shell setup unchanged)
    ▼
[Rust] SSH session running
```

### Rust components changed

- **`ssh_session_manager.rs`**
  - Add `ProxyConfig` struct (type, host, port) with `serde::Deserialize`
  - Add `proxy: Option<ProxyConfig>` to `SshConnectConfig`
  - Replace `client::connect()` with manual `TcpStream` + proxy tunnel + `client::connect_stream()`
  - HTTP CONNECT implementation (~30 lines, no extra crate)
  - SOCKS5 via `tokio-socks` crate

- **`terminal_session_commands.rs`**
  - Accept `proxy: Option<ProxyConfig>` parameter in `connect_ssh_session`
  - Pass through to `SshConnectConfig`

- **`Cargo.toml`**
  - Add `tokio-socks = "0.5"`

- **`db/schema.rs` + migration**
  - New columns `proxy_type`, `proxy_host`, `proxy_port` on `servers`

- **`managers/server_manager.rs`** (and `db/models.rs`)
  - Include new proxy fields in `Server` struct + CRUD operations

### Frontend components changed

- **`src/stores/settingsStore.ts`**
  - Add `proxyType`, `proxyHost`, `proxyPort`, `proxyBypass` state + localStorage persistence

- **`src/lib/tauri.ts`**
  - Update `connect()` to accept proxy config parameter
  - Update `Server` type to include proxy fields

- **`src/hooks/useTerminalSession.ts`**
  - `connect()` calls `resolveProxy()` before invoking the Tauri command

- **`src/lib/proxyResolver.ts`** (new file)
  - `resolveProxy(server, globalProxy, bypassList): ProxyConfig`
  - `matchesBypass(host, patterns): boolean`

- **`src/pages/SettingsPage.tsx`**
  - New "Proxy" section: type selector, host+port fields, bypass textarea

- **Server edit form** (existing component for creating/editing servers)
  - New "Proxy" subsection: type selector (global/none/http/socks5), host+port

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| HTTP proxy returns non-200 | `run_session` returns `Err("Proxy returned: <status line>")` → frontend shows error overlay |
| SOCKS5 proxy connection refused | `tokio_socks` returns error → same error overlay |
| Proxy host is unreachable | TCP connect times out → russh timeout propagates → error overlay |
| Bypass list parse error (bad pattern) | Silently skip that pattern, log warning |

---

## UI Detail

### Settings Page — "Proxy" section

Placed between "Terminal Display" and "Terminal Profiles".

- **Proxy type** dropdown: `Disabled` / `HTTP CONNECT` / `SOCKS5`
- **Host** text input + **Port** number input (only enabled when type ≠ Disabled)
- **Bypass list** textarea: one pattern per line, placeholder shows examples

### Server Edit Form — "Proxy" subsection

- **Proxy type** dropdown: `Follow global` / `Disabled` / `HTTP CONNECT` / `SOCKS5`
- **Host** + **Port** inputs (only enabled when type is HTTP or SOCKS5)
- When type is "Follow global": show a read-only hint like _"Currently: HTTP 10.0.0.1:3128"_ using the global setting

---

## Testing Notes

- Unit test `resolveProxy()` and `matchesBypass()` in TypeScript (jest/vitest)
- Rust integration: test HTTP CONNECT tunnel parsing against a mock TCP echo
- Manual: connect to SSH server via Squid (HTTP, port 3128) and via local SOCKS5 proxy

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `tokio-socks` | `0.5` | SOCKS5 async proxy connection |
