# CLAUDE.md — AI Coding Instructions for kube-agents

## Project Overview

kube-agents is a declarative multi-agent framework for Kubernetes where:
- Agents run as Pods, defined via Custom Resource Definitions (CRDs)
- Agents communicate asynchronously via "email" (NATS-backed messaging)
- Each agent has an identity (email address like `code_agent@agents.mycompany.com`)
- Group emails enable broadcasting to agent groups
- Pods provide agents with tools, skills, and permissions

## Package Structure

| Package | NPM Name | Purpose |
|---------|----------|---------|
| `packages/core` | `@kube-agents/core` | Shared types, Zod schemas, utilities |
| `packages/runtime` | `@kube-agents/runtime` | Agent runtime (runs inside each Pod) |
| `packages/operator` | `@kube-agents/operator` | K8s operator (watches CRDs, manages Pods) |
| `packages/mail` | `@kube-agents/mail` | NATS-backed email messaging system |
| `packages/llm` | `@kube-agents/llm` | Multi-provider LLM abstraction |
| `packages/tools` | `@kube-agents/tools` | Built-in tool implementations |
| `packages/dashboard` | `@kube-agents/dashboard` | Web dashboard for agent monitoring |

## Coding Conventions

- **TypeScript strict mode** — no `any`, enable all strict checks
- **Zod** for all runtime validation and schema definitions
- **No classes unless necessary** — prefer functions and plain objects
- **Naming**:
  - Files: `kebab-case.ts`
  - Types/Interfaces: `PascalCase`
  - Functions/variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`
- **Imports**: Use `@kube-agents/*` workspace imports between packages
- **Exports**: Each package has `src/index.ts` barrel export
- **Error handling**: Use typed errors extending `KubeAgentsError` base class

## Testing

- **Framework**: Vitest
- **Co-located tests**: Place tests next to source as `*.test.ts`
- **Run**: `pnpm test` (all packages) or `pnpm --filter @kube-agents/core test`
- **Coverage**: Aim for >80% on core logic

## Build System

- **Monorepo**: Turborepo with pnpm workspaces
- **Bundler**: tsup (per-package)
- **Build**: `pnpm build` builds all packages in dependency order

## Key Dependencies

- `zod` — runtime validation
- `nats` — NATS client for messaging
- `@anthropic-ai/sdk` — Claude API
- `openai` — OpenAI API
- `@kubernetes/client-node` — K8s API client

## CRD Patterns

- API group: `agents.kube-agents.io`
- API version: `v1alpha1`
- Kinds: `Agent`, `AgentGroup`
- Use `@kubernetes/client-node` informers for watching resources

## Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run specific package tests
pnpm --filter @kube-agents/core test

# Format code
pnpm format
```

### Local Infrastructure

- **NATS**: `docker run -p 4222:4222 -p 8222:8222 nats:latest -js`
- **K8s**: Use `kind` for local cluster testing

### Kubernetes Deployment (Helm)

All Kubernetes manifests live in `deploy/helm/kube-agents/` as a single Helm chart.

```bash
# Install / upgrade all components
helm upgrade --install kube-agents deploy/helm/kube-agents \
  --namespace kube-agents --create-namespace \
  --kube-context k8s-local2

# Render templates locally (dry-run)
helm template kube-agents deploy/helm/kube-agents

# Uninstall
helm uninstall kube-agents --namespace kube-agents --kube-context k8s-local2
```

Components can be toggled in `values.yaml`:
- `nats.enabled` — NATS messaging (StatefulSet + JetStream)
- `operator.enabled` — kube-agents operator
- `dashboard.enabled` — Web monitoring dashboard
- `demoAgents.enabled` — Demo agents (code, reviewer, orchestrator) and group

## Commit Messages

Use conventional commits:
- `feat(core): add agent identity types`
- `fix(mail): handle NATS reconnection`
- `test(runtime): add agent loop tests`
- `docs: update architecture diagram`
