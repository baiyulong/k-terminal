# Local Shell Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose which shell is launched for the Local Machine terminal session via a dropdown in Settings, instead of always using the OS default (`%COMSPEC%` / `$SHELL`).

**Architecture:** The shell path is stored as a string in `settingsStore` (localStorage), passed from `useTerminalActions.connect()` → `terminalSessionApi.connectLocal()` → Rust `connect_local_session` command → `LocalPtyManager.connect()`. Empty string means auto-detect (existing behaviour preserved).

**Tech Stack:** Rust (portable-pty), TypeScript, React, Zustand, Tauri v2 IPC

---

## File Map

| File | Change |
|------|--------|
| `src/stores/settingsStore.ts` | Add `localShell: string` + `setLocalShell()`, persisted to localStorage |
| `src-tauri/src/managers/local_pty_manager.rs` | Add `shell: Option<String>` param to `connect()` |
| `src-tauri/src/commands/terminal_session_commands.rs` | Add `shell: Option<String>` to `connect_local_session` command |
| `src/lib/tauri.ts` | Add `shell?: string \| null` to `connectLocal()` |
| `src/hooks/useTerminalSession.ts` | Pass `settings.localShell || null` to `connectLocal()` |
| `src/pages/SettingsPage.tsx` | Add "Local Shell" row in the Terminal section |

---

### Task 1: Add `localShell` to settingsStore

**Files:**
- Modify: `src/stores/settingsStore.ts`

- [ ] **Step 1: Add the localStorage key and reader**

In `src/stores/settingsStore.ts`, after the existing `PROXY_BYPASS_KEY` constant, add:

```typescript
const LOCAL_SHELL_KEY = "kterminal.local.shell";

const readStoredLocalShell = (): string =>
  (typeof window !== "undefined" && window.localStorage.getItem(LOCAL_SHELL_KEY)) || "";
```

- [ ] **Step 2: Add the field and setter to the interface**

In the `SettingsState` interface, add after `setProxyBypass`:

```typescript
localShell: string;
setLocalShell: (shell: string) => void;
```

- [ ] **Step 3: Add the field and setter to the store**

In the `create<SettingsState>((set) => ({...}))` block, after the `proxyBypass` / `setProxyBypass` entries, add:

```typescript
localShell: readStoredLocalShell(),
setLocalShell: (shell) => {
  if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_SHELL_KEY, shell);
  set({ localShell: shell });
},
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /root/projects/k-terminal
git add src/stores/settingsStore.ts
git commit -m "feat: add localShell setting to settingsStore

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Add `shell` parameter to `LocalPtyManager::connect()`

**Files:**
- Modify: `src-tauri/src/managers/local_pty_manager.rs`

- [ ] **Step 1: Update the `connect()` signature**

Find the `pub fn connect(` function. Add `shell: Option<String>` as the last parameter (after `proxy`):

```rust
pub fn connect(
    &self,
    session_id: String,
    channel: Channel<TerminalChannelMessage>,
    cols: u16,
    rows: u16,
    proxy: Option<ProxyConfig>,
    shell: Option<String>,
) -> Result<(), String> {
```

- [ ] **Step 2: Update the shell detection block**

Replace the existing platform-conditional shell detection:

```rust
// Detect the user's preferred shell
#[cfg(windows)]
let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
#[cfg(not(windows))]
let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
```

With:

```rust
// Use caller-provided shell if specified, otherwise auto-detect
let shell = shell
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| {
        #[cfg(windows)]
        { std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string()) }
        #[cfg(not(windows))]
        { std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()) }
    });
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cd /root/projects/k-terminal/src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished dev profile` with no errors.

- [ ] **Step 4: Commit**

```bash
cd /root/projects/k-terminal
git add src-tauri/src/managers/local_pty_manager.rs
git commit -m "feat: accept optional shell path in LocalPtyManager::connect

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Update `connect_local_session` Tauri command

**Files:**
- Modify: `src-tauri/src/commands/terminal_session_commands.rs`

- [ ] **Step 1: Add `shell` parameter to the command**

Find `pub async fn connect_local_session(`. Add `shell: Option<String>` as a new parameter (order doesn't matter for Tauri commands, but place it after `proxy` for readability):

```rust
// async required by Tauri's State<> parameter even though work is sync/thread-based
#[tauri::command]
pub async fn connect_local_session(
    channel: tauri::ipc::Channel<TerminalChannelMessage>,
    cols: Option<u16>,
    rows: Option<u16>,
    proxy: Option<ProxyConfig>,
    shell: Option<String>,
    local_state: tauri::State<'_, LocalPtyManager>,
) -> Result<String, String> {
    let cols = cols.unwrap_or(80);
    let rows = rows.unwrap_or(24);
    let session_id = Uuid::new_v4().to_string();
    local_state.connect(session_id.clone(), channel, cols, rows, proxy, shell)?;
    Ok(session_id)
}
```

- [ ] **Step 2: Verify Rust compiles**

```bash
cd /root/projects/k-terminal/src-tauri && cargo check 2>&1 | tail -5
```

Expected: `Finished dev profile` with no errors.

- [ ] **Step 3: Commit**

```bash
cd /root/projects/k-terminal
git add src-tauri/src/commands/terminal_session_commands.rs
git commit -m "feat: add shell param to connect_local_session command

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Update `connectLocal()` in tauri.ts

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add `shell` parameter to `connectLocal`**

Find `connectLocal:` in `terminalSessionApi`. Update its signature and invoke call:

```typescript
connectLocal: (
  channel: Channel<TerminalChannelMessage>,
  proxy?: ProxyConfig | null,
  cols?: number,
  rows?: number,
  shell?: string | null,
): Promise<string> =>
  invoke("connect_local_session", { channel, proxy: proxy ?? null, cols, rows, shell: shell ?? null }),
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /root/projects/k-terminal
git add src/lib/tauri.ts
git commit -m "feat: add shell param to connectLocal in terminalSessionApi

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Pass `localShell` from hook to `connectLocal()`

**Files:**
- Modify: `src/hooks/useTerminalSession.ts`

- [ ] **Step 1: Pass `localShell` to `connectLocal`**

In the `connect` callback in `useTerminalActions()`, find the line:

```typescript
const sessionId = serverId === LOCAL_MACHINE_ID
  ? await terminalSessionApi.connectLocal(channel, proxy)
  : await terminalSessionApi.connect(serverId, channel, proxy);
```

Update it to pass `settings.localShell`:

```typescript
const sessionId = serverId === LOCAL_MACHINE_ID
  ? await terminalSessionApi.connectLocal(channel, proxy, undefined, undefined, settings.localShell || null)
  : await terminalSessionApi.connect(serverId, channel, proxy);
```

Note: `settings` is already read at the top of the callback via `useSettingsStore.getState()`. No new import needed.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd /root/projects/k-terminal
git add src/hooks/useTerminalSession.ts
git commit -m "feat: pass localShell setting to connectLocal in hook

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Add "Local Shell" row in SettingsPage

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

This task adds the UI. Read the file to find the Terminal section (font size, font family), then insert the new row after it.

- [ ] **Step 1: Add imports**

At the top of `SettingsPage.tsx`, the import from `settingsStore` currently is:

```typescript
import { useSettingsStore, TERMINAL_FONT_FAMILIES } from "@/stores/settingsStore";
```

This import already brings in the whole store; no change needed — the new fields are read via `useSettingsStore((state) => state.localShell)` inline.

- [ ] **Step 2: Add state reads for localShell**

After the existing `setProxyBypass` line in the component:

```typescript
const localShell = useSettingsStore((state) => state.localShell);
const setLocalShell = useSettingsStore((state) => state.setLocalShell);
```

- [ ] **Step 3: Add platform detection helper**

After the `useSettingsStore` state reads, add:

```typescript
const isWindows = typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().includes("windows");

const shellPresets = isWindows
  ? [
      { label: "Auto-detect", value: "" },
      { label: "PowerShell (pwsh)", value: "pwsh" },
      { label: "Windows PowerShell", value: "powershell" },
      { label: "Command Prompt (cmd.exe)", value: "cmd.exe" },
      { label: "Git Bash", value: "C:\\Program Files\\Git\\bin\\bash.exe" },
      { label: "WSL (bash)", value: "wsl.exe" },
      { label: "Custom...", value: "__custom__" },
    ]
  : [
      { label: "Auto-detect", value: "" },
      { label: "Zsh (/bin/zsh)", value: "/bin/zsh" },
      { label: "Bash (/bin/bash)", value: "/bin/bash" },
      { label: "Fish (/usr/bin/fish)", value: "/usr/bin/fish" },
      { label: "Sh (/bin/sh)", value: "/bin/sh" },
      { label: "Custom...", value: "__custom__" },
    ];

// The dropdown value: if localShell doesn't match any preset, it's "custom"
const isCustomShell =
  localShell !== "" &&
  !shellPresets.some((p) => p.value === localShell && p.value !== "__custom__");
const dropdownValue = isCustomShell ? "__custom__" : localShell;
```

- [ ] **Step 4: Find the Terminal section in the JSX**

Search for `terminalFontFamily` in the JSX — it's in the Terminal settings section. Immediately after the font family `<select>` row (and before the closing `</div>` of the Terminal section), insert the Local Shell row:

```tsx
{/* Local Shell */}
<div className="flex items-center justify-between gap-4">
  <div>
    <p className="text-sm font-medium text-[hsl(var(--foreground))]">
      Local Shell
    </p>
    <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">
      Shell launched for Local Machine sessions
    </p>
  </div>
  <div className="flex flex-col items-end gap-1.5">
    <select
      className={inputClassName + " w-56"}
      value={dropdownValue}
      onChange={(e) => {
        if (e.target.value === "__custom__") {
          // Keep current localShell so the text input shows it
          if (!isCustomShell) setLocalShell("");
        } else {
          setLocalShell(e.target.value);
        }
      }}
    >
      {shellPresets.map((p) => (
        <option key={p.value} value={p.value}>
          {p.label}
        </option>
      ))}
    </select>
    {(dropdownValue === "__custom__" || isCustomShell) && (
      <input
        type="text"
        className={inputClassName + " w-56"}
        placeholder="/usr/bin/zsh or C:\path\to\shell.exe"
        value={localShell}
        onChange={(e) => setLocalShell(e.target.value)}
      />
    )}
  </div>
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /root/projects/k-terminal
git add src/pages/SettingsPage.tsx
git commit -m "feat: add Local Shell selector to Settings page

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Final verification + push

- [ ] **Step 1: Full build check**

```bash
cd /root/projects/k-terminal/src-tauri && cargo check 2>&1 | tail -3
```

Expected: `Finished dev profile` — 0 errors.

- [ ] **Step 2: TypeScript check**

```bash
cd /root/projects/k-terminal && npx tsc --noEmit 2>&1 | head -5
```

Expected: 0 errors.

- [ ] **Step 3: Show log**

```bash
cd /root/projects/k-terminal && git log --oneline -8
```

- [ ] **Step 4: Push**

```bash
cd /root/projects/k-terminal && git push origin feature/embedded-terminal
```
