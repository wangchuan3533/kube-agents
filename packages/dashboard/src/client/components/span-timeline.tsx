import { useState } from 'react';
import type { TraceSpan } from '../types.js';
import { PromptViewer } from './prompt-viewer.js';
import { JsonViewer } from './json-viewer.js';

function formatLatency(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface SpanCardProps {
  span: TraceSpan;
}

function LLMSpanCard({ span }: SpanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const llm = span.llm!;

  return (
    <div className="border border-blue-800/50 rounded-lg bg-gray-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-blue-400" />
          <span className="text-sm font-medium text-blue-300">
            LLM Call #{llm.iteration}
          </span>
          <span className="text-xs text-gray-500 font-mono">{llm.model}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${llm.finishReason === 'tool_calls' ? 'bg-purple-900/50 text-purple-300' : 'bg-gray-800 text-gray-400'}`}>
            {llm.finishReason}
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span className="text-purple-400">{formatTokens(llm.usage.totalTokens)} tok</span>
          <span>{formatLatency(span.latencyMs)}</span>
          <span className="text-gray-600">{expanded ? '[-]' : '[+]'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
          {/* Token breakdown */}
          <div className="flex gap-4 pt-3 text-xs text-gray-400">
            <span>Prompt: <span className="text-gray-300">{formatTokens(llm.usage.promptTokens)}</span></span>
            <span>Completion: <span className="text-gray-300">{formatTokens(llm.usage.completionTokens)}</span></span>
            {llm.temperature !== undefined && <span>Temp: <span className="text-gray-300">{llm.temperature}</span></span>}
          </div>

          {/* Prompt messages */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Prompt ({llm.messages.length} messages)</h4>
            <PromptViewer messages={llm.messages} />
          </div>

          {/* Completion */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Completion</h4>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono bg-gray-950/50 rounded p-3 max-h-80 overflow-y-auto">
              {llm.completion || '(empty)'}
            </pre>
          </div>

          {/* Tool calls requested */}
          {llm.toolCalls.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tool Calls Requested ({llm.toolCalls.length})</h4>
              <div className="space-y-2">
                {llm.toolCalls.map((tc) => (
                  <div key={tc.id} className="bg-gray-950/50 rounded p-3">
                    <div className="text-xs text-purple-400 font-medium mb-1">{tc.name}</div>
                    <JsonViewer data={tc.arguments} maxHeight="10rem" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToolSpanCard({ span }: SpanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tool = span.tool!;

  return (
    <div className={`border rounded-lg bg-gray-900/50 overflow-hidden ${tool.isError ? 'border-red-800/50' : 'border-green-800/50'}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${tool.isError ? 'bg-red-400' : 'bg-green-400'}`} />
          <span className={`text-sm font-medium ${tool.isError ? 'text-red-300' : 'text-green-300'}`}>
            {tool.name}
          </span>
          {tool.isError && (
            <span className="text-xs bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded">error</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>{formatLatency(span.latencyMs)}</span>
          <span className="text-gray-600">{expanded ? '[-]' : '[+]'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800">
          <div className="pt-3">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Arguments</h4>
            <JsonViewer data={tool.arguments} />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Result</h4>
            <pre className={`text-xs whitespace-pre-wrap font-mono rounded p-3 max-h-60 overflow-y-auto ${tool.isError ? 'text-red-300 bg-red-950/30' : 'text-gray-300 bg-gray-950/50'}`}>
              {tool.result || '(empty)'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

interface SpanTimelineProps {
  spans: TraceSpan[];
}

export function SpanTimeline({ spans }: SpanTimelineProps) {
  if (spans.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-8 text-center">
        No spans recorded yet.
      </div>
    );
  }

  // Sort by startedAt
  const sorted = [...spans].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );

  return (
    <div className="space-y-2">
      {sorted.map((span) => (
        span.type === 'llm_call'
          ? <LLMSpanCard key={span.id} span={span} />
          : <ToolSpanCard key={span.id} span={span} />
      ))}
    </div>
  );
}
