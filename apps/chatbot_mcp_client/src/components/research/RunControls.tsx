"use client";

import { Activity, Database, GitBranch, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/lib/hooks/use-chat-store";
import { buildDashboardRunVariant } from "@/lib/research-context";

interface RunControlsProps {
  className?: string;
  compact?: boolean;
}

export function RunControls({ className, compact = false }: RunControlsProps) {
  const { settings, setSettings } = useChatStore();
  const isDynamic = settings.skillSelectionMode === "dynamic";
  const { variantId } = buildDashboardRunVariant({
    ragEnabled: settings.ragEnabled,
    skillSelectionMode: settings.skillSelectionMode,
  });

  return (
    <section
      className={cn(
        "rounded-2xl border border-outline-variant/10 bg-surface-container/40 p-4",
        compact ? "space-y-4" : "space-y-5",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary/80" />
          <h2 className={cn("font-headline font-bold text-primary", compact ? "text-sm" : "text-base")}>
            Run Controls
          </h2>
        </div>
        <div className="rounded-full border border-outline-variant/10 bg-surface-container-lowest/40 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          {variantId}
        </div>
      </div>

      <div className="space-y-2">
        <label className="ml-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
          Experiment ID
        </label>
        <Input
          value={settings.experimentId}
          onChange={(event) => setSettings({ experimentId: event.target.value })}
          className="h-10 rounded-xl border-outline-variant/10 bg-surface-container-lowest/50 font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={isDynamic ? "outline" : "default"}
          className="h-10 rounded-xl gap-2"
          onClick={() => setSettings({ skillSelectionMode: "static" })}
        >
          <GitBranch className="h-3.5 w-3.5" />
          Static
        </Button>
        <Button
          type="button"
          variant={isDynamic ? "default" : "outline"}
          className="h-10 rounded-xl gap-2"
          onClick={() => setSettings({ skillSelectionMode: "dynamic" })}
        >
          <Activity className="h-3.5 w-3.5" />
          Dynamic
        </Button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-secondary" />
          <div>
            <p className="text-xs font-bold text-on-surface">RAG</p>
            <p className="text-[10px] text-on-surface-variant">
              {settings.ragEnabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        </div>
        <Switch
          checked={settings.ragEnabled}
          onCheckedChange={(checked) => setSettings({ ragEnabled: checked })}
        />
      </div>
    </section>
  );
}
