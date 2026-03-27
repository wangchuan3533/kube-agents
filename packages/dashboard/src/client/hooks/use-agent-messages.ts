import { useState, useEffect, useCallback } from 'react';
import type { EmailMessage, MessageListResponse } from '../types.js';

export function useAgentMessages(namespace: string, name: string) {
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMessages = useCallback(async (limit = 50) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agents/${namespace}/${name}/messages?limit=${limit}`);
      if (res.status === 503) {
        setError('NATS not available — message inspection is disabled');
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: MessageListResponse = await res.json();
      setMessages(json.messages);
      setHasMore(json.hasMore);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [namespace, name]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const refresh = useCallback(() => fetchMessages(), [fetchMessages]);

  const loadMore = useCallback(() => {
    fetchMessages(messages.length + 50);
  }, [fetchMessages, messages.length]);

  return { messages, hasMore, error, loading, refresh, loadMore };
}
