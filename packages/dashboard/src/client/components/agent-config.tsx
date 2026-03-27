import type { AgentDetailData } from '../types.js';

interface AgentConfigProps {
  agent: AgentDetailData;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-3">{title}</h3>
      {children}
    </div>
  );
}

export function AgentConfig({ agent }: AgentConfigProps) {
  const { spec } = agent;

  return (
    <div>
      {/* System Prompt */}
      <Section title="System Prompt">
        {spec.system ? (
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono bg-gray-950 rounded-lg p-4 max-h-80 overflow-y-auto border border-gray-800">
            {spec.system}
          </pre>
        ) : (
          <p className="text-gray-500 text-sm">No system prompt configured</p>
        )}
      </Section>

      {/* LLM Configuration */}
      <Section title="LLM Configuration">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConfigItem label="Provider" value={spec.llm.provider} />
          <ConfigItem label="Model" value={spec.llm.model} />
          <ConfigItem label="Temperature" value={spec.llm.temperature?.toString() ?? '0.7'} />
          <ConfigItem label="Max Tokens" value={spec.llm.maxTokens?.toString() ?? '4096'} />
        </div>
      </Section>

      {/* Tools */}
      <Section title="Tools">
        {spec.tools && spec.tools.length > 0 ? (
          <div className="space-y-2">
            {spec.tools.map((tool) => (
              <div key={tool.name} className="flex items-center gap-3 px-3 py-2 bg-gray-950 rounded border border-gray-800">
                <span className="text-sm font-medium text-white">{tool.name}</span>
                {tool.config && (
                  <span className="text-xs text-gray-500 font-mono">
                    {JSON.stringify(tool.config)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No tools configured</p>
        )}
      </Section>

      {/* Skills */}
      {spec.skills && spec.skills.length > 0 && (
        <Section title="Skills">
          <div className="space-y-2">
            {spec.skills.map((skill) => (
              <div key={skill.name} className="flex items-center gap-3 px-3 py-2 bg-gray-950 rounded border border-gray-800">
                <span className="text-sm font-medium text-white">{skill.name}</span>
                {skill.config && (
                  <span className="text-xs text-gray-500 font-mono">
                    {JSON.stringify(skill.config)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Permissions */}
      <Section title="Permissions">
        {spec.permissions ? (
          <div className="space-y-3">
            {spec.permissions.filesystem && (
              <div className="bg-gray-950 rounded p-3 border border-gray-800">
                <div className="text-xs font-semibold text-gray-400 mb-2">Filesystem</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Read</div>
                    {spec.permissions.filesystem.read?.map((p) => (
                      <div key={p} className="text-xs font-mono text-green-400">{p}</div>
                    )) ?? <div className="text-xs text-gray-600">none</div>}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Write</div>
                    {spec.permissions.filesystem.write?.map((p) => (
                      <div key={p} className="text-xs font-mono text-yellow-400">{p}</div>
                    )) ?? <div className="text-xs text-gray-600">none</div>}
                  </div>
                </div>
              </div>
            )}
            {spec.permissions.network && (
              <div className="bg-gray-950 rounded p-3 border border-gray-800">
                <div className="text-xs font-semibold text-gray-400 mb-2">Network</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Allowed Hosts</div>
                    {spec.permissions.network.allowedHosts?.map((h) => (
                      <div key={h} className="text-xs font-mono text-green-400">{h}</div>
                    )) ?? <div className="text-xs text-gray-600">none</div>}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Denied Hosts</div>
                    {spec.permissions.network.deniedHosts?.map((h) => (
                      <div key={h} className="text-xs font-mono text-red-400">{h}</div>
                    )) ?? <div className="text-xs text-gray-600">none</div>}
                  </div>
                </div>
              </div>
            )}
            {spec.permissions.maxConcurrentToolCalls && (
              <div className="text-xs text-gray-400">
                Max concurrent tool calls: <span className="text-white">{spec.permissions.maxConcurrentToolCalls}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No permissions configured</p>
        )}
      </Section>

      {/* Resources */}
      <Section title="Resources">
        <div className="grid grid-cols-2 gap-4">
          <ConfigItem label="CPU" value={spec.resources?.cpu ?? '500m'} />
          <ConfigItem label="Memory" value={spec.resources?.memory ?? '512Mi'} />
          <ConfigItem label="Replicas" value={String(spec.replicas)} />
        </div>
      </Section>
    </div>
  );
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-950 rounded p-3 border border-gray-800">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-sm text-white font-mono">{value}</div>
    </div>
  );
}
