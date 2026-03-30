import { useState, useEffect, useCallback } from 'react';

type Page =
  | 'overview'
  | 'agent-detail'
  | 'projects'
  | 'project-detail'
  | 'traces'
  | 'trace-detail'
  | 'datasets'
  | 'dataset-detail'
  | 'experiments'
  | 'experiment-detail'
  | 'monitoring';

interface Route {
  page: Page;
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

  // Match: projects/:name
  const projectMatch = path.match(/^projects\/([^/]+)$/);
  if (projectMatch) {
    return { page: 'project-detail', params: { projectName: projectMatch[1] } };
  }

  // Match: projects
  if (path === 'projects') {
    return { page: 'projects', params: {} };
  }

  // Match: datasets/:id
  const datasetMatch = path.match(/^datasets\/([^/]+)$/);
  if (datasetMatch) {
    return { page: 'dataset-detail', params: { datasetId: datasetMatch[1] } };
  }

  // Match: datasets
  if (path === 'datasets') {
    return { page: 'datasets', params: {} };
  }

  // Match: experiments/:id
  const experimentMatch = path.match(/^experiments\/([^/]+)$/);
  if (experimentMatch) {
    return { page: 'experiment-detail', params: { experimentId: experimentMatch[1] } };
  }

  // Match: experiments
  if (path === 'experiments') {
    return { page: 'experiments', params: {} };
  }

  // Match: monitoring
  if (path === 'monitoring') {
    return { page: 'monitoring', params: {} };
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
