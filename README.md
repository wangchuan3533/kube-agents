# kube-agents

Declarative multi-agent framework for Kubernetes.

Agents run as Pods, communicate via email (NATS-backed messaging), and are defined using Custom Resource Definitions.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

See [docs/getting-started.md](docs/getting-started.md) for the full guide.

## Packages

| Package | Description |
|---------|-------------|
| [@kube-agents/core](packages/core) | Shared types, schemas, utilities |
| [@kube-agents/mail](packages/mail) | NATS-backed email messaging |
| [@kube-agents/llm](packages/llm) | Multi-provider LLM abstraction |
| [@kube-agents/runtime](packages/runtime) | Agent runtime (runs in Pod) |
| [@kube-agents/operator](packages/operator) | K8s operator |
| [@kube-agents/tools](packages/tools) | Built-in tool implementations |

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## License

MIT
