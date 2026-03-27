import { useState } from 'react';
import type { EmailMessage } from '../types.js';

interface MessageCardProps {
  message: EmailMessage;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

export function MessageCard({ message }: MessageCardProps) {
  const [expanded, setExpanded] = useState(false);

  const bodyLines = message.body.split('\n');
  const isLong = bodyLines.length > 4 || message.body.length > 300;
  const preview = isLong && !expanded
    ? bodyLines.slice(0, 4).join('\n') + (bodyLines.length > 4 ? '\n...' : '')
    : message.body;

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/50 p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-white truncate">{message.from}</span>
            <span className="text-gray-600">→</span>
            <span className="text-gray-400 truncate">{message.to.join(', ')}</span>
          </div>
          <div className="text-sm font-medium text-gray-200 mt-1">{message.subject}</div>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap ml-4">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {message.inReplyTo && (
        <div className="text-xs text-gray-500 mb-2">
          In reply to: {message.inReplyTo.slice(0, 8)}...
        </div>
      )}

      <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-950/50 rounded p-3 max-h-96 overflow-y-auto">
        {preview}
      </pre>

      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-blue-400 hover:text-blue-300"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {message.attachments && message.attachments.length > 0 && (
        <div className="mt-2 flex gap-2">
          {message.attachments.map((att, i) => (
            <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
              {att.filename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
