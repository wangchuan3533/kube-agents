import { useState, useEffect, useCallback } from 'react';

interface Route {
  page: 'overview' | 'agent-detail' | 'traces' | 'trace-detail';
  params: Record<string, string>;
}

function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');

  // Match: agents/:namespace/:name
  const agentMatch = path.match(/^agents\/([^/]+)\/([^/]+)$/);
  if (agentMatch) {
    return {
      page: 'agent-detail',
      params: { namespace: agentMatch[1], name: agentMatch[2] },
    };
  }

  // Match: traces/:runId
  const traceMatch = path.match(/^traces\/([^/]+)$/);
  if (traceMatch) {
    return {
      page: 'trace-detail',
      params: { runId: traceMatch[1] },
    };
  }

  // Match: traces
  if (path === 'traces') {
    return { page: 'traces', params: {} };
  }

  return { page: 'overview', params: {} };
}

export function useHashRouter() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return { ...route, navigate };
}
