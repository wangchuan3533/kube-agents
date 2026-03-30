import { useHashRouter } from './hooks/use-hash-router.js';
import { OverviewPage } from './pages/overview-page.js';
import { AgentDetailPage } from './pages/agent-detail-page.js';
import { ProjectsPage } from './pages/projects-page.js';
import { ProjectDetailPage } from './pages/project-detail-page.js';
import { TracesPage } from './pages/traces-page.js';
import { TraceDetailPage } from './pages/trace-detail-page.js';
import { DatasetsPage } from './pages/datasets-page.js';
import { DatasetDetailPage } from './pages/dataset-detail-page.js';
import { ExperimentsPage } from './pages/experiments-page.js';
import { ExperimentDetailPage } from './pages/experiment-detail-page.js';
import { MonitoringPage } from './pages/monitoring-page.js';

interface NavSection {
  label: string;
  items: Array<{ label: string; hash: string; pages: string[] }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Observability',
    items: [
      { label: 'Overview', hash: '', pages: ['overview'] },
      { label: 'Projects', hash: 'projects', pages: ['projects', 'project-detail'] },
      { label: 'Traces', hash: 'traces', pages: ['traces', 'trace-detail'] },
      { label: 'Monitoring', hash: 'monitoring', pages: ['monitoring'] },
    ],
  },
  {
    label: 'Evaluation',
    items: [
      { label: 'Datasets', hash: 'datasets', pages: ['datasets', 'dataset-detail'] },
      { label: 'Experiments', hash: 'experiments', pages: ['experiments', 'experiment-detail'] },
    ],
  },
];

export function App() {
  const { page, params } = useHashRouter();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 bg-gray-950 border-r border-gray-800 px-3 py-6 flex-shrink-0">
        <a href="#" className="block px-3 mb-6">
          <h1 className="text-lg font-bold text-white">kube-agents</h1>
          <p className="text-gray-500 text-xs">Dashboard</p>
        </a>

        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="mb-5">
            <div className="px-3 mb-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = item.pages.includes(page);
              return (
                <a
                  key={item.hash}
                  href={`#${item.hash}`}
                  className={`block px-3 py-1.5 rounded text-sm mb-0.5 ${
                    active
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-gray-300 hover:bg-gray-900'
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        ))}
      </aside>

      {/* Main content */}
      <main className="flex-1 px-8 py-8 max-w-6xl">
        {page === 'agent-detail' ? (
          <AgentDetailPage namespace={params['namespace']} name={params['name']} />
        ) : page === 'projects' ? (
          <ProjectsPage />
        ) : page === 'project-detail' ? (
          <ProjectDetailPage projectName={params['projectName']} />
        ) : page === 'traces' ? (
          <TracesPage />
        ) : page === 'trace-detail' ? (
          <TraceDetailPage traceId={params['runId']} />
        ) : page === 'datasets' ? (
          <DatasetsPage />
        ) : page === 'dataset-detail' ? (
          <DatasetDetailPage datasetId={params['datasetId']} />
        ) : page === 'experiments' ? (
          <ExperimentsPage />
        ) : page === 'experiment-detail' ? (
          <ExperimentDetailPage experimentId={params['experimentId']} />
        ) : page === 'monitoring' ? (
          <MonitoringPage />
        ) : (
          <OverviewPage />
        )}
      </main>
    </div>
  );
}
