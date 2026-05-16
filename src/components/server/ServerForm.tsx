import { useEffect, useMemo, useState } from "react";
import { useTerminalProfilesQuery } from "@/hooks/useTerminalProfiles";
import type { GroupNode, Server } from "@/lib/types";
import { useGroupStore } from "@/stores/groupStore";

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
}

interface ServerFormProps {
  open: boolean;
  server?: Server | null;
  defaultGroupId?: string | null;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (values: ServerFormValues) => void | Promise<void>;
}

const inputClassName =
  "w-full rounded-lg border border-[hsl(var(--input))] bg-[hsl(var(--background))] px-3 py-2 text-sm text-[hsl(var(--foreground))] outline-none transition focus:border-[hsl(var(--ring))] focus:ring-2 focus:ring-[hsl(var(--ring))]/20";

const labelClassName =
  "mb-2 block text-sm font-medium text-[hsl(var(--foreground))]";

const sectionClassName =
  "rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-4";

const flattenGroupOptions = (
  groups: GroupNode[],
  depth = 0,
): Array<{ id: string; label: string }> =>
  groups.flatMap((group) => [
    {
      id: group.id,
      label: `${"— ".repeat(depth)}${group.name}`,
    },
    ...flattenGroupOptions(group.children, depth + 1),
  ]);

function getInitialValues(
  server?: Server | null,
  defaultGroupId?: string | null,
): ServerFormValues {
  return {
    name: server?.name ?? "",
    host: server?.host ?? "",
    port: server?.port ?? 22,
    username: server?.username ?? "root",
    auth_type: server?.auth_type ?? "password",
    password: server?.password ?? "",
    private_key_path: server?.private_key_path ?? "",
    passphrase: server?.passphrase ?? "",
    group_id: server?.group_id ?? defaultGroupId ?? "",
    description: server?.description ?? "",
    terminal_profile_id: server?.terminal_profile_id ?? "",
    startup_command: server?.startup_command ?? "",
    encoding: server?.encoding ?? "utf8",
    is_favorite: server?.is_favorite ?? false,
    tags: server?.tags ?? "",
    jump_host: server?.jump_host ?? "",
    keep_alive: server?.keep_alive ?? true,
    compression: server?.compression ?? false,
    agent_forward: server?.agent_forward ?? false,
    port_forwards: server?.port_forwards ?? "",
  };
}

export function ServerForm({
  open,
  server,
  defaultGroupId = null,
  isSubmitting = false,
  onClose,
  onSubmit,
}: ServerFormProps) {
  const groups = useGroupStore((state) => state.groups);
  const terminalProfilesQuery = useTerminalProfilesQuery();
  const groupOptions = useMemo(() => flattenGroupOptions(groups), [groups]);
  const terminalProfiles = terminalProfilesQuery.data ?? [];
  const initialValues = useMemo(
    () => getInitialValues(server, defaultGroupId),
    [defaultGroupId, server],
  );
  const [formValues, setFormValues] = useState<ServerFormValues>(initialValues);

  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose, open]);

  if (!open) {
    return null;
  }

  const isKeyAuth = formValues.auth_type === "key";
  const isPasswordAuth = formValues.auth_type === "password";

  const handleChange = <T extends keyof ServerFormValues>(
    key: T,
    value: ServerFormValues[T],
  ) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      [key]: value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit({
      ...formValues,
      name: formValues.name.trim(),
      host: formValues.host.trim(),
      username: formValues.username.trim(),
      encoding: formValues.encoding.trim() || "utf8",
      port: Number.isNaN(formValues.port) ? 22 : formValues.port,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-[hsl(var(--foreground))]">
              {server ? "Edit Server" : "Add Server"}
            </h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Configure connection settings, authentication, and advanced
              options.
            </p>
          </div>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-sm text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
          <fieldset disabled={isSubmitting} className="space-y-6">
            <section className={sectionClassName}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Basic Information
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="server-name">
                    Name
                  </label>
                  <input
                    id="server-name"
                    required
                    type="text"
                    value={formValues.name}
                    onChange={(event) => handleChange("name", event.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="server-tags">
                    Tags
                  </label>
                  <input
                    id="server-tags"
                    type="text"
                    value={formValues.tags}
                    onChange={(event) => handleChange("tags", event.target.value)}
                    placeholder="production, linux, db"
                    className={inputClassName}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName} htmlFor="server-description">
                    Description
                  </label>
                  <textarea
                    id="server-description"
                    rows={3}
                    value={formValues.description}
                    onChange={(event) =>
                      handleChange("description", event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
                <label className="inline-flex items-center gap-3 text-sm text-[hsl(var(--foreground))]">
                  <input
                    type="checkbox"
                    checked={formValues.is_favorite}
                    onChange={(event) =>
                      handleChange("is_favorite", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--input))]"
                  />
                  Mark as favorite
                </label>
              </div>
            </section>

            <section className={sectionClassName}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Connection
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="xl:col-span-2">
                  <label className={labelClassName} htmlFor="server-host">
                    Host
                  </label>
                  <input
                    id="server-host"
                    required
                    type="text"
                    value={formValues.host}
                    onChange={(event) => handleChange("host", event.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="server-port">
                    Port
                  </label>
                  <input
                    id="server-port"
                    required
                    min={1}
                    max={65535}
                    type="number"
                    value={formValues.port}
                    onChange={(event) =>
                      handleChange("port", Number(event.target.value))
                    }
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="server-username">
                    Username
                  </label>
                  <input
                    id="server-username"
                    required
                    type="text"
                    value={formValues.username}
                    onChange={(event) =>
                      handleChange("username", event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="server-encoding">
                    Encoding
                  </label>
                  <input
                    id="server-encoding"
                    type="text"
                    value={formValues.encoding}
                    onChange={(event) =>
                      handleChange("encoding", event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor="server-jump-host">
                    Jump Host
                  </label>
                  <input
                    id="server-jump-host"
                    type="text"
                    value={formValues.jump_host}
                    onChange={(event) =>
                      handleChange("jump_host", event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
                <div className="md:col-span-2 xl:col-span-2">
                  <label className={labelClassName} htmlFor="server-startup-command">
                    Startup Command
                  </label>
                  <input
                    id="server-startup-command"
                    type="text"
                    value={formValues.startup_command}
                    onChange={(event) =>
                      handleChange("startup_command", event.target.value)
                    }
                    className={inputClassName}
                  />
                </div>
                <div className="md:col-span-2 xl:col-span-4">
                  <label className={labelClassName} htmlFor="server-port-forwards">
                    Port Forwards
                  </label>
                  <textarea
                    id="server-port-forwards"
                    rows={2}
                    value={formValues.port_forwards}
                    onChange={(event) =>
                      handleChange("port_forwards", event.target.value)
                    }
                    placeholder="127.0.0.1:5432:db.internal:5432"
                    className={inputClassName}
                  />
                </div>
              </div>
            </section>

            <section className={sectionClassName}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Authentication
              </h3>
              <div className="mt-4 space-y-4">
                <div>
                  <span className={labelClassName}>Auth Type</span>
                  <div className="flex flex-wrap gap-4">
                    {[
                      ["password", "Password"],
                      ["key", "Private Key"],
                      ["agent", "SSH Agent"],
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border))] px-4 py-2 text-sm text-[hsl(var(--foreground))]"
                      >
                        <input
                          type="radio"
                          name="auth_type"
                          value={value}
                          checked={formValues.auth_type === value}
                          onChange={() =>
                            handleChange(
                              "auth_type",
                              value as ServerFormValues["auth_type"],
                            )
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className={labelClassName} htmlFor="server-password">
                      Password
                    </label>
                    <input
                      id="server-password"
                      type="password"
                      required={isPasswordAuth}
                      value={formValues.password}
                      onChange={(event) =>
                        handleChange("password", event.target.value)
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="server-private-key-path">
                      Private Key Path
                    </label>
                    <input
                      id="server-private-key-path"
                      type="text"
                      required={isKeyAuth}
                      value={formValues.private_key_path}
                      onChange={(event) =>
                        handleChange("private_key_path", event.target.value)
                      }
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={labelClassName} htmlFor="server-passphrase">
                      Passphrase
                    </label>
                    <input
                      id="server-passphrase"
                      type="password"
                      value={formValues.passphrase}
                      onChange={(event) =>
                        handleChange("passphrase", event.target.value)
                      }
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className={sectionClassName}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
                Advanced
              </h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className={labelClassName} htmlFor="server-group-id">
                    Group
                  </label>
                  <select
                    id="server-group-id"
                    value={formValues.group_id}
                    onChange={(event) =>
                      handleChange("group_id", event.target.value)
                    }
                    className={inputClassName}
                  >
                    <option value="">No group</option>
                    {groupOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className={labelClassName}
                    htmlFor="server-terminal-profile-id"
                  >
                    Terminal Profile
                  </label>
                  <select
                    id="server-terminal-profile-id"
                    value={formValues.terminal_profile_id}
                    onChange={(event) =>
                      handleChange("terminal_profile_id", event.target.value)
                    }
                    className={inputClassName}
                  >
                    <option value="">Use default profile</option>
                    {terminalProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} ({profile.platform})
                      </option>
                    ))}
                  </select>
                </div>
                {terminalProfilesQuery.isPending ? (
                  <p className="md:col-span-2 text-xs text-[hsl(var(--muted-foreground))]">
                    Loading terminal profiles...
                  </p>
                ) : null}
                <label className="inline-flex items-center gap-3 text-sm text-[hsl(var(--foreground))]">
                  <input
                    type="checkbox"
                    checked={formValues.keep_alive}
                    onChange={(event) =>
                      handleChange("keep_alive", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--input))]"
                  />
                  Keep Alive
                </label>
                <label className="inline-flex items-center gap-3 text-sm text-[hsl(var(--foreground))]">
                  <input
                    type="checkbox"
                    checked={formValues.compression}
                    onChange={(event) =>
                      handleChange("compression", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--input))]"
                  />
                  Compression
                </label>
                <label className="inline-flex items-center gap-3 text-sm text-[hsl(var(--foreground))]">
                  <input
                    type="checkbox"
                    checked={formValues.agent_forward}
                    onChange={(event) =>
                      handleChange("agent_forward", event.target.checked)
                    }
                    className="h-4 w-4 rounded border-[hsl(var(--input))]"
                  />
                  Agent Forwarding
                </label>
              </div>
            </section>
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[hsl(var(--border))] pt-4">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="rounded-lg border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] transition hover:bg-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-[hsl(var(--primary))] px-5 py-2 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : server ? "Save Changes" : "Create Server"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
