# Core Concepts

This document explains the fundamental concepts of kube-agents: the building blocks for autonomous agent systems on Kubernetes.

## Agent

An **Agent** is an LLM-powered entity that runs as a Kubernetes Pod. Each agent has:

- **Identity**: A unique email address (e.g., `researcher@agents.local`) that identifies the agent in the system
- **LLM Model**: The underlying language model powering the agent's reasoning
- **Tools**: Capabilities to interact with the environment (file operations, shell commands, HTTP requests, etc.)
- **Mailbox**: An asynchronous inbox for receiving messages from other agents
- **State**: Persistent agent context and conversation history
- **Permissions**: Fine-grained access control defining what the agent can do

Agents are defined as Kubernetes Custom Resources and run in pods with sidecar containers for tool execution.

Example use cases:
- Code review agents that analyze pull requests
- Data processing agents that transform datasets
- Research agents that gather and synthesize information
- Deployment agents that manage infrastructure changes

## Email

Email is the **asynchronous messaging primitive** in kube-agents. It's how agents communicate.

An Email has the following structure:

```typescript
interface Email {
  from: string;           // Sender's email address
  to: string;             // Recipient's email address
  subject: string;        // Email subject
  body: string;           // Email body (markdown)
  inReplyTo?: string;     // Message ID this email replies to (threading)
  attachments?: File[];   // Optional attached files/data
  timestamp?: Date;       // Creation timestamp
}
```

Key characteristics:

- **Asynchronous**: Emails are delivered to the recipient's mailbox; the sender doesn't wait for a response
- **Persistent**: Emails are stored in NATS JetStream for reliability
- **Threaded**: Using `inReplyTo`, emails form conversation threads
- **Attachable**: Emails can carry files and structured data as attachments

Emails enable agents to work on tasks independently without blocking on agent availability.

## AgentGroup

An **AgentGroup** is a named collection of agents that shares a single email address for broadcasting.

When an email is sent to a group address (e.g., `reviewers@agents.local`), all agents in that group receive it. This enables:

- **Broadcasting**: One sender, multiple recipients
- **Delegation**: Send a task to a group; any available agent can pick it up
- **Load balancing**: Distribute work across multiple agents
- **Role-based messaging**: Group addresses represent logical roles (e.g., "code-reviewers", "data-processors")

AgentGroups are defined as Kubernetes Custom Resources with a list of member agent IDs.

Example:
```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: reviewers
spec:
  email: reviewers@agents.local
  members:
    - researcher
    - analyst
```

Now emails sent to `reviewers@agents.local` reach both agents.

## Tools

**Tools** are capabilities that agents use to interact with the environment. Each tool:

- **Name**: A unique identifier (e.g., `file-read`, `http-request`)
- **Description**: Human-readable explanation of what it does
- **Parameters**: Input schema (JSON Schema) defining required and optional arguments
- **Execution**: A function that performs the action and returns results

### Built-in Tools

kube-agents provides several built-in tools:

- **file-read**: Read file contents
- **file-write**: Write or create files
- **file-delete**: Delete files
- **shell-exec**: Execute shell commands
- **http-request**: Make HTTP requests (GET, POST, etc.)
- **kubernetes**: Interact with Kubernetes API (get/list/create/patch resources)

### Custom Tools

Agents can use custom tools via **sidecar containers**. A tool sidecar:

1. Runs alongside the agent pod
2. Exposes a tool endpoint (HTTP/gRPC)
3. Registers itself with the agent runtime
4. Handles tool invocations from the agent

This enables domain-specific tools without modifying the agent runtime.

## Skills

**Skills** are composed workflows made from one or more tools. A skill abstracts a multi-step task.

Example: A "code-review" skill might:

1. **file-read**: Load the PR diff
2. **file-read**: Load relevant source files for context
3. Use LLM to analyze the code
4. **file-write**: Write feedback to a review file
5. Send an email with results

Skills hide tool orchestration from the agent, allowing the agent to reason at a higher level. Skills can be:

- Built-in (provided by the framework)
- Custom (defined per agent or organization)
- Shared (packaged and reused across agents)

## Permissions

**Permissions** define what an agent is allowed to do. They control:

- **Filesystem access**: Which paths can be read/written (glob patterns)
- **Network access**: Which hosts can be contacted via HTTP
- **Shell access**: Whether shell execution is allowed, with optional restrictions
- **Kubernetes access**: Which resources and namespaces can be accessed
- **Tool restrictions**: Which tools are available and under what constraints

Permissions are enforced by the tool execution layer. An agent trying to access a forbidden resource receives an error.

Example permission set:

```yaml
permissions:
  filesystem:
    - read: /data/**/*.json
    - write: /output/**
  network:
    - host: api.example.com
    - host: github.com
  kubernetes:
    - group: apps
      resources: [deployments]
      verbs: [get, list, patch]
```

This agent can:
- Read JSON files in `/data/`
- Write anywhere in `/output/`
- Make HTTP calls to api.example.com and github.com
- List and patch deployments in the cluster

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               Kubernetes Cluster                     │
│                                                     │
│  ┌──────────────────┐         ┌──────────────────┐ │
│  │  Agent Pod       │         │  Agent Pod       │ │
│  │ ┌──────────────┐ │         │ ┌──────────────┐ │ │
│  │ │ Agent Agent  │ │         │ │ Agent Agent  │ │ │
│  │ │ researcher   │ │         │ │ analyst      │ │ │
│  │ └──────────────┘ │         │ └──────────────┘ │ │
│  │ ┌──────────────┐ │         │ ┌──────────────┐ │ │
│  │ │ Tool Sidecar │ │         │ │ Tool Sidecar │ │ │
│  │ └──────────────┘ │         │ └──────────────┘ │ │
│  └──────────────────┘         └──────────────────┘ │
│           │                           │             │
│           └───────────────┬───────────┘             │
│                           │                         │
│  ┌────────────────────────────────────────────┐   │
│  │  NATS JetStream (Messaging Backend)        │   │
│  │  - mail.researcher@agents.local            │   │
│  │  - mail.analyst@agents.local               │   │
│  │  - mail.group.reviewers                    │   │
│  └────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Agents communicate via email routed through NATS, execute tools via sidecars, and operate under defined permissions.
