# Local Machine PTY Shell + App Icon "K" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native local shell (PTY) as a permanent pinned "Local Machine" entry in the server list (with proxy env-var injection), and add a bold white "K" to the app icon.

**Architecture:** The local machine is a hardcoded frontend sentinel (`__local__` ID) that never touches the DB. Clicking connect calls a new `connect_local_session` Tauri command which uses `portable-pty` to spawn a native shell, bridging I/O through the same `TerminalChannelMessage` channel used for SSH. `terminal_input` and `terminal_resize` are updated to try both SSH and local PTY managers. The icon is regenerated with Python/Pillow from a new 512×512 source PNG.

**Tech Stack:** Rust (portable-pty 0.8, std::thread for the reader bridge), TypeScript/React (zustand, tauri ipc), Python/Pillow (icon generation), `@tauri-apps/cli` (icon resizing)

---

## File Map

### New files
- `src-tauri/src/managers/local_pty_manager.rs` — `LocalPtyManager`, `LocalPtyHandle`, spawn + bridge loop
- `src/lib/constants.ts` — `LOCAL_MACHINE_ID` + `LOCAL_MACHINE_SERVER` pseudo-object

### Modified files
- `src-tauri/Cargo.toml` — add `portable-pty = "0.8"`
- `src-tauri/src/managers/ssh_session_manager.rs` — add `bypass: Option<String>` to `ProxyConfig`
- `src-tauri/src/managers/mod.rs` — expose `local_pty_manager` module
- `src-tauri/src/commands/terminal_session_commands.rs` — add `connect_local_session`, `disconnect_local_session`; update `terminal_input` and `terminal_resize` to route to local manager
- `src-tauri/src/lib.rs` — register `LocalPtyManager` state + new commands
- `src/lib/proxyResolver.ts` — add `bypass?: string` to `ProxyConfig`
- `src/lib/tauri.ts` — add `connectLocal`, `disconnectLocal`
- `src/hooks/useTerminalSession.ts` — detect `__local__` + call correct commands
- `src/components/layout/MainLayout.tsx` — prepend `LOCAL_MACHINE_SERVER` to server list
- `src/components/server/ServerList.tsx` — special rendering for local machine entry
- `src/components/server/ServerDetail.tsx` — simplified detail panel for local machine
- `src-tauri/icons/*.png`, `icon.ico`, `icon.icns` — regenerated with "K"

---

## Task 1: Regenerate App Icon with "K"

**Files:**
- Create: `src-tauri/icons/source_with_k.py` (temporary script, deleted after)
- Modify: `src-tauri/icons/icon.png`, `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`

- [ ] **Step 1: Create the icon generation script**

Create `src-tauri/icons/source_with_k.py`:

```python
#!/usr/bin/env python3
"""Generate a 512x512 source icon with a bold white 'K' centered on the existing background."""
from PIL import Image, ImageDraw, ImageFont
import sys, os

icons_dir = os.path.dirname(os.path.abspath(__file__))

# Sample background color from center of existing icon
with Image.open(os.path.join(icons_dir, "icon.png")) as orig:
    r, g, b, a = orig.getpixel((256, 256))
    bg_color = (r, g, b, 255)

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), bg_color)
draw = ImageDraw.Draw(img)

# Draw bold "K" using a large font size
# Try to load a system bold font, fall back to default
font_paths = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:\\Windows\\Fonts\\arialbd.ttf",
]
font = None
font_size = int(SIZE * 0.65)
for fp in font_paths:
    try:
        font = ImageFont.truetype(fp, font_size)
        break
    except (IOError, OSError):
        pass
if font is None:
    # Last resort: PIL default bitmap font (small but always available)
    font = ImageFont.load_default()

text = "K"
bbox = draw.textbbox((0, 0), text, font=font)
text_w = bbox[2] - bbox[0]
text_h = bbox[3] - bbox[1]
x = (SIZE - text_w) // 2 - bbox[0]
y = (SIZE - text_h) // 2 - bbox[1]
draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

out = os.path.join(icons_dir, "icon_with_k.png")
img.save(out)
print(f"Saved {out} ({SIZE}x{SIZE}, bg={bg_color})")
```

- [ ] **Step 2: Run the script to generate the source icon**

```bash
cd src-tauri/icons && python3 source_with_k.py
```

Expected output: `Saved .../icon_with_k.png (512x512, bg=(15, 52, 96, 255))`

- [ ] **Step 3: Use tauri CLI to regenerate all icon sizes**

```bash
cd /root/projects/k-terminal && npm run tauri -- icon src-tauri/icons/icon_with_k.png
```

Expected: Icons regenerated in `src-tauri/icons/`. The command outputs which files were written.

- [ ] **Step 4: Clean up temporary files**

```bash
rm src-tauri/icons/source_with_k.py src-tauri/icons/icon_with_k.png
```

- [ ] **Step 5: Commit the new icons**

```bash
git add src-tauri/icons/
git commit -m "feat: add K letter to app icon

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 2: Add portable-pty Dependency

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add portable-pty to Cargo.toml**

In `src-tauri/Cargo.toml`, add after the `tokio-socks` line:

```toml
portable-pty = "0.8"
```

- [ ] **Step 2: Verify the dependency resolves**

```bash
cd src-tauri && cargo fetch
```

Expected: fetches `portable-pty` and its dependencies without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add portable-pty dependency for local PTY shell

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 3: Add `bypass` Field to ProxyConfig

The `bypass` field lets the local PTY manager inject `NO_PROXY` env vars. It is optional and ignored by existing SSH code.

**Files:**
- Modify: `src-tauri/src/managers/ssh_session_manager.rs` (ProxyConfig struct)
- Modify: `src/lib/proxyResolver.ts` (ProxyConfig interface)

- [ ] **Step 1: Add bypass to Rust ProxyConfig**

In `src-tauri/src/managers/ssh_session_manager.rs`, find and update the `ProxyConfig` struct:

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct ProxyConfig {
    pub proxy_type: String, // "http" | "socks5"
    pub host: String,
    pub port: u16,
    pub bypass: Option<String>, // newline-separated bypass list; used by local PTY for NO_PROXY injection
}
```

- [ ] **Step 2: Add bypass to TypeScript ProxyConfig**

In `src/lib/proxyResolver.ts`, update the `ProxyConfig` interface:

```typescript
/** Proxy type sent to the Rust backend for each SSH connection. */
export interface ProxyConfig {
  proxy_type: "http" | "socks5";
  host: string;
  port: number;
  bypass?: string; // newline-separated bypass list; used for NO_PROXY injection in local sessions
}
```

- [ ] **Step 3: Verify no compilation errors**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

Expected: no errors (bypass is optional, no existing code sets it, serde treats missing fields as None).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/managers/ssh_session_manager.rs src/lib/proxyResolver.ts
git commit -m "feat: add bypass field to ProxyConfig for NO_PROXY injection

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 4: Create LocalPtyManager

**Files:**
- Create: `src-tauri/src/managers/local_pty_manager.rs`

- [ ] **Step 1: Create local_pty_manager.rs**

Create `src-tauri/src/managers/local_pty_manager.rs` with this full content:

```rust
//! Local PTY session manager.
//!
//! Spawns a native shell via `portable-pty` and bridges I/O through the same
//! `TerminalChannelMessage` channel used by SSH sessions.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use tauri::ipc::Channel;

use crate::managers::ssh_session_manager::{
    ProxyConfig, TerminalChannelMessage, TerminalDataEvent, TerminalStatusEvent,
};

// Safety: Box<dyn Child> wraps OS process handles (PID / HANDLEs) which are safe
// to transfer between threads. We only ever access it through a Mutex.
struct SendableChild(Box<dyn portable_pty::Child>);
unsafe impl Send for SendableChild {}

pub struct LocalPtyHandle {
    pub id: String,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Mutex<SendableChild>,
}

impl LocalPtyHandle {
    fn kill(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.0.kill();
        }
    }
}

#[derive(Clone)]
pub struct LocalPtyManager {
    sessions: Arc<Mutex<HashMap<String, LocalPtyHandle>>>,
}

impl LocalPtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Spawn a local shell PTY and start bridging data to `channel`.
    /// Returns immediately after spawning (the bridge runs in a background thread).
    pub fn connect(
        &self,
        session_id: String,
        channel: Channel<TerminalChannelMessage>,
        cols: u16,
        rows: u16,
        proxy: Option<ProxyConfig>,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();
        let size = PtySize { rows, cols, pixel_width: 0, pixel_height: 0 };
        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

        // Detect the user's preferred shell
        #[cfg(windows)]
        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        #[cfg(not(windows))]
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        cmd.env("TERM", "xterm-256color");

        // Inject proxy environment variables when a proxy is configured
        if let Some(ref p) = proxy {
            let scheme = if p.proxy_type == "socks5" { "socks5" } else { "http" };
            let proxy_url = format!("{}://{}:{}", scheme, p.host, p.port);
            cmd.env("HTTP_PROXY", &proxy_url);
            cmd.env("HTTPS_PROXY", &proxy_url);
            cmd.env("http_proxy", &proxy_url);  // lowercase for Linux
            cmd.env("https_proxy", &proxy_url);

            if let Some(bypass) = p.bypass.as_deref().filter(|s| !s.is_empty()) {
                let no_proxy = bypass
                    .lines()
                    .map(|l| l.trim().replace(|c: char| c == '#', ""))
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect::<Vec<_>>()
                    .join(",");
                if !no_proxy.is_empty() {
                    cmd.env("NO_PROXY", &no_proxy);
                    cmd.env("no_proxy", &no_proxy);
                }
            }
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave); // slave no longer needed after spawn

        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

        let handle = LocalPtyHandle {
            id: session_id.clone(),
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: Mutex::new(SendableChild(child)),
        };

        self.sessions.lock().unwrap().insert(session_id.clone(), handle);

        // Emit "connected" immediately
        let _ = channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
            session_id: session_id.clone(),
            status: "connected".to_string(),
            reason: None,
        }));

        // Bridge thread: read PTY output → forward to frontend
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let _ = channel.send(TerminalChannelMessage::Data(TerminalDataEvent {
                            session_id: session_id.clone(),
                            data: buf[..n].to_vec(),
                        }));
                    }
                }
            }
            // Shell exited or PTY closed
            let _ = channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
                session_id,
                status: "error".to_string(),
                reason: Some("Shell exited".to_string()),
            }));
        });

        Ok(())
    }

    /// Kill the child process and remove the session.
    pub fn remove(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(handle) = sessions.remove(session_id) {
            handle.kill();
            true
        } else {
            false
        }
    }

    /// Send raw bytes to the shell's stdin.
    pub fn send_input(&self, session_id: &str, data: Vec<u8>) -> bool {
        let sessions = self.sessions.lock().unwrap();
        if let Some(handle) = sessions.get(session_id) {
            if let Ok(mut writer) = handle.writer.lock() {
                return writer.write_all(&data).is_ok();
            }
        }
        false
    }

    /// Resize the PTY to the new dimensions.
    pub fn send_resize(&self, session_id: &str, cols: u16, rows: u16) -> bool {
        let sessions = self.sessions.lock().unwrap();
        if let Some(handle) = sessions.get(session_id) {
            if let Ok(master) = handle.master.lock() {
                return master
                    .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
                    .is_ok();
            }
        }
        false
    }
}

impl Default for LocalPtyManager {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 2: Expose module in managers/mod.rs**

In `src-tauri/src/managers/mod.rs`, add:

```rust
pub mod local_pty_manager;
```

(Add it after `pub mod group_manager;` or at the end of the file.)

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors. There may be a warning about `unsafe impl Send` — that's acceptable.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/managers/local_pty_manager.rs src-tauri/src/managers/mod.rs
git commit -m "feat: add LocalPtyManager for native PTY shell sessions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 5: Add Tauri Commands for Local Session

**Files:**
- Modify: `src-tauri/src/commands/terminal_session_commands.rs`

- [ ] **Step 1: Add imports at the top**

In `src-tauri/src/commands/terminal_session_commands.rs`, add to the existing `use` block:

```rust
use crate::managers::local_pty_manager::LocalPtyManager;
```

The full import section at the top should look like:

```rust
use tauri::State;
use tauri::ipc::Channel;
use uuid::Uuid;

use crate::db::DbPool;
use crate::managers::local_pty_manager::LocalPtyManager;
use crate::managers::server_manager::ServerManager;
use crate::managers::ssh_session_manager::{
    establish_session, ProxyConfig, SshAuthMethod, SshConnectConfig, SshSessionManager, TerminalChannelMessage,
};
use crate::security::keyring::CredentialStore;
```

- [ ] **Step 2: Add connect_local_session command**

Append the following command to the end of `terminal_session_commands.rs`:

```rust
#[tauri::command]
pub async fn connect_local_session(
    local_pty_manager: State<'_, LocalPtyManager>,
    channel: Channel<TerminalChannelMessage>,
    cols: Option<u16>,
    rows: Option<u16>,
    proxy: Option<ProxyConfig>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    local_pty_manager
        .connect(session_id.clone(), channel, cols.unwrap_or(220), rows.unwrap_or(50), proxy)
        .map(|_| session_id)
}
```

- [ ] **Step 3: Add disconnect_local_session command**

Append after `connect_local_session`:

```rust
#[tauri::command]
pub async fn disconnect_local_session(
    local_pty_manager: State<'_, LocalPtyManager>,
    session_id: String,
) -> Result<(), String> {
    local_pty_manager.remove(&session_id);
    Ok(()) // silently succeed even if session was already gone
}
```

- [ ] **Step 4: Update terminal_input to handle local sessions**

Replace the existing `terminal_input` command with this version that tries both managers:

```rust
#[tauri::command]
pub async fn terminal_input(
    ssh_manager: State<'_, SshSessionManager>,
    local_pty_manager: State<'_, LocalPtyManager>,
    session_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    if ssh_manager.send_input(&session_id, data.clone()).await {
        return Ok(());
    }
    if local_pty_manager.send_input(&session_id, data) {
        return Ok(());
    }
    Err(format!("Session '{}' not found in any manager", session_id))
}
```

- [ ] **Step 5: Update terminal_resize to handle local sessions**

Replace the existing `terminal_resize` command:

```rust
#[tauri::command]
pub async fn terminal_resize(
    ssh_manager: State<'_, SshSessionManager>,
    local_pty_manager: State<'_, LocalPtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    if ssh_manager.send_resize(&session_id, cols, rows).await {
        return Ok(());
    }
    if local_pty_manager.send_resize(&session_id, cols, rows) {
        return Ok(());
    }
    Err(format!("Session '{}' not found in any manager", session_id))
}
```

- [ ] **Step 6: Verify compilation**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/terminal_session_commands.rs
git commit -m "feat: add connect/disconnect_local_session commands; route input/resize to local PTY

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 6: Register LocalPtyManager in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Update lib.rs**

Replace the full contents of `src-tauri/src/lib.rs` with:

```rust
pub mod commands;
pub mod db;
pub mod managers;
pub mod security;

use db::establish_connection_pool;
use managers::local_pty_manager::LocalPtyManager;
use managers::ssh_session_manager::SshSessionManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pool = establish_connection_pool();
    let ssh_manager = SshSessionManager::new();
    let local_pty_manager = LocalPtyManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(pool)
        .manage(ssh_manager)
        .manage(local_pty_manager)
        .invoke_handler(tauri::generate_handler![
            commands::search_commands::search_servers,
            commands::server_commands::list_servers,
            commands::server_commands::get_server,
            commands::server_commands::create_server,
            commands::server_commands::update_server,
            commands::server_commands::delete_server,
            commands::server_commands::clone_server,
            commands::server_commands::toggle_favorite,
            commands::ssh_commands::generate_ssh_command,
            commands::ssh_commands::get_ssh_command_preview,
            commands::group_commands::list_groups,
            commands::group_commands::get_group,
            commands::group_commands::create_group,
            commands::group_commands::update_group,
            commands::group_commands::delete_group,
            commands::group_commands::move_group,
            commands::group_commands::reorder_groups,
            commands::group_commands::get_group_tree,
            commands::terminal_commands::list_terminal_profiles,
            commands::terminal_commands::get_terminal_profile,
            commands::terminal_commands::create_terminal_profile,
            commands::terminal_commands::update_terminal_profile,
            commands::terminal_commands::delete_terminal_profile,
            commands::terminal_commands::get_default_terminal_profile,
            commands::terminal_commands::set_default_terminal_profile,
            commands::terminal_commands::detect_available_terminals,
            commands::terminal_commands::seed_default_terminal_profiles,
            commands::terminal_commands::get_recent_connections,
            commands::settings_commands::export_data,
            commands::settings_commands::import_data,
            commands::settings_commands::get_app_info,
            commands::settings_commands::list_system_fonts,
            // Terminal session commands
            commands::terminal_session_commands::connect_ssh_session,
            commands::terminal_session_commands::disconnect_ssh_session,
            commands::terminal_session_commands::connect_local_session,
            commands::terminal_session_commands::disconnect_local_session,
            commands::terminal_session_commands::terminal_input,
            commands::terminal_session_commands::terminal_resize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Full cargo check**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 3: Run existing tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

Expected: all tests pass (same count as before, ~17 tests).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register LocalPtyManager and local session commands in Tauri app

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 7: Frontend Constants

**Files:**
- Create: `src/lib/constants.ts`

- [ ] **Step 1: Create constants.ts**

Create `src/lib/constants.ts`:

```typescript
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
  proxy_type: "none", // proxy is handled separately via env var injection
};
```

- [ ] **Step 2: Verify TypeScript is happy**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from this new file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat: add LOCAL_MACHINE_ID and LOCAL_MACHINE_SERVER constants

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 8: Update tauri.ts with Local Session API

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add connectLocal and disconnectLocal to terminalSessionApi**

In `src/lib/tauri.ts`, replace the `terminalSessionApi` export with:

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

  connectLocal: (
    channel: Channel<TerminalChannelMessage>,
    proxy?: ProxyConfig | null,
    cols?: number,
    rows?: number,
  ): Promise<string> =>
    invoke("connect_local_session", { channel, proxy: proxy ?? null, cols, rows }),

  disconnect: (sessionId: string): Promise<void> =>
    invoke("disconnect_ssh_session", { sessionId }),

  disconnectLocal: (sessionId: string): Promise<void> =>
    invoke("disconnect_local_session", { sessionId }),

  sendInput: (sessionId: string, data: number[]): Promise<void> =>
    invoke("terminal_input", { sessionId, data }),

  resize: (sessionId: string, cols: number, rows: number): Promise<void> =>
    invoke("terminal_resize", { sessionId, cols, rows }),
};
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat: add connectLocal and disconnectLocal to terminalSessionApi

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 9: Update useTerminalSession.ts

**Files:**
- Modify: `src/hooks/useTerminalSession.ts`

- [ ] **Step 1: Replace the full file content**

Replace `src/hooks/useTerminalSession.ts` with:

```typescript
import { useCallback } from "react";
import { terminalSessionApi } from "@/lib/tauri";
import { resolveProxy } from "@/lib/proxyResolver";
import { LOCAL_MACHINE_ID } from "@/lib/constants";
import { useSettingsStore } from "@/stores/settingsStore";
import { useServerStore } from "@/stores/serverStore";
import {
  createChannel,
  storeChannel,
  releaseChannel,
  registerDataHandler,
  unregisterDataHandler,
} from "@/lib/terminalChannels";
import {
  useTerminalSessionStore,
} from "@/stores/terminalSessionStore";

export { registerDataHandler, unregisterDataHandler };

/**
 * Returns helpers for connecting to / disconnecting from a server.
 */
export function useTerminalActions() {
  const addSession = useTerminalSessionStore((state) => state.addSession);
  const removeSession = useTerminalSessionStore((state) => state.removeSession);
  const updateSessionStatus = useTerminalSessionStore((state) => state.updateSessionStatus);

  const connect = useCallback(
    async (serverId: string, serverName: string) => {
      const channel = createChannel((sessionId, status, reason) => {
        updateSessionStatus(sessionId, status, reason);
      });

      let sessionId: string;

      if (serverId === LOCAL_MACHINE_ID) {
        // Local machine: resolve global proxy only (no per-server proxy_type)
        // and inject it as env vars in the spawned shell.
        const settings = useSettingsStore.getState();
        const proxy =
          settings.proxyType === "http" || settings.proxyType === "socks5"
            ? {
                proxy_type: settings.proxyType as "http" | "socks5",
                host: settings.proxyHost,
                port: Number(settings.proxyPort) || 0,
                bypass: settings.proxyBypass,
              }
            : null;
        sessionId = await terminalSessionApi.connectLocal(channel, proxy);
      } else {
        // Remote SSH server: resolve proxy (per-server override + global setting + bypass)
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

        sessionId = await terminalSessionApi.connect(serverId, channel, proxy);
      }

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

  const disconnect = useCallback(
    async (sessionId: string) => {
      try {
        // Check if this is a local machine session
        const session = useTerminalSessionStore
          .getState()
          .sessions.find((s) => s.id === sessionId);
        if (session?.serverId === LOCAL_MACHINE_ID) {
          await terminalSessionApi.disconnectLocal(sessionId);
        } else {
          await terminalSessionApi.disconnect(sessionId);
        }
      } catch {
        // Session may have already been removed from backend
      }
      releaseChannel(sessionId);
      removeSession(sessionId);
    },
    [removeSession],
  );

  const sendInput = useCallback(
    (sessionId: string, data: Uint8Array) => {
      void terminalSessionApi.sendInput(sessionId, Array.from(data));
    },
    [],
  );

  const resize = useCallback(
    (sessionId: string, cols: number, rows: number) => {
      void terminalSessionApi.resize(sessionId, cols, rows);
    },
    [],
  );

  return { connect, disconnect, sendInput, resize };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTerminalSession.ts
git commit -m "feat: detect local machine in connect/disconnect and call local PTY commands

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 10: Update ServerList to Show Local Machine Entry

**Files:**
- Modify: `src/components/server/ServerList.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Prepend LOCAL_MACHINE_SERVER in MainLayout**

In `src/components/layout/MainLayout.tsx`, add the import near the top (after other lib imports):

```typescript
import { LOCAL_MACHINE_SERVER } from "@/lib/constants";
```

Then find where `filteredServers` (or the servers array) is computed and passed to `ServerList`. Find the `useMemo` or variable that produces the servers array passed to `<ServerList servers={...} />` and prepend the local machine entry.

Look for a `filteredServers` computation. It will look something like:
```typescript
const filteredServers = useMemo(() => { ... }, [servers, searchTerm, ...]);
```

Update it to prepend `LOCAL_MACHINE_SERVER`:
```typescript
const filteredServers = useMemo(() => {
  const remoteServers = [...servers]
    .filter((s) => matchesSearch(s, searchTerm) && matchesSelectedGroup(s, selectedGroupIds))
    .sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return collator.compare(a.name, b.name);
    });
  // Local machine is always pinned first, not affected by search/filter
  return [LOCAL_MACHINE_SERVER, ...remoteServers];
}, [servers, searchTerm, selectedGroupIds]);
```

Note: Examine the actual MainLayout code to find the exact variable name and structure, then apply the equivalent change. The key is: `[LOCAL_MACHINE_SERVER, ...existingFilteredServers]`.

- [ ] **Step 2: Update ServerList to handle local machine entry**

In `src/components/server/ServerList.tsx`, add the import:

```typescript
import { LOCAL_MACHINE_ID } from "@/lib/constants";
```

In the `ServerList` component, find the `sortedServers` computation and update it to separate the local machine entry from remote servers before sorting:

```typescript
// Separate local machine (always first) from remote servers (sorted)
const { localEntry, remoteServers } = useMemo(() => {
  const localEntry = servers.find((s) => s.id === LOCAL_MACHINE_ID) ?? null;
  const remoteServers = [...servers.filter((s) => s.id !== LOCAL_MACHINE_ID)].sort(
    (left, right) => {
      if (left.is_favorite !== right.is_favorite) {
        return left.is_favorite ? -1 : 1;
      }
      return collator.compare(left.name, right.name);
    },
  );
  return { localEntry, remoteServers };
}, [servers]);
```

Then in the JSX render, replace `sortedServers.map(...)` with a two-part render:

```tsx
return (
  <div className="flex-1 overflow-y-auto px-2 py-3">
    <ul className="space-y-2">
      {/* Local machine — always pinned first */}
      {localEntry ? (
        <li key={localEntry.id}>
          <div
            className={[
              "flex items-start gap-2 rounded-xl border p-3 transition",
              localEntry.id === selectedServerId
                ? "border-[hsl(var(--ring))] bg-[hsl(var(--accent))]"
                : "border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--accent))]",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => onSelect(localEntry.id)}
              onDoubleClick={() => {
                onSelect(localEntry.id);
                void onLaunch(localEntry);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2">
                <LocalMachineIcon />
                <span className="truncate font-medium text-[hsl(var(--foreground))]">
                  {localEntry.name}
                </span>
                <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(var(--secondary-foreground))]">
                  local
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-[hsl(var(--muted-foreground))]">
                Native shell
              </p>
            </button>
          </div>
        </li>
      ) : null}

      {/* Remote servers */}
      {remoteServers.map((server) => {
        const isSelected = server.id === selectedServerId;
        return (
          <li key={server.id}>
            {/* ... keep existing server item JSX exactly as-is ... */}
          </li>
        );
      })}
    </ul>

    {/* ... keep existing ContextMenu ... */}
  </div>
);
```

**Important:** Keep all existing server-item JSX (the `<div>` with context menu, star button, etc.) unchanged inside `remoteServers.map(...)`. Only the outer map variable name changes from `sortedServers` to `remoteServers`.

- [ ] **Step 3: Add LocalMachineIcon component at the bottom of ServerList.tsx**

Add after the existing icon components at the bottom of `src/components/server/ServerList.tsx`:

```tsx
function LocalMachineIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
    >
      <rect x="2" y="3" width="16" height="11" rx="1.5" />
      <path d="M6 17h8M10 14v3" />
    </svg>
  );
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/server/ServerList.tsx src/components/layout/MainLayout.tsx
git commit -m "feat: pin Local Machine entry at top of server list

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 11: Simplified ServerDetail for Local Machine

**Files:**
- Modify: `src/components/server/ServerDetail.tsx`

- [ ] **Step 1: Add import and early-return for local machine**

In `src/components/server/ServerDetail.tsx`, add import:

```typescript
import { LOCAL_MACHINE_ID } from "@/lib/constants";
```

Find the `if (!server)` guard at the top of the component's return and add a new branch after it for the local machine. After the `if (!server) { return ... }` block, add:

```tsx
if (server.id === LOCAL_MACHINE_ID) {
  return (
    <section className="flex flex-1 flex-col gap-6 overflow-y-auto bg-[hsl(var(--background))] p-8">
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-5 w-5 text-[hsl(var(--secondary-foreground))]"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            >
              <rect x="2" y="3" width="16" height="11" rx="1.5" />
              <path d="M6 17h8M10 14v3" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              Local Machine
            </h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              Native shell — no SSH required
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-[hsl(var(--muted-foreground))]">
          Opens a local terminal session using your system's default shell. If a
          global proxy is configured, it is injected as{" "}
          <code className="rounded bg-[hsl(var(--secondary))] px-1 py-0.5 text-xs">
            HTTP_PROXY
          </code>{" "}
          /{" "}
          <code className="rounded bg-[hsl(var(--secondary))] px-1 py-0.5 text-xs">
            HTTPS_PROXY
          </code>{" "}
          environment variables.
        </p>

        <button
          type="button"
          onClick={() => onConnect(server)}
          className="mt-5 rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90"
        >
          Open Local Shell
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Full cargo check + cargo test**

```bash
cd src-tauri && cargo check 2>&1 | tail -5 && cargo test 2>&1 | tail -5
```

Expected: no errors; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/server/ServerDetail.tsx
git commit -m "feat: show simplified detail panel for Local Machine entry

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Task 12: Final Verification and Push

- [ ] **Step 1: Full TypeScript check**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 2: Full cargo check + tests**

```bash
cd src-tauri && cargo check 2>&1 | tail -5 && cargo test 2>&1 | tail -5
```

Expected: no compilation errors; all tests pass.

- [ ] **Step 3: Push to remote**

```bash
cd /root/projects/k-terminal && git push origin feature/embedded-terminal
```

Expected: all new commits pushed successfully.

---

## Self-Review

### Spec coverage
- ✅ Local Machine as permanent pinned entry (Task 10)
- ✅ Native PTY via portable-pty (Task 4)
- ✅ Same channel protocol as SSH (Task 4 uses TerminalChannelMessage)
- ✅ Shell detected from $SHELL / COMSPEC (Task 4)
- ✅ Proxy → HTTP_PROXY/HTTPS_PROXY/NO_PROXY injection (Task 4)
- ✅ No edit/delete context menu for local entry (Task 10 — no context menu wired)
- ✅ connect detects __local__ and calls connectLocal (Task 9)
- ✅ disconnect detects __local__ and calls disconnectLocal (Task 9)
- ✅ terminal_input and terminal_resize handle local sessions (Task 5)
- ✅ App icon with "K" (Task 1)
- ✅ Simplified ServerDetail for local machine (Task 11)

### Type consistency
- `LOCAL_MACHINE_ID = "__local__"` used consistently in Tasks 7, 9, 10, 11
- `ProxyConfig.bypass` added in Task 3 (Rust + TS), used in Task 4 (LocalPtyManager) and Task 9 (useTerminalSession)
- `terminalSessionApi.connectLocal` / `disconnectLocal` defined in Task 8, used in Task 9
- `LocalPtyManager` defined in Task 4, registered in Task 6, used in Task 5
