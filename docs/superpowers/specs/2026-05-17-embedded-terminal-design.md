# Embedded Terminal Design

**Date:** 2026-05-17  
**Status:** Approved

## Problem

KTerminal currently launches SSH connections by spawning an external terminal emulator (GNOME Terminal, iTerm2, cmd.exe, etc.). This creates a disjointed experience: the user manages connections in the app but works in a separate window. The goal is to embed a fully functional SSH terminal directly inside the app.

## Design Decisions

| Question | Decision | Rationale |
|---|---|---|
| Layout | Multi-tab terminal (C) | Maximizes terminal space; familiar to developers |
| Sidebar in terminal mode | Collapsed icon bar (B) | Balances access to server list with screen space |
| External terminal | Replace entirely | Cleaner UX; no dual code paths to maintain |
| SSH implementation | russh direct connection | No system ssh dependency; lays groundwork for SFTP/batch later |

## Architecture

```
┌─────────────────────────────────────┐
│  Frontend (React + xterm.js)        │
│                                     │
│  TerminalPage                       │
│  ├── CollapsedSidebar (42px)        │
│  │   └── ServerPopover (on click)   │
│  └── TerminalTabs                   │
│      ├── TabBar (tabs + add button) │
│      └── TerminalView (xterm.js)    │
└──────────────┬──────────────────────┘
               │ Tauri Events (bidirectional)
               │  terminal:data    (server → client)
               │  terminal:input   (client → server)
               │  terminal:resize  (client → server)
               │  terminal:status  (connect/disconnect events)
┌──────────────▼──────────────────────┐
│  Backend (Rust + russh)             │
│                                     │
│  SshSessionManager                  │
│  └── HashMap<SessionId, SshSession> │
│      ├── russh client connection    │
│      ├── SSH channel with PTY       │
│      └── tokio task (stdout pump)  │
└─────────────────────────────────────┘
```

## Frontend Components

### TerminalPage
- Replaces the current `MainLayout` right-side content when in terminal mode
- Rendered when at least one SSH session exists
- Falls back to normal server list view when no sessions are open

### CollapsedSidebar
- Width: 42px fixed
- Contains: server list toggle icon (top), settings icon (bottom)
- Clicking the server list icon opens `ServerPopover` as an overlay panel
- `ServerPopover`: shows the full server list; double-click a server to open a new terminal tab

### TerminalTabs (TabBar)
- One tab per active SSH session
- Tab shows: colored dot (green=connected, yellow=connecting, red=disconnected) + server name + close button (×)
- `+` button at the end opens `ServerPopover` to add a new connection
- Tabs are closeable; closing last tab returns to the server list view

### TerminalView
- Wraps a single `xterm.Terminal` instance
- Uses `@xterm/addon-fit` to auto-resize terminal to fill available space
- Listens to `terminal:data` Tauri events and writes to the xterm instance
- Sends user keystrokes via `terminal_input` Tauri command
- Sends resize events via `terminal_resize` Tauri command when container size changes

## Backend Components

### SshSessionManager (`src/managers/ssh_session_manager.rs`)

```rust
pub struct SshSessionManager {
    sessions: Arc<Mutex<HashMap<String, SshSession>>>,
    app_handle: AppHandle,
}

pub struct SshSession {
    pub id: String,
    pub server_id: String,
    pub status: SessionStatus,
    // Internal: russh channel sender for writing input
    input_tx: tokio::sync::mpsc::Sender<Vec<u8>>,
}

pub enum SessionStatus {
    Connecting,
    Connected,
    Disconnected(String), // reason
}
```

### Tauri Commands (new, in `src/commands/terminal_session_commands.rs`)

| Command | Arguments | Description |
|---|---|---|
| `connect_ssh_session` | `server_id: String` | Creates SSH session, returns `session_id` |
| `disconnect_ssh_session` | `session_id: String` | Closes SSH channel and removes session |
| `terminal_input` | `session_id: String, data: Vec<u8>` | Sends raw bytes to SSH channel stdin |
| `terminal_resize` | `session_id: String, cols: u16, rows: u16` | Sends PTY resize to SSH server |

### Tauri Events (backend → frontend)

| Event | Payload | Description |
|---|---|---|
| `terminal:data` | `{ session_id: String, data: Vec<u8> }` | Raw bytes from SSH stdout/stderr |
| `terminal:status` | `{ session_id: String, status: String, reason?: String }` | Session state changes |

### SSH Connection Flow

1. Look up server in DB, retrieve password/key from OS keyring
2. `russh::client::connect(config, (host, port), handler)` — TCP + SSH handshake
3. `client.authenticate_password(user, pass)` or `client.authenticate_publickey(user, key)`
4. `client.channel_open_session()` — open SSH channel
5. `channel.request_pty(term, cols, rows, ...)` — request PTY (term type: `xterm-256color`)
6. `channel.request_shell()` — start remote shell
7. Spawn tokio task: loop reading `channel.data()` → emit `terminal:data` event
8. Spawn tokio task: loop reading `input_rx` → write to `channel.data()`

### Host Key Handling

MVP: Accept all host keys (implement a `russh::client::Handler` that returns `Ok(true)` for all host key checks). A warning is logged but connection proceeds. Known_hosts verification is a post-MVP feature.

### Session Lifecycle

- Session is created by `connect_ssh_session` command
- Session lives in `SshSessionManager` (global Tauri state)
- When the SSH channel closes (remote EOF, disconnect): emit `terminal:status` disconnected event
- Frontend shows red dot on tab; user can close the tab or reconnect
- `disconnect_ssh_session` or tab close cleans up the session from the map

## Changes to Existing Code

### Removed
- `TerminalProfilesPage.tsx` — no longer needed (no external terminal to configure)
- `src/managers/terminal_manager.rs` — `launch_terminal` function that spawns external process
- `terminal_commands.rs` — `launch_terminal` Tauri command
- Settings page "Terminal Profiles" section

### Modified
- `App.tsx` — routing logic: when sessions exist, render `TerminalPage` instead of `MainLayout`
- `ServerList.tsx` — double-click now calls `connect_ssh_session` instead of `launch_terminal`
- `ServerDetail.tsx` — "Connect" button calls `connect_ssh_session`

### Added
- `npm install xterm @xterm/addon-fit`
- `Cargo.toml`: no new crate needed (russh already present); add `tokio::sync::mpsc` usage
- `src/managers/ssh_session_manager.rs`
- `src/commands/terminal_session_commands.rs`
- `src/components/terminal/TerminalView.tsx`
- `src/components/terminal/TerminalTabs.tsx`
- `src/components/terminal/TerminalPage.tsx`
- `src/components/terminal/CollapsedSidebar.tsx`
- `src/components/terminal/ServerPopover.tsx`
- `src/hooks/useTerminalSession.ts`

## Data Flow Example

```
User types "ls -la" + Enter
    → xterm.js onData callback
    → terminal_input(session_id, bytes)  [Tauri command]
    → SshSession.input_tx.send(bytes)
    → tokio task writes to russh channel
    → SSH server executes command
    → stdout bytes arrive in russh channel
    → tokio task emits terminal:data event
    → TerminalView receives event
    → xterm.terminal.write(bytes)
    → rendered on screen
```

## MVP Scope

### Included
- russh direct SSH connection with PTY shell
- Password and SSH private key authentication (reuses existing keyring integration)
- Multi-tab UI with add/close tabs
- Collapsed 42px icon sidebar with server popover overlay
- Window resize propagation to PTY
- Tab status indicators (connecting / connected / disconnected)
- Disconnect detection with red dot indicator
- Connection logging (reuses existing `connection_logs` table)

### Excluded (post-MVP)
- known_hosts host key verification
- SSH jump hosts / ProxyJump
- Terminal theme / font size customization
- SFTP file transfer
- Split panes within a single tab
- Session reconnect (user closes and reopens tab to reconnect)
