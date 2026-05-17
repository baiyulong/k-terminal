# Design Spec: Local Machine Native Shell + App Icon "K"

Date: 2026-05-17
Author: Brainstorming session

---

## Feature 1: Local Machine as a Native PTY Shell

### Problem

All current sessions connect to remote SSH servers. Users also want to open a local shell inside KTerminal and have the global proxy injected into it automatically.

### Approach

The "Local Machine" entry is a **hardcoded frontend-only entry** — it has the sentinel ID `__local__` and is never stored in the database. It appears pinned at the top of the server list at all times and cannot be edited or deleted.

When the user connects to it, the frontend calls a **new Tauri command** `connect_local_session` rather than `connect_ssh_session`. Rust spawns a native PTY using the `portable-pty` crate, which is cross-platform (ConPTY on Windows, openpty on Unix/macOS). Data flows through the **same Tauri channel/event protocol** as SSH sessions (`TerminalChannelMessage` with `Data` and `Status` variants), so the terminal view requires no changes.

### Components

#### Frontend

1. **`src/lib/constants.ts`** (new) — exports `LOCAL_MACHINE_ID = "__local__"` and a `LOCAL_MACHINE_SERVER` pseudo-`Server` object (name `"Local Machine"`, host `"localhost"`, no auth fields).
2. **`src/lib/tauri.ts`** — add `connectLocal(channel, proxy?, cols?, rows?): Promise<string>` that invokes `connect_local_session`.
3. **`src/hooks/useTerminalSession.ts`** — `connect()` detects `serverId === LOCAL_MACHINE_ID`, skips SSH proxy resolution logic, resolves global proxy only, and calls `connectLocal` instead of `connect`.
4. **`src/components/server/ServerList.tsx`** — renders `LOCAL_MACHINE_SERVER` as the first pinned item before the sorted server list. The item has no edit/clone/delete context menu options. Double-click / Enter triggers launch.
5. **`src/components/server/ServerDetail.tsx`** — when the selected server is `LOCAL_MACHINE_SERVER`, shows a simplified detail panel (name, description only; no auth fields; Connect button still works).

#### Rust Backend

6. **`src-tauri/src/managers/local_pty_manager.rs`** (new) — `LocalPtyManager` (similar API to `SshSessionManager`):
   - Holds a `DashMap<String, LocalPtyHandle>` keyed by session ID.
   - `LocalPtyHandle` contains: the master PTY writer, and a shutdown sender.
   - `connect(session_id, channel, proxy, cols, rows)` → spawns shell, bridges data.
   - `remove(session_id)` → kills the PTY child process.
   - `resize(session_id, cols, rows)` → resizes the PTY.

7. **`src-tauri/src/commands/terminal_session_commands.rs`** — add two new commands:
   - `connect_local_session(local_pty_manager, session_id, channel, cols?, rows?, proxy?)` → delegates to `LocalPtyManager::connect`.
   - `disconnect_local_session(local_pty_manager, session_id)` → delegates to `LocalPtyManager::remove`.
   - Extend `terminal_resize` and `terminal_input` to route to local PTY manager when session not found in SSH manager.

8. **`src-tauri/src/lib.rs`** — register `LocalPtyManager` as Tauri state, register new commands in `invoke_handler`.

#### Dependency

```toml
# Cargo.toml
portable-pty = "0.8"
```

### Shell Detection

| Platform | Primary | Fallback |
|----------|---------|----------|
| Linux/macOS | `$SHELL` env var | `/bin/bash` |
| Windows | PowerShell (`pwsh` or `powershell`) if found on PATH | `cmd.exe` (`%COMSPEC%`) |

### Proxy Injection

When `proxy` is `Some(ProxyConfig)`, the following environment variables are set on the spawned process before launch:

```
HTTP_PROXY=http://<host>:<port>
HTTPS_PROXY=http://<host>:<port>
http_proxy=http://<host>:<port>   (lowercase for Linux compatibility)
https_proxy=http://<host>:<port>
NO_PROXY=<bypass list, comma-separated>
no_proxy=<bypass list, comma-separated>
```

For SOCKS5 proxies, use `socks5://<host>:<port>` as the value format.
`NO_PROXY` is populated from `proxyBypass` (newline-separated → comma-separated).

On the **frontend**, the bypass list is NOT checked before connecting local sessions (local shell is always opened). Only proxy env var injection uses the configured values.

### Session Lifecycle

```
connect_local_session called
  → LocalPtyManager spawns PTY + shell
  → tokio::spawn(bridge_task)
  → emit Status { status: "connected" }

bridge_task:
  loop {
    read chunk from PTY master → emit Data { session_id, data }
  }
  on EOF → emit Status { status: "error", reason: "Shell exited" }

disconnect_local_session called
  → LocalPtyManager::remove → kill PTY child
  → bridge_task receives EOF and exits
```

### UI Representation

- **Server list entry**: Shows a terminal icon (⌘ or a simple box icon), "Local Machine" label, and "local" badge instead of host:port.
- **Tab**: Shows "Local Machine" as the tab title.
- **Status dot**: Green when connected, yellow while spawning, red if shell exited.
- **No SSH-specific fields** shown in the detail panel.

---

## Feature 2: App Icon with "K" Letter

### Problem

The current app icon is a solid color block with no branding. Adding a "K" letter makes it recognizable in the taskbar.

### Approach

1. **Inspect existing icon** — read `src-tauri/icons/icon.png` (512×512) with Python/Pillow to detect the dominant background color.
2. **Generate new source icon** — draw the same background color + a bold white "K" centered using Pillow (no external font files required; use ImageFont or default bitmap font scaled up).
3. **Regenerate all platform icons** — run `cargo tauri icon <source.png>` which auto-generates all required sizes: 32×32, 128×128, 128×128@2x, icon.icns, icon.ico, icon.png.
4. **Commit** the updated icon files.

### "K" Design

- Background: same color as existing icon (sampled from center pixel)
- Letter: white (`#FFFFFF`), bold, centered horizontally and vertically
- Font: system default or embedded simple sans-serif; size ~60% of icon dimension
- Padding: ~15% on all sides

### Files Changed

- `src-tauri/icons/32x32.png`
- `src-tauri/icons/128x128.png`
- `src-tauri/icons/128x128@2x.png`
- `src-tauri/icons/icon.icns`
- `src-tauri/icons/icon.ico`
- `src-tauri/icons/icon.png`

---

## Out of Scope

- SSH jump-host through local session
- Multiple simultaneous local sessions (allowed by the architecture, no artificial limit)
- Custom shell selection UI (always uses system default; can be added later)
- Local session proxy bypass logic (env vars are always injected when proxy is set)
