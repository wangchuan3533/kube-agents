import { useState } from 'react';
import type { RunData } from '../types.js';
import { PromptViewer } from './prompt-viewer.js';
import { JsonViewer } from './json-viewer.js';

function formatLatency(ms: number | undefined): string {
  if (ms === undefined) return '...';
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const TYPE_COLORS: Record<string, { dot: string; text: string; border: string }> = {
  llm: { dot: 'bg-blue-400', text: 'text-blue-300', border: 'border-blue-800/50' },
  tool: { dot: 'bg-green-400', text: 'text-green-300', border: 'border-green-800/50' },
  chain: { dot: 'bg-yellow-400', text: 'text-yellow-300', border: 'border-yellow-800/50' },
  agent: { dot: 'bg-purple-400', text: 'text-purple-300', border: 'border-purple-800/50' },
  retriever: { dot: 'bg-cyan-400', text: 'text-cyan-300', border: 'border-cyan-800/50' },
};

interface RunCardProps {
  run: RunData;
  depth: number;
  childRuns: RunData[];
  allRuns: RunData[];
}

function RunCard({ run, depth, childRuns, allRuns }: RunCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = TYPE_COLORS[run.runType] ?? { dot: 'bg-gray-400', text: 'text-gray-300', border: 'border-gray-800/50' };
  const isError = run.status === 'error';
  const borderColor = isError ? 'border-red-800/50' : colors.border;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div className={`border rounded-lg bg-gray-900/50 overflow-hidden ${borderColor}`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${isError ? 'bg-red-400' : colors.dot}`} />
            <span className={`text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 uppercase font-mono`}>
              {run.runType}
            </span>
            <span className={`text-sm font-medium ${isError ? 'text-red-300' : colors.text}`}>
              {run.name}
            </span>
            {run.model && (
              <span className="text-xs text-gray-500 font-mono">{run.model}</span>
            )}
            {run.finishReason && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${run.finishReason === 'tool_calls' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'}`}>
                {run.finishReason}
              </span>
            )}
            {isError && (
              <span className="text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">error</span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {run.totalTokens != null && run.totalTokens > 0 && (
              <span className="text-purple-400">{formatTokens(run.totalTokens)} tok</span>
            )}
            <span>{formatLatency(run.latencyMs)}</span>
            <span className="text-gray-600">{expanded ? '[-]' : '[+]'}</span>
          </div>
        </button>

        {expanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
            {/* Token breakdown for LLM runs */}
            {run.runType === 'llm' && run.promptTokens != null && (
              <div className="flex gap-4 pt-3 text-xs text-gray-400">
                <span>Prompt: <span className="text-gray-300">{formatTokens(run.promptTokens)}</span></span>
                <span>Completion: <span className="text-gray-300">{formatTokens(run.completionTokens ?? 0)}</span></span>
                {run.temperature != null && <span>Temp: <span className="text-gray-300">{run.temperature}</span></span>}
              </div>
            )}

            {/* Prompt messages for LLM runs */}
            {run.promptMessages && run.promptMessages.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Prompt ({run.promptMessages.length} messages)
                </h4>
                <PromptViewer messages={run.promptMessages} />
              </div>
            )}

            {/* Completion for LLM runs */}
            {run.completion != null && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Completion</h4>
                <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-950/50 rounded p-3 max-h-80 overflow-y-auto">
                  {run.completion || '(empty)'}
                </pre>
              </div>
            )}

            {/* Tool calls requested */}
            {run.toolCalls.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Tool Calls Requested ({run.toolCalls.length})
                </h4>
                <div className="space-y-2">
                  {run.toolCalls.map((tc) => (
                    <div key={tc.id} className="bg-gray-950/50 rounded p-3">
                      <div className="text-xs text-purple-400 font-medium mb-1">{tc.name}</div>
                      <JsonViewer data={tc.arguments} maxHeight="10rem" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tool inputs/outputs */}
            {run.runType === 'tool' && run.inputs && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Arguments</h4>
                <JsonViewer data={JSON.stringify(run.inputs)} />
              </div>
            )}
            {run.runType === 'tool' && run.outputs && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Result</h4>
                <pre className={`text-xs whitespace-pre-wrap font-mono rounded p-3 max-h-60 overflow-y-auto ${isError ? 'text-red-300 bg-red-950/30' : 'text-gray-300 bg-gray-950/50'}`}>
                  {JSON.stringify(run.outputs, null, 2)}
                </pre>
              </div>
            )}

            {/* Error */}
            {run.error && (
              <div>
                <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">Error</h4>
                <pre className="text-xs text-red-300 whitespace-pre-wrap font-mono bg-red-950/30 rounded p-3">
                  {run.error}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {Object.keys(run.metadata).length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Metadata</h4>
                <JsonViewer data={JSON.stringify(run.metadata)} maxHeight="8rem" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Child runs */}
      {childRuns.length > 0 && (
        <div className="mt-2 space-y-2">
          {childRuns.map((child) => {
            const grandChildren = allRuns.filter((r) => r.parentRunId === child.id);
            return (
              <RunCard
                key={child.id}
                run={child}
                depth={depth + 1}
                childRuns={grandChildren}
                allRuns={allRuns}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

interface RunTimelineProps {
  runs: RunData[];
}

export function RunTimeline({ runs }: RunTimelineProps) {
  if (runs.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center">
        No runs recorded yet.
      </div>
    );
  }

  // Sort by startedAt
  const sorted = [...runs].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  // Find root runs (no parent)
  const rootRuns = sorted.filter((r) => !r.parentRunId);

  // If no explicit hierarchy, show all as roots
  const displayRoots = rootRuns.length > 0 ? rootRuns : sorted;

  return (
    <div className="space-y-2">
      {displayRoots.map((run) => {
        const children = sorted.filter((r) => r.parentRunId === run.id);
        return (
          <RunCard
            key={run.id}
            run={run}
            depth={0}
            childRuns={children}
            allRuns={sorted}
          />
        );
      })}
    </div>
  );
}

// Keep backward compat export
export { RunTimeline as SpanTimeline };
