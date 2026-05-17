import type { TerminalSession } from "@/stores/terminalSessionStore";

interface TerminalTabsProps {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  onSelectTab: (sessionId: string) => void;
  onCloseTab: (sessionId: string) => void;
  onAddTab: () => void;
}

const statusDot: Record<string, string> = {
  connecting: "bg-yellow-400",
  connected: "bg-emerald-400",
  disconnected: "bg-red-500",
  error: "bg-red-500",
};

export function TerminalTabs({
  sessions,
  activeSessionId,
  onSelectTab,
  onCloseTab,
  onAddTab,
}: TerminalTabsProps) {
  return (
    <div className="flex h-9 items-end gap-0 overflow-x-auto border-b border-[#30363d] bg-[#161b22] px-2">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelectTab(session.id)}
            className={[
              "flex shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 pb-1 pt-1.5 text-xs font-medium transition-colors",
              isActive
                ? "border-[#30363d] bg-[#0d1117] text-[#e6edf3]"
                : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]",
            ].join(" ")}
          >
            <span
              className={`h-2 w-2 rounded-full ${statusDot[session.status] ?? "bg-gray-500"}`}
            />
            <span className="max-w-[140px] truncate font-mono">
              {session.serverName}
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(session.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  onCloseTab(session.id);
                }
              }}
              className="ml-1 rounded px-0.5 text-[#6e7681] hover:text-[#e6edf3]"
            >
              ✕
            </span>
          </button>
        );
      })}

      {/* Add tab button */}
      <button
        type="button"
        onClick={onAddTab}
        aria-label="New connection"
        className="ml-1 flex h-7 w-7 items-center justify-center rounded text-lg text-[#6e7681] hover:text-[#e6edf3]"
      >
        +
      </button>
    </div>
  );
}
