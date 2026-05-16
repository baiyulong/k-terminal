use serde::{Deserialize, Serialize};

use crate::db::models::Server;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SshCommand {
    pub full_command: String,
    pub host: String,
    pub port: i32,
    pub user: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SshError {
    #[error("SSH key authentication requires a private key path")]
    MissingPrivateKeyPath,
    #[error("Invalid port forwards JSON: {0}")]
    InvalidPortForwards(serde_json::Error),
    #[error("Unsupported port forward direction: {0}")]
    InvalidPortForwardDirection(String),
}

#[derive(Debug, Deserialize)]
struct PortForward {
    local_port: i32,
    remote_host: String,
    remote_port: i32,
    direction: String,
}

pub fn generate_ssh_command(server: &Server) -> Result<SshCommand, SshError> {
    let destination = format!("{}@{}", server.username, server.host);
    let mut parts = vec![format!(
        "ssh {} -p {}",
        shell_escape(&destination),
        server.port
    )];

    if server.auth_type == "key" {
        let private_key_path = server
            .private_key_path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or(SshError::MissingPrivateKeyPath)?;
        parts.push(format!("-i {}", shell_escape(private_key_path)));
    }

    if let Some(jump_host) = server
        .jump_host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(format!("-J {}", shell_escape(jump_host)));
    }

    if server.keep_alive {
        parts.push("-o ServerAliveInterval=60".to_string());
        parts.push("-o ServerAliveCountMax=3".to_string());
    }

    if server.compression {
        parts.push("-C".to_string());
    }

    if server.agent_forward {
        parts.push("-A".to_string());
    }

    if let Some(port_forwards) = server
        .port_forwards
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let forwards: Vec<PortForward> =
            serde_json::from_str(port_forwards).map_err(SshError::InvalidPortForwards)?;

        for forward in forwards {
            let flag = match forward.direction.to_ascii_lowercase().as_str() {
                "local" => "-L",
                "remote" => "-R",
                direction => {
                    return Err(SshError::InvalidPortForwardDirection(direction.to_string()))
                }
            };

            let value = format!(
                "{}:{}:{}",
                forward.local_port, forward.remote_host, forward.remote_port
            );
            parts.push(format!("{} {}", flag, shell_escape(&value)));
        }
    }

    if let Some(startup_command) = server
        .startup_command
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        parts.push(shell_escape(startup_command));
    }

    Ok(SshCommand {
        full_command: parts.join(" "),
        host: server.host.clone(),
        port: server.port,
        user: server.username.clone(),
    })
}

pub fn replace_template_variables(template: &str, server: &Server, ssh_command: &str) -> String {
    template
        .replace("{{HOST}}", &server.host)
        .replace("{{PORT}}", &server.port.to_string())
        .replace("{{USER}}", &server.username)
        .replace("{{SSH_COMMAND}}", ssh_command)
}

fn shell_escape(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    if value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || "-_./:=@".contains(character))
    {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::{generate_ssh_command, replace_template_variables};
    use crate::db::models::Server;

    fn build_server() -> Server {
        let now = Utc::now().naive_utc();

        Server {
            id: "server-1".into(),
            name: "Example".into(),
            host: "example.com".into(),
            port: 2222,
            username: "alice".into(),
            auth_type: "password".into(),
            password: None,
            private_key_path: None,
            passphrase: None,
            group_id: None,
            description: None,
            terminal_profile_id: None,
            startup_command: None,
            encoding: "utf8".into(),
            is_favorite: false,
            tags: None,
            jump_host: None,
            keep_alive: false,
            compression: false,
            agent_forward: false,
            port_forwards: None,
            last_connected_at: None,
            created_at: now,
            updated_at: now,
        }
    }

    #[test]
    fn generates_base_command() {
        let server = build_server();

        let command = generate_ssh_command(&server).expect("base command should generate");

        assert_eq!(command.host, "example.com");
        assert_eq!(command.port, 2222);
        assert_eq!(command.user, "alice");
        assert_eq!(command.full_command, "ssh alice@example.com -p 2222");
    }

    #[test]
    fn generates_command_with_all_supported_options() {
        let mut server = build_server();
        server.auth_type = "key".into();
        server.private_key_path = Some("/Users/alice/.ssh/id_ed25519".into());
        server.jump_host = Some("bastion.example.com".into());
        server.keep_alive = true;
        server.compression = true;
        server.agent_forward = true;
        server.port_forwards = Some(
            r#"[
                {"local_port":8080,"remote_host":"localhost","remote_port":80,"direction":"local"},
                {"local_port":8443,"remote_host":"service.internal","remote_port":443,"direction":"remote"}
            ]"#
            .into(),
        );
        server.startup_command = Some("tmux attach || tmux new".into());

        let command = generate_ssh_command(&server).expect("full command should generate");

        assert_eq!(
            command.full_command,
            "ssh alice@example.com -p 2222 -i /Users/alice/.ssh/id_ed25519 -J bastion.example.com -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -C -A -L 8080:localhost:80 -R 8443:service.internal:443 'tmux attach || tmux new'"
        );
    }

    #[test]
    fn replaces_template_variables() {
        let server = build_server();
        let ssh_command = "ssh alice@example.com -p 2222";

        let rendered = replace_template_variables(
            "connect {{USER}}@{{HOST}}:{{PORT}} with {{SSH_COMMAND}}",
            &server,
            ssh_command,
        );

        assert_eq!(
            rendered,
            "connect alice@example.com:2222 with ssh alice@example.com -p 2222"
        );
    }

    #[test]
    fn rejects_key_auth_without_private_key_path() {
        let mut server = build_server();
        server.auth_type = "key".into();

        let error = generate_ssh_command(&server).expect_err("missing key path should error");

        assert!(error.to_string().contains("private key"));
    }

    #[test]
    fn rejects_invalid_port_forward_direction() {
        let mut server = build_server();
        server.port_forwards = Some(
            r#"[{"local_port":8080,"remote_host":"localhost","remote_port":80,"direction":"dynamic"}]"#
                .into(),
        );

        let error = generate_ssh_command(&server).expect_err("invalid direction should error");

        assert!(error.to_string().contains("direction"));
    }
}
