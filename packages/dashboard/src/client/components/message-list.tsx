import type { EmailMessage } from '../types.js';
import { MessageCard } from './message-card.js';

interface MessageListProps {
  messages: EmailMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function MessageList({ messages, loading, error, hasMore, onLoadMore, onRefresh }: MessageListProps) {
  if (error) {
    return (
      <div className="p-4 bg-yellow-900/20 border border-yellow-800 rounded text-yellow-300 text-sm">
        {error}
      </div>
    );
  }

  if (loading && messages.length === 0) {
    return <div className="text-gray-500 text-sm py-8 text-center">Loading messages...</div>;
  }

  if (messages.length === 0) {
    return <div className="text-gray-500 text-sm py-8 text-center">No messages found</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        <button
          onClick={onRefresh}
          className="text-xs px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {messages.map((msg) => (
          <MessageCard key={msg.id} message={msg} />
        ))}
      </div>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm border border-gray-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
