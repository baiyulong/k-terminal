import { useEffect, useRef } from "react";
import type { Server } from "@/lib/types";

interface ServerPopoverProps {
  servers: Server[];
  onSelectServer: (server: Server) => void;
  onClose: () => void;
  onAddServer: () => void;
}

export function ServerPopover({
  servers,
  onSelectServer,
  onClose,
  onAddServer,
}: ServerPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-12 top-0 z-50 flex h-full w-72 flex-col border-r border-[#30363d] bg-[#0d1117] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[#30363d] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#8b949e]">
          Servers
        </p>
        <button
          type="button"
          onClick={() => { onAddServer(); onClose(); }}
          title="Add new server"
          className="flex h-6 w-6 items-center justify-center rounded text-lg text-[#8b949e] hover:bg-[#161b22] hover:text-[#e6edf3]"
        >
          ＋
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {servers.length === 0 ? (
          <p className="px-4 py-3 text-xs text-[#6e7681]">
            No servers configured.
          </p>
        ) : (
          servers.map((server) => (
            <button
              key={server.id}
              type="button"
              onClick={() => {
                onSelectServer(server);
                onClose();
              }}
              className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-[#161b22]"
            >
              <span className="text-sm font-medium text-[#c9d1d9]">
                {server.name}
              </span>
              <span className="text-xs text-[#6e7681]">
                {server.username}@{server.host}:{server.port}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
