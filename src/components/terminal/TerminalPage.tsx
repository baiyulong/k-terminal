import { useState, useCallback } from "react";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useTerminalActions } from "@/hooks/useTerminalSession";
import { useServersQuery, useCreateServerMutation } from "@/hooks/useServers";
import { useServerStore } from "@/stores/serverStore";
import type { Server } from "@/lib/types";
import { CollapsedSidebar } from "./CollapsedSidebar";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./TerminalView";
import {
  ServerForm,
  type ServerFormValues,
} from "@/components/server/ServerForm";

interface TerminalPageProps {
  onOpenSettings: () => void;
}

const optionalValue = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function TerminalPage({ onOpenSettings }: TerminalPageProps) {
  useServersQuery(); // keep server list fresh
  const servers = useServerStore((state) => state.servers);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const sessions = useTerminalSessionStore((state) => state.sessions);
  const activeSessionId = useTerminalSessionStore(
    (state) => state.activeSessionId,
  );
  const setActiveSession = useTerminalSessionStore(
    (state) => state.setActiveSession,
  );
  const reorderSessions = useTerminalSessionStore(
    (state) => state.reorderSessions,
  );

  const { connect, disconnect } = useTerminalActions();
  const createServerMutation = useCreateServerMutation();

  const handleSelectServer = async (server: Server) => {
    setIsSidebarOpen(false);
    await connect(server.id, server.name);
  };

  const handleCloseTab = async (sessionId: string) => {
    await disconnect(sessionId);
  };

  const handleFormSubmit = useCallback(async (values: ServerFormValues) => {
    await createServerMutation.mutateAsync({
      name: values.name.trim(),
      host: values.host.trim(),
      port: values.port || 22,
      username: values.username.trim(),
      auth_type: values.auth_type,
      password: values.auth_type === "password" ? optionalValue(values.password) : undefined,
      private_key_path: values.auth_type === "key" ? optionalValue(values.private_key_path) : undefined,
      passphrase: values.auth_type === "key" ? optionalValue(values.passphrase) : undefined,
      group_id: optionalValue(values.group_id),
      description: optionalValue(values.description),
      terminal_profile_id: optionalValue(values.terminal_profile_id),
      startup_command: optionalValue(values.startup_command),
      encoding: values.encoding.trim() || "utf8",
      tags: optionalValue(values.tags),
      jump_host: optionalValue(values.jump_host),
      keep_alive: values.keep_alive,
      compression: values.compression,
      agent_forward: values.agent_forward,
      port_forwards: optionalValue(values.port_forwards),
    });
    setIsFormOpen(false);
  }, [createServerMutation]);

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      {/* 42px collapsed sidebar */}
      <CollapsedSidebar
        servers={servers}
        onSelectServer={handleSelectServer}
        onOpenSettings={onOpenSettings}
        onAddServer={() => setIsFormOpen(true)}
        isPopoverOpen={isSidebarOpen}
        onTogglePopover={() => setIsSidebarOpen((v) => !v)}
      />

      {/* Terminal area — min-w-0 prevents flex child from exceeding allocated width
          (flex default min-width:auto lets content dictate width → xterm measures 100vw) */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TerminalTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectTab={setActiveSession}
          onCloseTab={handleCloseTab}
          onAddTab={() => setIsSidebarOpen((v) => !v)}
          onReorderTab={reorderSessions}
        />

        {/* Stack all TerminalViews; only active is visible.
            Use display:none (not visibility:hidden) so native scrollbars
            from inactive tabs don't bleed through in WebView2. xterm.js
            buffers writes while hidden; the isActive effect re-fits on show. */}
        <div className="relative flex-1 overflow-hidden">
          {sessions.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-[#6e7681]">
                Click ⊞ to open a server connection
              </p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`absolute inset-0${session.id === activeSessionId ? "" : " hidden"}`}
              >
                <TerminalView
                  sessionId={session.id}
                  isActive={session.id === activeSessionId}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <ServerForm
        open={isFormOpen}
        server={null}
        isSubmitting={createServerMutation.isPending}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}
