import { useState } from "react";
import { useTerminalSessionStore } from "@/stores/terminalSessionStore";
import { useTerminalActions } from "@/hooks/useTerminalSession";
import { useServersQuery } from "@/hooks/useServers";
import { useServerStore } from "@/stores/serverStore";
import type { Server } from "@/lib/types";
import { CollapsedSidebar } from "./CollapsedSidebar";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./TerminalView";

interface TerminalPageProps {
  onOpenSettings: () => void;
}

export function TerminalPage({ onOpenSettings }: TerminalPageProps) {
  useServersQuery(); // keep server list fresh
  const servers = useServerStore((state) => state.servers);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const handleSelectServer = async (server: Server) => {
    setIsSidebarOpen(false);
    await connect(server.id, server.name);
  };

  const handleCloseTab = async (sessionId: string) => {
    await disconnect(sessionId);
  };

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-[#0d1117] text-[#e6edf3]">
      {/* 42px collapsed sidebar */}
      <CollapsedSidebar
        servers={servers}
        onSelectServer={handleSelectServer}
        onOpenSettings={onOpenSettings}
        isPopoverOpen={isSidebarOpen}
        onTogglePopover={() => setIsSidebarOpen((v) => !v)}
      />

      {/* Terminal area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TerminalTabs
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectTab={setActiveSession}
          onCloseTab={handleCloseTab}
          onAddTab={() => setIsSidebarOpen((v) => !v)}
          onReorderTab={reorderSessions}
        />

        {/* Stack all TerminalViews; only active is visible */}
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
                className="absolute inset-0"
                style={{
                  visibility: session.id === activeSessionId ? "visible" : "hidden",
                  pointerEvents: session.id === activeSessionId ? "auto" : "none",
                }}
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
    </div>
  );
}
