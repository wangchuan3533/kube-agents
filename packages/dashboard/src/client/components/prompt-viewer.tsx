import { useState } from 'react';

interface Message {
  role: string;
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
}

const ROLE_COLORS: Record<string, string> = {
  system: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  user: 'text-blue-400 bg-blue-900/20 border-blue-800',
  assistant: 'text-green-400 bg-green-900/20 border-green-800',
  tool: 'text-purple-400 bg-purple-900/20 border-purple-800',
};

interface PromptViewerProps {
  messages: Message[];
}

export function PromptViewer({ messages }: PromptViewerProps) {
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {messages.map((msg, i) => {
        const isExpanded = expandedIdx.has(i);
        const isLong = msg.content.length > 200;
        const preview = isLong && !isExpanded ? msg.content.slice(0, 200) + '...' : msg.content;
        const colors = ROLE_COLORS[msg.role] ?? 'text-gray-400 bg-gray-900/20 border-gray-800';

        return (
          <div key={i} className={`border rounded p-3 ${colors}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold uppercase">{msg.role}</span>
              {msg.toolCallId && (
                <span className="text-xs text-gray-500 font-mono">({msg.toolCallId.slice(0, 12)})</span>
              )}
            </div>
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-80 overflow-y-auto">
              {preview}
            </pre>
            {isLong && (
              <button
                onClick={() => toggle(i)}
                className="mt-1 text-xs text-blue-400 hover:text-blue-300"
              >
                {isExpanded ? 'Show less' : 'Show full message'}
              </button>
            )}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="text-xs text-gray-500 font-semibold">Tool Calls:</div>
                {msg.toolCalls.map((tc) => (
                  <div key={tc.id} className="text-xs font-mono bg-gray-950/50 rounded px-2 py-1">
                    <span className="text-purple-400">{tc.name}</span>
                    <span className="text-gray-500">(</span>
                    <span className="text-gray-400">{tc.arguments.length > 80 ? tc.arguments.slice(0, 80) + '...' : tc.arguments}</span>
                    <span className="text-gray-500">)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
