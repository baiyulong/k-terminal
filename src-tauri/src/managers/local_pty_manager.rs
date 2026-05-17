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

// Safety: On Unix the backing type is `std::process::Child` which is `Send`.
// On Windows the backing type holds a `HANDLE` which is valid to transfer between
// threads per Win32 documentation. The only method called cross-thread is `kill()`,
// which is a syscall with no aliasing concerns. The `Mutex` wrapper ensures exclusive
// access.
struct SendableChild(Box<dyn portable_pty::Child>);
unsafe impl Send for SendableChild {}

pub struct LocalPtyHandle {
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    child: Arc<Mutex<SendableChild>>,
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
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty() && !l.starts_with('#'))
                    .collect::<Vec<_>>()
                    .join(",");
                if !no_proxy.is_empty() {
                    cmd.env("NO_PROXY", &no_proxy);
                    cmd.env("no_proxy", &no_proxy);
                }
            }
        }

        let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
        drop(pair.slave); // slave no longer needed after spawn

        let writer = pair.master.take_writer().map_err(|e| {
            let _ = child.kill();
            e.to_string()
        })?;
        let mut reader = pair.master.try_clone_reader().map_err(|e| {
            let _ = child.kill();
            e.to_string()
        })?;

        let child_arc = Arc::new(Mutex::new(SendableChild(child)));
        let child_for_thread = child_arc.clone();

        let handle = LocalPtyHandle {
            writer: Arc::new(Mutex::new(writer)),
            master: Arc::new(Mutex::new(pair.master)),
            child: child_arc,
        };

        self.sessions.lock().unwrap_or_else(|e| e.into_inner()).insert(session_id.clone(), handle);

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
            // Reap the child and capture exit status to distinguish clean vs unexpected exit
            let exit_clean = if let Ok(mut child_guard) = child_for_thread.lock() {
                child_guard.0.wait().map(|s| s.success()).unwrap_or(false)
            } else {
                false
            };
            // Shell exited or PTY closed
            let _ = channel.send(TerminalChannelMessage::Status(TerminalStatusEvent {
                session_id,
                status: if exit_clean { "disconnected" } else { "error" }.to_string(),
                reason: if exit_clean { None } else { Some("Shell exited unexpectedly".to_string()) },
            }));
        });

        Ok(())
    }

    /// Kill the child process and remove the session.
    pub fn remove(&self, session_id: &str) -> bool {
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(handle) = sessions.remove(session_id) {
            handle.kill();
            true
        } else {
            false
        }
    }

    /// Send raw bytes to the shell's stdin.
    pub fn send_input(&self, session_id: &str, data: Vec<u8>) -> bool {
        let writer_arc = {
            let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.get(session_id).map(|h| h.writer.clone())
        };
        if let Some(arc) = writer_arc {
            if let Ok(mut writer) = arc.lock() {
                return writer.write_all(&data).is_ok();
            }
        }
        false
    }

    /// Resize the PTY to the new dimensions.
    pub fn send_resize(&self, session_id: &str, cols: u16, rows: u16) -> bool {
        let master_arc = {
            let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.get(session_id).map(|h| h.master.clone())
        };
        if let Some(arc) = master_arc {
            if let Ok(master) = arc.lock() {
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
