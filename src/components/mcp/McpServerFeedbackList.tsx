"use client";

import * as React from 'react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { fetchMcpServers, submitMcpServerFeedback, fetchMcpClaudeConfig, extractMcpRemoteUrl, type McpServerApi } from '@/lib/mcp-server-api';
import { ThumbsUp, ThumbsDown, RefreshCw, AlertCircle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/lib/hooks/use-chat-store';
import { BACKEND_API } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';

interface McpServerFeedbackListProps {
  className?: string;
}

export function McpServerFeedbackList({ className }: McpServerFeedbackListProps) {
  const [servers, setServers] = useState<McpServerApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState<Set<string>>(new Set());
  const [activating, setActivating] = useState<Set<string>>(new Set());
  const { settings, setSettings } = useChatStore();
  const { toast } = useToast();

  const loadServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMcpServers();
      setServers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  // Auto-refresh when any server is still building
  useEffect(() => {
    const hasActiveBuild = servers.some(s => s.status === 'building' || s.status === 'created' || s.status === 'started');
    if (!hasActiveBuild) return;

    const interval = setInterval(loadServers, 5000);
    return () => clearInterval(interval);
  }, [servers]);

  const handleFeedback = async (serverId: string, type: 'like' | 'dislike') => {
    // Optimistic update
    setServers(prev =>
      prev.map(server => {
        if (server.serverId !== serverId) return server;
        const currentLike = server.likeCount ?? 0;
        const currentDislike = server.dislikeCount ?? 0;
        return {
          ...server,
          likeCount: type === 'like' ? currentLike + 1 : currentLike,
          dislikeCount: type === 'dislike' ? currentDislike + 1 : currentDislike,
        };
      })
    );

    setFeedbackSubmitting(prev => new Set(prev).add(serverId));

    try {
      await submitMcpServerFeedback(serverId, type);
      // Success - keep optimistic update
    } catch (err) {
      // Revert on error
      setServers(prev =>
        prev.map(server => {
          if (server.serverId !== serverId) return server;
          const currentLike = server.likeCount ?? 0;
          const currentDislike = server.dislikeCount ?? 0;
          return {
            ...server,
            likeCount: type === 'like' ? currentLike - 1 : currentLike,
            dislikeCount: type === 'dislike' ? currentDislike - 1 : currentDislike,
          };
        })
      );
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally {
      setFeedbackSubmitting(prev => {
        const next = new Set(prev);
        next.delete(serverId);
        return next;
      });
    }
  };

  const handleActivate = async (server: McpServerApi) => {
    if (server.status !== 'running') {
      toast({
        title: 'Server Not Ready',
        description: 'Wait until the generated MCP server is running before activating it.',
        variant: 'destructive',
      });
      return;
    }

    setActivating(prev => new Set(prev).add(server.serverId));
    try {
      const config = await fetchMcpClaudeConfig(server.serverId);
      const url = extractMcpRemoteUrl(config);
      if (!url) throw new Error('Generated server config did not include an MCP URL.');

      if (settings.mcpServers.some(s => s.url === url)) {
        toast({
          title: 'Already Active',
          description: 'This generated MCP server is already in your active list.',
        });
        return;
      }

      const metadataResponse = await fetch(BACKEND_API.mcpMetadata(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const metadata = await metadataResponse.json();
      if (!metadataResponse.ok || metadata.status === 'error') {
        throw new Error(metadata.detail || 'The generated MCP server could not be initialized.');
      }

      setSettings({
        mcpServers: [
          ...settings.mcpServers,
          {
            name: metadata.name || server.serverId,
            url,
            serverId: server.serverId,
            tools: metadata.tools || [],
          },
        ],
      });
      toast({
        title: 'MCP Server Activated',
        description: `${metadata.name || server.serverId} is now available to chat.`,
      });
    } catch (err) {
      toast({
        title: 'Activation Failed',
        description: err instanceof Error ? err.message : 'Unable to activate generated MCP server.',
        variant: 'destructive',
      });
    } finally {
      setActivating(prev => {
        const next = new Set(prev);
        next.delete(server.serverId);
        return next;
      });
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-emerald-400';
      case 'created':
      case 'started':
        return 'text-blue-400';
      case 'building':
        return 'text-amber-400';
      case 'error':
      case 'deleted':
        return 'text-red-400';
      default:
        return 'text-on-surface-variant';
    }
  };

  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <RefreshCw className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-sm text-on-surface-variant">Loading MCP servers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("p-4 rounded-lg border border-red-500/20 bg-red-500/5", className)}>
        <div className="flex items-center gap-2 text-red-400 mb-2">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">Error</span>
        </div>
        <p className="text-xs text-on-surface-variant mb-3">{error}</p>
        <Button size="sm" variant="outline" onClick={loadServers} className="text-xs">
          <RefreshCw className="w-3 h-3 mr-1" />
          Retry
        </Button>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className={cn("text-center py-8 text-on-surface-variant", className)}>
        <p className="text-sm">No active generated MCP servers.</p>
        <p className="text-xs opacity-70 mt-1">Running or in-progress servers will appear here.</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-on-surface font-headline">
          Generated MCP Servers ({servers.length})
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={loadServers}
          disabled={loading}
          className="h-7 px-2 text-xs"
        >
          <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
        </Button>
      </div>

      <div className="space-y-2">
        {servers.map(server => (
          <div
            key={server.serverId}
            className="group rounded-lg border border-outline-variant/10 bg-surface-container-low/20 p-3 hover:bg-surface-container-low/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-primary/80 truncate">
                    {server.serverId}
                  </span>
                  <span className={cn("text-[10px] font-bold uppercase", getStatusColor(server.status))}>
                    {server.status}
                  </span>
                </div>

                <div className="text-[10px] text-on-surface-variant/70 mb-2">
                  Created: {formatDate(server.createdAt)}
                </div>

                {server.publicUrl && (
                  <div className="text-[10px] font-mono text-on-surface/60 truncate">
                    {server.publicUrl}
                  </div>
                )}
              </div>

              {/* Feedback buttons - always visible but subtle */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleActivate(server)}
                  disabled={activating.has(server.serverId) || server.status !== 'running'}
                  className="h-8 px-2 text-xs gap-1.5 opacity-60 hover:opacity-100"
                  title="Activate generated MCP server"
                >
                  {activating.has(server.serverId) ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Link2 className="w-3.5 h-3.5" />
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleFeedback(server.serverId, 'like')}
                  disabled={feedbackSubmitting.has(server.serverId)}
                  className={cn(
                    "h-8 px-2 text-xs gap-1.5",
                    "opacity-60 hover:opacity-100",
                    (server.likeCount ?? 0) > 0 && "text-emerald-500 opacity-100"
                  )}
                  title="Like this MCP server"
                >
                  <ThumbsUp className={cn("w-3.5 h-3.5", (server.likeCount ?? 0) > 0 && "fill-current")} />
                  <span className="font-mono">{server.likeCount ?? 0}</span>
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleFeedback(server.serverId, 'dislike')}
                  disabled={feedbackSubmitting.has(server.serverId)}
                  className={cn(
                    "h-8 px-2 text-xs gap-1.5",
                    "opacity-60 hover:opacity-100",
                    (server.dislikeCount ?? 0) > 0 && "text-red-500 opacity-100"
                  )}
                  title="Dislike this MCP server"
                >
                  <ThumbsDown className={cn("w-3.5 h-3.5", (server.dislikeCount ?? 0) > 0 && "fill-current")} />
                  <span className="font-mono">{server.dislikeCount ?? 0}</span>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

McpServerFeedbackList.displayName = 'McpServerFeedbackList';
