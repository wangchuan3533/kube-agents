import { useHashRouter } from './hooks/use-hash-router.js';
import { OverviewPage } from './pages/overview-page.js';
import { AgentDetailPage } from './pages/agent-detail-page.js';
import { TracesPage } from './pages/traces-page.js';
import { TraceDetailPage } from './pages/trace-detail-page.js';

export function App() {
  const { page, params } = useHashRouter();

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {page === 'agent-detail' ? (
        <AgentDetailPage namespace={params['namespace']} name={params['name']} />
      ) : page === 'traces' ? (
        <TracesPage />
      ) : page === 'trace-detail' ? (
        <TraceDetailPage runId={params['runId']} />
      ) : (
        <OverviewPage />
      )}
    </div>
  );
}
