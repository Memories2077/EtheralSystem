"use client";

import Link from "next/link";
import { ArrowRight, FlaskConical, Server, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { McpServerFeedbackList } from "@/components/mcp/McpServerFeedbackList";
import { RunControls } from "@/components/research/RunControls";
import { useChatStore } from "@/lib/hooks/use-chat-store";
import { buildDashboardRunVariant } from "@/lib/research-context";

export default function DashboardPage() {
  const { settings } = useChatStore();
  const { variantId } = buildDashboardRunVariant({
    ragEnabled: settings.ragEnabled,
    skillSelectionMode: settings.skillSelectionMode,
  });

  return (
    <main className="h-full overflow-y-auto px-4 py-8 md:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="flex flex-col gap-4 border-b border-outline-variant/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary/80" />
              <Badge variant="outline" className="border-outline-variant/20 text-on-surface-variant">
                {settings.experimentId}
              </Badge>
            </div>
            <h1 className="font-headline text-3xl font-bold tracking-tight text-primary">
              Benchmark Dashboard
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-primary text-on-primary">{variantId}</Badge>
              <Badge variant="outline" className="border-outline-variant/20">
                {settings.provider}
              </Badge>
              <Badge variant="outline" className="border-outline-variant/20">
                {settings.model}
              </Badge>
            </div>
          </div>
          <Button asChild className="h-10 rounded-xl">
            <Link href="/chat">
              Open Chat
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-4">
            <RunControls />

            <section className="rounded-2xl border border-outline-variant/10 bg-surface-container/30 p-4">
              <div className="mb-4 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-secondary" />
                <h2 className="font-headline text-sm font-bold text-primary">
                  Active MCP Tools
                </h2>
              </div>
              <div className="space-y-2">
                {settings.mcpServers.map((server) => (
                  <div
                    key={server.url}
                    className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest/30 p-3"
                  >
                    <div className="truncate text-xs font-bold text-on-surface">
                      {server.name || server.serverId || "MCP Server"}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-on-surface-variant">
                      {server.url}
                    </div>
                    <div className="mt-2 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                      {server.tools?.length || 0} tools
                    </div>
                  </div>
                ))}
                {settings.mcpServers.length === 0 && (
                  <div className="rounded-xl border border-dashed border-outline-variant/20 p-5 text-center text-xs text-on-surface-variant">
                    No active MCP tools
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-outline-variant/10 bg-surface-container/30 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-secondary" />
                <h2 className="font-headline text-sm font-bold text-primary">
                  Generated Server Runs
                </h2>
              </div>
            </div>
            <McpServerFeedbackList />
          </section>
        </div>
      </div>
    </main>
  );
}
