# KTerminal

A modern SSH client desktop application built with Tauri, React, and Rust. Manage servers, profiles, and SSH connections with an intuitive UI and powerful terminal integration.

![CI Status](https://github.com/baiyulong/k-terminal/actions/workflows/ci.yml/badge.svg)

## Features

- **Multi-platform support**: Windows, macOS, and Linux
- **Server & Group Management**: Organize servers into collapsible groups with favorites
- **Terminal Profiles**: Define and manage custom terminal profiles with SSH templates
- **Fuzzy Search**: Ctrl+K command palette to quickly find and launch servers
- **SSH Command Generation**: Automatic SSH command generation with template variables
- **Secure Credentials**: OS-level keyring integration (Windows DPAPI, macOS Keychain, Linux SecretService)
- **Connection Logging**: Track last connected time and connection history
- **Dark Mode**: System-aware theme with light/dark mode toggle
- **Import/Export**: Backup and restore server configurations as JSON
- **Platform Detection**: Auto-detect available terminal emulators and set defaults
- **Keyboard Shortcuts**: 
  - `Ctrl+K` / `Cmd+K` - Open command palette
  - `Ctrl+N` / `Cmd+N` - Create new server

## Installation

### Download Pre-built Installers

Visit the [GitHub Actions Artifacts](https://github.com/baiyulong/k-terminal/actions) page to download the latest builds:

- **Windows**: `.exe` (NSIS installer) or `.msi`
- **macOS**: `.dmg`
- **Linux**: `.deb` or `.AppImage`

### macOS/Windows Security Warnings

Since KTerminal is an unsigned application, you may see security warnings when opening it for the first time:

**macOS (Gatekeeper):**
1. Finder → Applications → KTerminal
2. Right-click → "Open"
3. Click "Open" in the confirmation dialog

**Windows (SmartScreen):**
1. Click "More info" in the SmartScreen warning
2. Click "Run anyway"

This is normal for open-source software. Once the app gains installation history, the warnings will decrease.

## Getting Started

### Add a Server

1. Click **Add Server** (top toolbar)
2. Fill in connection details:
   - Name, Host, Port, Username
   - Auth type: Password, Key, or Key + Passphrase
   - Optional: Tags, Description, Group

3. For **Key Authentication**:
   - Enter the path to your private key (e.g., `~/.ssh/id_rsa`)
   - Password stored securely in OS keyring

4. Click **Save**

### Launch Terminal

1. Select a server from the left panel
2. Click **Connect** button or double-click the server name
3. Terminal launches with pre-configured SSH command

### Manage Groups

1. Right-click in the Group Tree → **New Group**
2. Drag servers into groups to organize
3. Collapse/expand groups with the arrow icon

### Configure Terminal Profiles

1. Go to **Settings** (gear icon)
2. Click **Terminal Profiles**
3. Select your default terminal:
   - **Linux**: Auto-detected (GNOME Terminal, Konsole, xterm, etc.)
   - **macOS**: Terminal.app or iTerm2
   - **Windows**: PowerShell or Command Prompt

## Development

### Prerequisites

- Node.js 20+ (for Vite)
- Rust 1.70+
- System dependencies:
  - **Ubuntu**: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev libdbus-1-dev libsqlite3-dev pkg-config librsvg2-dev patchelf`
  - **macOS**: Xcode Command Line Tools
  - **Windows**: Visual Studio Build Tools

### Setup

```bash
# Install dependencies
npm install

# Start development server (Tauri + Vite)
npm run dev

# Build for production
npm run build

# Build installers/bundles
npm run tauri build

# Run tests
cd src-tauri && cargo test --lib
cd .. && npx tsc --noEmit
```

### Project Structure

```
k-terminal/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── pages/              # Page components
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand stores
│   └── lib/                # Utilities
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── managers/       # Business logic (Server, Group, Terminal, SSH)
│   │   ├── commands/       # Tauri commands
│   │   ├── db/             # Database models & migrations
│   │   └── security/       # Keyring integration
│   ├── migrations/         # Diesel SQL migrations
│   └── icons/              # App icons (png, ico, icns)
├── .github/workflows/      # CI/CD
└── src-tauri/tauri.conf.json  # Tauri configuration
```

### Database

Uses SQLite with Diesel ORM:

```sql
-- Tables
- servers          # SSH server configurations
- groups           # Server grouping
- terminal_profiles # Terminal launcher profiles
- connection_logs  # Connection history
```

Run migrations: `cd src-tauri && diesel migration run`

### Tech Stack

- **Frontend**: React 19, TypeScript, TailwindCSS, Zustand, React Query
- **Backend**: Rust, Tauri v2, Diesel, russh
- **Security**: OS keyring (keyring crate)
- **Build**: Vite, cargo, npm
- **CI/CD**: GitHub Actions

## Architecture

### SSH Command Flow

```
Server Selection
    ↓
SSH Command Generation (template → real command)
    ↓
Terminal Profile Detection
    ↓
Execute in System Terminal
    ↓
Log Connection
```

### Credential Security

Passwords and passphrases never touch the database:
- **Windows**: DPAPI encryption via Windows Credential Manager
- **macOS**: macOS Keychain
- **Linux**: SecretService (D-Bus)

Database stores only: `keyring://{server_id}` reference

## Build Artifacts

GitHub Actions builds all installers for every push:

- ✅ Rust tests (3 platforms)
- ✅ Frontend build & type-check
- ✅ Tauri builds with bundling (3 platforms)
- ✅ Artifact upload to GitHub Actions

Download from: [Actions Page](https://github.com/baiyulong/k-terminal/actions)

## Future Features (Phase 2)

- [ ] SFTP file transfer
- [ ] Batch command execution
- [ ] Script center (saved command templates)
- [ ] SSH key generation & management
- [ ] Port forwarding UI
- [ ] Jump host / proxy support
- [ ] Integration with cloud providers (AWS, DigitalOcean, etc.)

## Troubleshooting

### "Cannot find sqlite3.lib" (Windows Build)
Fixed in CI via `libsqlite3-sys` bundled feature. For local builds, ensure `pkg-config` or VCPKG is set up.

### Terminal not launching (Linux)
Ensure `DISPLAY` is set and X11 forwarding enabled. For WSL2, use `--display :0`.

### Cannot unlock keyring (Linux)
SecretService requires an active session manager (GNOME, KDE, etc.). For headless environments, passwords must be entered manually.

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

Built by the KTerminal team.

---

**Questions or Issues?** Open an issue on [GitHub Issues](https://github.com/baiyulong/k-terminal/issues)
