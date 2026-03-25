import type { AgentGroupData } from '../types.js';

interface AgentGroupTableProps {
  groups: AgentGroupData[];
}

export function AgentGroupTable({ groups }: AgentGroupTableProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Agent Groups</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-900 text-gray-400 text-left text-xs uppercase tracking-wide">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3 text-right">Ready</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {groups.map((group) => (
              <tr key={group.metadata.name} className="hover:bg-gray-900/50">
                <td className="px-4 py-3 font-medium text-white">{group.metadata.name}</td>
                <td className="px-4 py-3 text-gray-300">{group.spec.email}</td>
                <td className="px-4 py-3 text-gray-300">
                  {group.spec.members.map((m) => (
                    <span
                      key={m}
                      className="inline-block bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded mr-1 mb-1"
                    >
                      {m}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-3 text-right text-gray-300">
                  {group.status?.readyMembers ?? 0}/{group.status?.memberCount ?? group.spec.members.length}
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No agent groups found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
