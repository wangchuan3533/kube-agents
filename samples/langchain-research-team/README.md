# LangChain Research Team — kube-agents Sample

A multi-agent research team built with **LangChain** (LangGraph) running on the **kube-agents** framework. Each agent runs as a separate kube-agent Pod, using NATS-backed email for inter-agent communication and LangChain for reasoning/tool-use.

## Architecture

```
┌─────────────────┐     email     ┌─────────────────┐     email     ┌─────────────────┐
│   Researcher    │ ────────────▶ │    Analyst       │ ────────────▶ │     Writer      │
│   (LangGraph)   │               │   (LangGraph)    │               │   (LangGraph)   │
│                 │               │                  │               │                 │
│ Tools:          │               │ Tools:           │               │ Tools:          │
│ - web_search    │               │ - save_note      │               │ - save_note     │
│ - save_note     │               │ - read_note      │               │ - read_note     │
│ - send_email    │               │ - send_email     │               │ - send_email    │
└────────┬────────┘               └──────────────────┘               └────────┬────────┘
         │                                                                    │
         └────────────── NATS JetStream (kube-agents mail) ───────────────────┘
```

### Workflow

1. A user sends an email to `researcher@research.kube-agents.local` with a research topic
2. **Researcher** searches the web, collects findings, then emails them to the analyst
3. **Analyst** analyzes the findings, identifies patterns/insights, then emails analysis to the writer
4. **Writer** composes a polished report and replies to the original requester

### Agent Group

All three agents belong to `research_team@research.kube-agents.local` — send an email to this address to broadcast to the entire team.

## Integration Pattern

This sample demonstrates how LangChain agents integrate with kube-agents:

- **kube-agents** handles: Kubernetes lifecycle (CRDs, Pods), NATS messaging (email delivery), agent identity
- **LangChain** handles: LLM reasoning loop (via LangGraph), tool orchestration, prompt management

The bridge is the `MailBridge` class in `src/mail-bridge.ts`:
1. Connects to NATS and creates a mailbox
2. Passes the mailbox to a `GraphFactory` that builds the LangGraph with email-aware tools
3. When an email arrives, invokes the LangGraph and replies with the result

## Prerequisites

- Kubernetes cluster with kube-agents Helm chart deployed (NATS must be running)
- Azure OpenAI credentials (API key, endpoint, deployment name)

## Local Development

```bash
# From the repo root
pnpm install

# Run locally (requires NATS at localhost:4222)
cd samples/langchain-research-team
AGENT_ROLE=researcher \
AGENT_EMAIL=researcher@research.kube-agents.local \
NATS_URL=nats://localhost:4222 \
AZURE_OPENAI_API_KEY=your-key \
AZURE_OPENAI_ENDPOINT=https://your-instance.openai.azure.com \
AZURE_OPENAI_DEPLOYMENT=gpt-5.4 \
pnpm dev
```

## Deploy to Kubernetes

```bash
# 1. Build the container image
cd samples/langchain-research-team
docker build --platform linux/amd64 \
  -t kube-agents/langchain-research-team:latest .

# 2. Transfer to your cluster node
docker save kube-agents/langchain-research-team:latest | \
  ssh k8s-local2 "sudo ctr -n k8s.io images import --platform linux/amd64 -"

# 3. Create the Azure OpenAI credentials secret
kubectl create secret generic azure-openai-credentials -n kube-agents \
  --from-literal=api-key=YOUR_KEY \
  --from-literal=endpoint=https://YOUR_INSTANCE.openai.azure.com \
  --from-literal=deployment=YOUR_DEPLOYMENT_NAME

# 4. Apply the manifests
kubectl apply -f k8s/manifests.yaml -n kube-agents

# 5. Verify all three agents are running
kubectl get pods -n kube-agents -l app.kubernetes.io/part-of=langchain-research-team
```

## Customization

- **Replace web search**: Swap `src/tools/web-search.ts` with a real search API (Tavily, SerpAPI, Brave Search via `@langchain/community`)
- **Add agents**: Create a new agent in `src/agents/`, register it in `AGENT_FACTORIES` in `main.ts`, add a Deployment to `manifests.yaml`
- **Change LLM provider**: Modify `src/llm.ts` to use a different LangChain chat model (e.g. `ChatAnthropic`, `ChatOpenAI`)
- **Add tools**: Create LangChain tools in `src/tools/` and add them to the agent's tool array

## Files

```
src/
├── main.ts              # Entry point — routes to the right agent via AGENT_ROLE
├── mail-bridge.ts       # Bridges NATS mailbox ↔ LangGraph
├── llm.ts               # Shared LLM factory (Azure OpenAI)
├── agents/
│   ├── researcher.ts    # Web search + note-taking agent
│   ├── analyst.ts       # Data analysis agent
│   └── writer.ts        # Report writing agent
└── tools/
    ├── email-send.ts    # LangChain tool: send emails via NATS
    ├── web-search.ts    # LangChain tool: web search (simulated)
    └── note-taking.ts   # LangChain tool: in-memory notes
k8s/
└── manifests.yaml       # Agent CRDs + Deployments + AgentGroup
```
