import type { Server } from "@/lib/types";
import { ServerPopover } from "./ServerPopover";

interface CollapsedSidebarProps {
  servers: Server[];
  onSelectServer: (server: Server) => void;
  onOpenSettings: () => void;
  isPopoverOpen: boolean;
  onTogglePopover: () => void;
}

export function CollapsedSidebar({
  servers,
  onSelectServer,
  onOpenSettings,
  isPopoverOpen,
  onTogglePopover,
}: CollapsedSidebarProps) {

  return (
    <div className="relative flex h-full w-[42px] flex-col items-center border-r border-[#30363d] bg-[#161b22] py-3">
      {/* Server list toggle */}
      <button
        type="button"
        title="Server list"
        onClick={() => onTogglePopover()}
        className={[
          "flex h-8 w-8 items-center justify-center rounded text-lg transition-colors",
          isPopoverOpen
            ? "bg-[#1f2937] text-[#58a6ff]"
            : "text-[#8b949e] hover:text-[#e6edf3]",
        ].join(" ")}
      >
        ⊞
      </button>

      <div className="flex-1" />

      {/* Settings */}
      <button
        type="button"
        title="Settings"
        onClick={onOpenSettings}
        className="flex h-8 w-8 items-center justify-center rounded text-[#8b949e] hover:text-[#e6edf3]"
      >
        ⚙
      </button>

      {/* Server popover overlay */}
      {isPopoverOpen && (
        <ServerPopover
          servers={servers}
          onSelectServer={onSelectServer}
          onClose={() => onTogglePopover()}
        />
      )}
    </div>
  );
}
