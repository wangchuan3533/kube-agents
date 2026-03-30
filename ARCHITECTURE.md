# Kube-Agents Architecture

## System Overview

Kube-Agents is a Kubernetes-native system for running autonomous AI agents that communicate via email-like message routing powered by NATS JetStream. This document provides a comprehensive overview of the architecture, components, and interactions.

### High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ┌──────────┐        ┌──────────────┐        ┌────────────────┐   │
│  │  User    │        │  Operator    │        │  NATS Server   │   │
│  │ (Email)  │───────▶│  (CRD Watch) │───────▶│  (JetStream)   │   │
│  └──────────┘        │  (Pod Mgmt)  │        └────────────────┘   │
│                      └──────────────┘               ▲       ▲      │
│                                                     │       │      │
│                      ┌─────────────────────────────┘       │      │
│                      │                                     │      │
│                      ▼                                     ▼      │
│         ┌──────────────────────────┐     ┌──────────────────────┐ │
│         │  Pod 1: Agent Runtime    │     │ Pod 2: Agent Runtime │ │
│         │ ┌──────────────────────┐ │     │ ┌──────────────────┐ │ │
│         │ │ Container            │ │     │ │ Container        │ │ │
│         │ │ - Agent Startup      │ │     │ │ - Agent Startup  │ │ │
│         │ │ - Message Loop       │────┼─────│ - Message Loop   │ │ │
│         │ │ - LLM Calls          │ │     │ │ - LLM Calls      │ │ │
│         │ │ - Tool Execution     │ │     │ │ - Tool Execution │ │ │
│         │ │ - Reply Publication  │ │     │ │ - Reply Pub      │ │ │
│         │ └──────────────────────┘ │     │ └──────────────────┘ │ │
│         │ ConfigMap Mount:         │     │ ConfigMap Mount:     │ │
│         │ - Agent Spec (CRD)       │     │ - Agent Spec (CRD)   │ │
│         │ - Environment            │     │ - Environment        │ │
│         └──────────────────────────┘     └──────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                          Kubernetes Cluster
```

---

## 1. Component Interaction Flow

### Communication Channels

1. **CRD Definitions**: Users define Agent and AgentGroup resources
2. **Operator**: Watches CRDs, orchestrates Pod lifecycle
3. **ConfigMaps**: Store agent specifications and configurations
4. **NATS JetStream**: Message broker with persistent delivery semantics
5. **Agent Runtime**: Containerized process executing agent logic

### Message Flow Sequence

```
User sends email to agent@agents.mycompany.com
         │
         ▼
External mail system (SMTP gateway) routes to NATS
         │
         ▼
NATS Subject: mail.{agent_email}
         │
         ├─────────────────────────────────────────┐
         │                                         │
         ▼                                         ▼
  Agent Pod 1                               Agent Pod 2
  (subscribed)                              (subscribed)
         │                                         │
         ├─── consumes message ───────────────────┤
         │                                         │
         ▼                                         ▼
  Parse email                          Parse email
  Get LLM context                      Get LLM context
  Call Claude/OpenAI/Ollama           Call Claude/OpenAI/Ollama
  Execute tools                        Execute tools
         │                                         │
         └─────────────┬──────────────────────────┘
                       │
                       ▼
        Publish reply to NATS subject:
        mail.{sender_email}
                       │
                       ▼
        External mail system routes back
        to original sender
```

---

## 2. CRD to Operator to Pod Lifecycle

### 2.1 Custom Resource Definitions (CRDs)

**API Group**: `agents.kube-agents.io/v1alpha1`

#### Agent CRD

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: code-agent
  namespace: kube-agents
spec:
  email: code_agent@agents.mycompany.com
  description: "An AI agent for code review and generation"
  llmProvider: "claude"  # claude, openai, ollama
  llmModel: "claude-opus-4-6"
  systemPrompt: "You are a helpful code review agent..."
  tools:
    - name: code-search
      description: "Search codebase"
    - name: code-generate
      description: "Generate code"
  replicas: 2
  resources:
    requests:
      memory: "512Mi"
      cpu: "250m"
    limits:
      memory: "1Gi"
      cpu: "500m"
```

#### AgentGroup CRD

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: developers
  namespace: kube-agents
spec:
  groupEmail: developers@agents.mycompany.com
  agents:
    - code-agent
    - doc-agent
  description: "Group email for developer agents"
```

### 2.2 Operator Lifecycle Management

The Operator component is responsible for:

1. **Watching CRDs**: Monitors Agent and AgentGroup resources for changes
2. **Validation**: Validates spec (email format, LLM provider, tools)
3. **ConfigMap Creation**: Stores agent spec as ConfigMap for Pod access
4. **Pod Orchestration**: Creates/updates/deletes Pods based on spec changes
5. **Status Updates**: Reports Pod status, errors, and health back to CRD
6. **Cleanup**: Handles deletion cascades

### 2.3 Pod Lifecycle Stages

```
┌──────────────────────────────────────────────────────────────┐
│                   Pod Lifecycle Stages                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [1] Pending     [2] Running      [3] Healthy   [4] Error   │
│       │               │                │           │        │
│       └──────┬────────┘                │           │        │
│              │                         │           │        │
│    ┌─────────▼─────────┐               │           │        │
│    │ Init Containers   │               │           │        │
│    │ - Pull images     │               │           │        │
│    │ - Mount volumes   │               │           │        │
│    └─────────┬─────────┘               │           │        │
│              │                         │           │        │
│              ▼                         │           │        │
│    ┌──────────────────────────┐       │           │        │
│    │ Runtime Container Start  │       │           │        │
│    │ 1. Load agent spec       │───┬───┘           │        │
│    │ 2. Initialize NATS conn  │   │               │        │
│    │ 3. Setup LLM client      │   └──────────┐    │        │
│    │ 4. Start message loop    │              │    │        │
│    │ 5. Ready (subscribed)    │              │    │        │
│    └──────────────────────────┘              │    │        │
│                                              │    │        │
│                                  ┌───────────┘    │        │
│                                  │                │        │
│                                  ▼                ▼        │
│                          ┌──────────────┐  ┌────────────┐ │
│                          │ Healthy Pod  │  │ Error Pod  │ │
│                          │ - Active     │  │ - Restart  │ │
│                          │ - Processing │  │ - Logging  │ │
│                          └──────────────┘  └────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Email Routing via NATS Subjects

### 3.1 Subject Naming Convention

Kube-Agents uses hierarchical NATS subject naming:

#### Direct Agent Routing
```
mail.{agent_email}

Examples:
- mail.code_agent@agents.mycompany.com
- mail.doc_agent@agents.mycompany.com
- mail.test_agent@agents.mycompany.com
```

#### Group Routing
```
mail.group.{group_email}

Examples:
- mail.group.developers@agents.mycompany.com
- mail.group.qa_team@agents.mycompany.com
- mail.group.infrastructure@agents.mycompany.com
```

### 3.2 Subject Routing Logic

```
Message received with To: developers@agents.mycompany.com
         │
         ▼
Lookup AgentGroup CRD "developers"
         │
         ▼
Found agents: [code-agent, doc-agent]
         │
         ├─────────────────────────────────┐
         │                                 │
         ▼                                 ▼
Publish to:                        Publish to:
mail.code_agent@...                mail.doc_agent@...
         │                                 │
    Agent Pod                         Agent Pod
    (code-agent)                      (doc-agent)
    subscribes                        subscribes
    and processes                     and processes
```

### 3.3 Reply Subject Routing

When an agent responds:

```
Original message From: user@company.com
                 To: code_agent@agents.mycompany.com
                      │
                      ▼
                 Agent processes
                      │
                      ▼
         Publish reply to: mail.user@company.com
                      │
                      ▼
         External mail system routes
         to user@company.com
```

### 3.4 NATS JetStream Configuration

Agents use NATS JetStream for:

- **Persistent Storage**: Messages survive pod crashes
- **At-Least-Once Delivery**: Guaranteed message processing
- **Consumer Groups**: Multiple pods can process same subject safely
- **Acknowledgment Model**: Agents acknowledge after successful processing

```
JetStream Stream: agents
├── Subject: mail.>
├── Storage: File
├── Retention: Policy-based (e.g., 30 days)
└── Replicas: 3 (for HA)

Consumer per Agent:
├── Name: {agent_name}
├── Durable: true
├── AckPolicy: explicit
└── MaxDeliver: 3 (retry limit)
```

---

## 4. Agent Runtime Internals

### 4.1 Container Image Structure

```
agent-runtime:latest
├── /app/
│   ├── main          (entry point)
│   ├── runtime/      (core runtime logic)
│   │   ├── message_handler.go
│   │   ├── llm_client.go
│   │   ├── tool_executor.go
│   │   └── nats_broker.go
│   └── tools/        (tool implementations)
│       ├── shell.go
│       ├── http.go
│       └── kubernetes.go
├── /etc/agent/
│   └── config.yaml   (mounted ConfigMap)
└── /var/log/
    └── agent.log
```

### 4.2 Runtime Startup Sequence

```
┌─────────────────────────────────────────────────────────────┐
│                  Agent Runtime Startup                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [1] Load Configuration                                    │
│      ├─ Read /etc/agent/config.yaml (mounted ConfigMap)   │
│      ├─ Parse agent spec (email, LLM config, tools)       │
│      ├─ Load environment variables                        │
│      └─ Validate configuration                            │
│                                                             │
│  [2] Initialize Connections                               │
│      ├─ Connect to NATS server                            │
│      │  - Parse NATS_SERVERS env var                      │
│      │  - Enable JetStream                                │
│      ├─ Setup LLM Client                                  │
│      │  - Initialize appropriate provider (Claude/etc)    │
│      │  - Load API credentials from secrets               │
│      └─ Validate all connections                          │
│                                                             │
│  [3] Subscribe to Message Subjects                        │
│      ├─ Direct: mail.{agent_email}                        │
│      ├─ Groups: mail.group.{group_emails}                │
│      └─ Create durable JetStream consumer                │
│                                                             │
│  [4] Start Message Loop                                   │
│      └─ Ready for message processing                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.3 Message Processing Loop

```
┌──────────────────────────────────────────────────────────────┐
│              Message Processing Loop                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  while Agent is running:                                   │
│    │                                                        │
│    ├─ [A] Receive Message from NATS                        │
│    │       - Pull from subscription                        │
│    │       - Extract email metadata                        │
│    │       - Get message payload                           │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    ├─ [B] Parse & Prepare Context                         │
│    │       - Parse email (From, To, Subject, Body)        │
│    │       - Extract attachments if any                   │
│    │       - Build initial context object                 │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    ├─ [C] Build LLM Request                               │
│    │       - Format system prompt                         │
│    │       - Include agent tools in prompt               │
│    │       - Add conversation history (if tracked)       │
│    │       - Prepare tool definitions                    │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    ├─ [D] Call LLM Provider                              │
│    │       ├─ Provider: Claude / OpenAI / Ollama         │
│    │       ├─ Model: {specified in Agent CRD}            │
│    │       ├─ Tokens: Input + Output + Tools             │
│    │       └─ Response: Text + Tool calls                │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    ├─ [E] Execute Tools (if needed)                      │
│    │       - Parse tool calls from LLM                   │
│    │       - Execute each tool in sequence               │
│    │       - Collect results                             │
│    │       - Handle errors gracefully                    │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    ├─ [F] Generate Response                              │
│    │       - Format LLM output as email reply            │
│    │       - Include tool execution results             │
│    │       - Prepare headers (From, To, Subject)        │
│    │       │                                               │
│    │       ▼                                               │
│    │
│    └─ [G] Publish Reply & Acknowledge                   │
│            - Publish to mail.{sender_email}              │
│            - Acknowledge message in JetStream           │
│            - Log transaction                            │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 4.4 Detailed Processing Steps

#### Step A: Receive Message from NATS

```go
// Pseudo-code
message := subscribe.NextMsg()
// {
//   "From": "user@company.com",
//   "To": "code_agent@agents.mycompany.com",
//   "Subject": "Review my code",
//   "Body": "Please review this function...",
//   "Timestamp": "2026-03-11T10:30:00Z"
// }
```

#### Step B: Parse & Prepare Context

```go
email := parseEmail(message.Data)
context := map[string]interface{}{
    "sender": email.From,
    "agent": email.To,
    "subject": email.Subject,
    "body": email.Body,
    "timestamp": email.Timestamp,
}
```

#### Step C: Build LLM Request

```go
systemPrompt := agent.Spec.SystemPrompt
toolDefinitions := loadToolDefinitions(agent.Spec.Tools)

request := LLMRequest{
    Model: agent.Spec.Model,  // "claude-opus-4-6"
    SystemPrompt: systemPrompt,
    UserMessage: formatUserMessage(email),
    Tools: toolDefinitions,
    MaxTokens: 2048,
}
```

#### Step D: Call LLM Provider

```go
response := llmClient.CreateMessage(request)
// response.Content may contain:
// - Text: "I'll help you review the code..."
// - ToolUse: [
//     {id: "call_123", name: "code-search", input: {...}},
//     {id: "call_456", name: "code-review", input: {...}}
//   ]
```

#### Step E: Execute Tools

```
for each ToolUse in response.ToolUse:
    tool := toolRegistry.Get(ToolUse.name)
    result := tool.Execute(ToolUse.input)
    toolResults.Add({
        toolUse: ToolUse.id,
        result: result,
        status: "success" or "error"
    })
```

#### Step F: Generate Response

```
response_email := {
    "From": "code_agent@agents.mycompany.com",
    "To": "user@company.com",
    "Subject": "Re: Review my code",
    "Body": formatResponse(llmResponse, toolResults),
    "InReplyTo": originalMessage.Id,
}
```

#### Step G: Publish & Acknowledge

```go
natsConn.Publish("mail.user@company.com", response_email)
message.Ack()  // Acknowledge in JetStream
log.Info("Message processed", "id", message.ID, "duration", elapsed)
```

---

## 5. LLM Provider Abstraction

### 5.1 Provider Interface

The runtime supports multiple LLM providers through a common interface:

```
LLMProvider Interface:
├── CreateMessage(request) → response
├── ListModels() → []Model
├── GetTokenUsage(request) → usage
└── ValidateConfig() → error

Implementations:
├── Claude Provider
│   ├── Model: claude-opus-4-6, claude-sonnet-4, etc.
│   ├── API: Anthropic Messages API
│   └── Features: Tool use, vision, long context
├── OpenAI Provider
│   ├── Model: gpt-4, gpt-4-turbo, etc.
│   ├── API: OpenAI Chat Completions
│   └── Features: Function calling, vision
└── Ollama Provider
│   ├── Model: Custom/local models
│   ├── API: Ollama local inference
│   └── Features: Local-only, low latency
```

### 5.2 Provider Configuration

Configuration stored in Agent CRD:

```yaml
spec:
  llmProvider: "claude"  # or "openai" or "ollama"
  llmModel: "claude-opus-4-6"
  llmConfig:
    temperature: 0.7
    maxTokens: 2048
    topP: 1.0
  # Provider-specific credentials via Secrets
  llmSecretRef:
    name: llm-credentials  # Kubernetes Secret
    namespace: kube-agents
```

### 5.3 Tool Use Patterns

#### Claude (Anthropic)

```
LLM Response:
{
  "content": [
    {
      "type": "text",
      "text": "I'll help you with that."
    },
    {
      "type": "tool_use",
      "id": "call_abc123",
      "name": "code-search",
      "input": {"query": "function getUserById"}
    }
  ]
}
```

#### OpenAI (Function Calling)

```
LLM Response:
{
  "choices": [{
    "message": {
      "content": "I'll search for that function.",
      "tool_calls": [{
        "id": "call_xyz789",
        "function": {
          "name": "code-search",
          "arguments": "{\"query\": \"function getUserById\"}"
        }
      }]
    }
  }]
}
```

#### Ollama (Local Models)

```
LLM Response:
Similar to Claude format, but:
- Runs locally (no API calls)
- Lower latency
- Custom models supported
- Tool use depends on model capability
```

### 5.4 Error Handling

```
LLM Call Failures:
├── Network Error → Retry with exponential backoff
├── Rate Limit → Queue and retry with delay
├── Invalid Config → Log error, skip this message
├── API Error → Generate error response email
└── Timeout → Return partial result or error
```

---

## 6. Tool Execution Model

### 6.1 Tool Registry

```
Tool Registry:
├── Shell Tools
│   ├── shell-exec: Execute shell commands
│   ├── shell-read-file: Read file contents
│   └── shell-write-file: Write file contents
│
├── Code Tools
│   ├── code-search: Search codebase
│   ├── code-analyze: Static analysis
│   └── code-generate: Generate code snippets
│
├── HTTP Tools
│   ├── http-get: Make GET requests
│   ├── http-post: Make POST requests
│   └── http-webhook: Send webhook payloads
│
├── Kubernetes Tools
│   ├── k8s-list-pods: List cluster pods
│   ├── k8s-get-logs: Fetch pod logs
│   ├── k8s-apply-manifest: Apply K8s resources
│   └── k8s-delete-resource: Delete K8s resources
│
└── Custom Tools
    └── Any agent-specific tools loaded from CRD
```

### 6.2 Tool Execution Lifecycle

```
┌──────────────────────────────────────────────────────────────┐
│              Tool Execution Lifecycle                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [1] Parse Tool Call from LLM                              │
│      ├─ Extract tool name                                 │
│      ├─ Extract input parameters                          │
│      └─ Validate against tool schema                      │
│                                                              │
│  [2] Check Tool Permissions                               │
│      ├─ Is tool enabled in agent spec?                   │
│      ├─ Does agent have RBAC permissions?                │
│      └─ Rate limiting checks                              │
│                                                              │
│  [3] Prepare Tool Context                                 │
│      ├─ Set environment variables                         │
│      ├─ Load tool-specific credentials                   │
│      ├─ Setup sandboxing/isolation                       │
│      └─ Apply timeout settings                            │
│                                                              │
│  [4] Execute Tool                                         │
│      ├─ Invoke tool handler                              │
│      ├─ Stream output if applicable                      │
│      ├─ Monitor resource usage                           │
│      └─ Apply timeout (default: 30s)                     │
│                                                              │
│  [5] Capture Results                                      │
│      ├─ Collect stdout                                   │
│      ├─ Capture stderr                                   │
│      ├─ Record execution time                            │
│      └─ Capture exit code/status                         │
│                                                              │
│  [6] Post-Process Output                                  │
│      ├─ Sanitize sensitive data                          │
│      ├─ Format for LLM consumption                       │
│      ├─ Apply output limits (default: 10KB)             │
│      └─ Handle binary data                               │
│                                                              │
│  [7] Return to LLM                                        │
│      └─ Include in next LLM prompt for tool result      │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Tool Execution Example

**Agent receives email**: "List all pods in namespace kube-agents"

```
Step 1: Parse
  Tool: "k8s-list-pods"
  Input: {"namespace": "kube-agents"}

Step 2: Check Permissions
  - Tool enabled? YES
  - RBAC rule: agents.pods.list? YES
  - Rate limit? OK (0/100 used)

Step 3: Prepare Context
  kubeconfig mounted at /var/run/secrets/kubernetes.io/serviceaccount
  kubectl available in PATH

Step 4: Execute
  $ kubectl get pods -n kube-agents -o json
  {
    "items": [
      {"name": "agent-abc123", "status": "Running"},
      {"name": "agent-def456", "status": "Running"}
    ]
  }

Step 5-6: Capture & Process
  Output: JSON formatted list
  Size: ~500 bytes (within limit)

Step 7: Return to LLM
  "Tool result: Found 2 pods in kube-agents namespace:
   - agent-abc123 (Running)
   - agent-def456 (Running)"
```

### 6.4 Tool Security Model

```
Tool Execution Security:
├── Sandboxing
│   ├── Pod-level isolation via Kubernetes
│   ├── Process limits (CPU, memory)
│   ├── Network policies restrict NATS access only
│   └── Read-only filesystems where possible
│
├── RBAC Integration
│   ├── ServiceAccount per agent pod
│   ├── RBAC bindings control Kubernetes access
│   ├── API audit logs all tool executions
│   └── Example: code-agent can only read code repos
│
├── Input Validation
│   ├── Tool parameters validated against schema
│   ├── Timeout enforcement (default 30s)
│   ├── Output size limits (default 10KB)
│   └── Rate limiting per tool/agent
│
└── Output Sanitization
    ├── Remove credentials/tokens
    ├── Truncate logs
    ├── Filter sensitive paths
    └── Binary data handling
```

### 6.5 Tool Definition in Agent CRD

```yaml
spec:
  tools:
    - name: "k8s-list-pods"
      description: "List pods in a namespace"
      enabled: true
      timeout: 30
      parameters:
        namespace:
          type: string
          description: "Kubernetes namespace"
          required: true

    - name: "code-search"
      description: "Search codebase for patterns"
      enabled: true
      timeout: 60
      parameters:
        query:
          type: string
          description: "Search pattern"
          required: true
        directory:
          type: string
          description: "Directory to search"
          required: false
          default: "/"

    - name: "shell-exec"
      description: "Execute shell command"
      enabled: false  # Disabled for safety
      allowlist:
        - "cat /etc/hostname"
        - "uname -a"
```

---

## 7. Deployment Architecture

### 7.1 Namespace Layout

```
kube-agents (namespace)
├── Operator Deployment
│   ├── Pod: kube-agents-operator-xxxxx
│   └── ServiceAccount: kube-agents-operator
│
├── Agent Pods (managed by Operator)
│   ├── Pod: code-agent-xxxxx
│   ├── Pod: code-agent-yyyyy
│   ├── Pod: doc-agent-xxxxx
│   └── Pod: test-agent-xxxxx
│
├── ConfigMaps (one per Agent CRD)
│   ├── ConfigMap: code-agent-config
│   ├── ConfigMap: doc-agent-config
│   └── ConfigMap: test-agent-config
│
├── Secrets (LLM credentials)
│   ├── Secret: llm-credentials-claude
│   ├── Secret: llm-credentials-openai
│   └── Secret: kube-agents-config
│
└── Services
    └── Service: nats-headless (pointing to external NATS)
```

### 7.2 Operator Configuration

The operator is configured via ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: kube-agents-config
  namespace: kube-agents
data:
  config.yaml: |
    cluster:
      domain: "agents.mycompany.com"
      natsServers:
        - "nats://nats-cluster:4222"
      natsJetStreamEnabled: true

    operators:
      concurrentReconciles: 3
      maxRetries: 3
      retryBackoff: "5s"

    agent:
      defaultResources:
        requests:
          memory: "256Mi"
          cpu: "100m"
        limits:
          memory: "512Mi"
          cpu: "250m"

      defaultTimeout: 30s
      maxConcurrentTools: 5

      podSecurityPolicy: "restricted"
      serviceAccountName: "agent-runtime"
```

### 7.3 ServiceAccount & RBAC

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: agent-runtime
  namespace: kube-agents

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: agent-runtime
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/logs"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list"]
  - apiGroups: ["agents.kube-agents.io"]
    resources: ["agents"]
    verbs: ["get"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: agent-runtime
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: agent-runtime
subjects:
  - kind: ServiceAccount
    name: agent-runtime
    namespace: kube-agents
```

---

## 8. Data Flow Examples

### 8.1 Example: Code Review Agent Processing Email

```
Timeline:
T0:00   User sends email: "Please review my PR code"
        To: code_agent@agents.mycompany.com
        From: engineer@company.com

T0:01   Email reaches NATS via gateway
        Subject: mail.code_agent@agents.mycompany.com

T0:02   Pod subscriber receives message
        - Parses email
        - Extracts: "Please review my PR code"

T0:03   Runtime builds LLM request
        - System: "You are a code review expert..."
        - User: "Please review my PR code"
        - Tools: [code-search, code-analyze, code-generate]

T0:05   Claude API called
        Response:
        {
          "content": [
            {
              "type": "text",
              "text": "I'll search for the PR code first."
            },
            {
              "type": "tool_use",
              "id": "call_1",
              "name": "code-search",
              "input": {"query": "recent PR changes"}
            }
          ]
        }

T0:10   Tool execution: code-search
        Result: Found 3 files changed
        - users/controller.go (+45, -12)
        - users/service.go (+28, -5)
        - users/handler.go (+10, -3)

T0:12   Next LLM call with tool results
        LLM response:
        {
          "content": [
            {
              "type": "text",
              "text": "Now analyzing the code quality..."
            },
            {
              "type": "tool_use",
              "id": "call_2",
              "name": "code-analyze",
              "input": {"files": ["users/controller.go"]}
            }
          ]
        }

T0:20   Tool execution: code-analyze
        Result: Analysis complete
        - Code quality: 85/100
        - Coverage: 78%
        - Issues: 2 minor style issues

T0:22   Final LLM response generated
        "Here's my code review:
         - Overall quality: Good (85/100)
         - Coverage is at 78%, could be improved
         - Found 2 minor style issues:
           1. Line 42: Use camelCase for variable
           2. Line 58: Add error wrapping

         Recommendations:
         - Add more unit tests for edge cases
         - Consider refactoring getUserById function"

T0:23   Response formatted as email
        From: code_agent@agents.mycompany.com
        To: engineer@company.com
        Subject: Re: Please review my PR code
        Body: [review feedback above]

T0:24   Response published to NATS
        Subject: mail.engineer@company.com
        Message acknowledged in JetStream

T0:25   External mail gateway routes to engineer@company.com
        Engineer receives code review

Total latency: ~25 seconds (4 NATS calls, 2 LLM calls, 2 tool executions)
```

### 8.2 Example: Group Email Processing

```
Timeline:
T0:00   Team lead sends email to: developers@agents.mycompany.com
        Subject: "Daily status check"
        From: lead@company.com

T0:01   Email reaches NATS
        Subject: mail.group.developers@agents.mycompany.com

T0:02   Operator looks up AgentGroup CRD
        AgentGroup: developers
        Agents: [code-agent, doc-agent, qa-agent]

T0:03   Message duplicated to three subjects:
        - mail.code_agent@agents.mycompany.com
        - mail.doc_agent@agents.mycompany.com
        - mail.qa_agent@agents.mycompany.com

T0:05   All three agents receive and process in parallel
        code-agent:
          → Analyzes code commits
          → Runs tests
          → Generates report

        doc-agent:
          → Updates documentation
          → Checks links
          → Generates summary

        qa-agent:
          → Runs test suite
          → Checks coverage
          → Reports issues

T0:45   Responses published to three different subjects:
        - mail.lead@company.com (from code-agent)
        - mail.lead@company.com (from doc-agent)
        - mail.lead@company.com (from qa-agent)

T0:46   Lead receives three emails with different perspectives
        - Code report from code-agent
        - Doc update from doc-agent
        - QA report from qa-agent
```

---

## 9. Scalability & High Availability

### 9.1 Horizontal Scaling

```
Agent Replicas (per Agent CRD):
├── spec.replicas: 2 (example)
├── Creates 2 identical Pod instances
├── All subscribe to same NATS subjects
├── JetStream consumer group ensures:
│   - Each message processed once
│   - Load balanced across replicas
│   - Automatic failover if pod crashes
└── Scales linearly with message volume
```

### 9.2 NATS JetStream HA

```
NATS Cluster (3+ nodes):
├── Stream: agents
│   ├── Replicas: 3
│   ├── Persistent storage
│   └── Auto-recovery on node failure
├── Consumer per Agent
│   ├── Durable: survives server restart
│   ├── MaxDeliver: 3 retries
│   └── AckWait: 30s timeout
└── Failover transparent to agents
```

### 9.3 Kubernetes Resources

```
Requests (guaranteed):
├── CPU: 100m (total per agent pod)
├── Memory: 256Mi (total per agent pod)
└── Allows high density deployments

Limits (maximum):
├── CPU: 250m (prevents runaway)
├── Memory: 512Mi (prevents OOM)
└── Enforced by kubelet
```

---

## 10. Monitoring & Observability

### 10.1 Tracing (LangSmith-inspired)

The system provides comprehensive execution tracing with a hierarchical data model:

```
Data Model (LangSmith-aligned):
├── Project — Groups traces by agent (auto-created per agent)
│   └── Trace — One end-to-end operation (email processing cycle)
│       ├── Run (LLM) — Individual LLM call with full I/O
│       ├── Run (Tool) — Tool execution with arguments/results
│       └── Run (Chain) — Composite step (supports nesting via parentRunId)
├── Feedback — Scores attached to runs/traces (human, code, or LLM-as-judge)
├── Dataset — Collection of test examples for evaluation
│   └── Example — Individual test case (inputs + expected outputs)
└── Experiment — Results of evaluating an agent against a dataset
    └── ExperimentResult — Per-example output with scores
```

#### Trace Flow

```
Runtime (Tracer)                    NATS JetStream               Dashboard
─────────────────                  ────────────────             ─────────────
startTrace() ──────────────────▶  trace.trace.{agent} ──────▶ SQLite (traces)
  startRun(llm) ──────────────▶  trace.run.{agent}   ──────▶ SQLite (runs)
  startRun(tool) ─────────────▶  trace.run.{agent}   ──────▶ SQLite (runs)
  complete() ─────────────────▶  trace.trace.{agent} ──────▶ SQLite (update)
```

#### Storage

- **SQLite** with WAL mode for concurrent reads (replaces in-memory store)
- Persistent via PVC in Kubernetes (`/data/kube-agents.db`)
- Supports Projects, Traces, Runs, Feedback, Datasets, Examples, Experiments

### 10.2 Evaluation

```
Evaluation System:
├── Datasets — Create from traces or manually curate test cases
├── Evaluators — Code (exact_match, regex, JSON schema) + LLM-as-judge
├── Experiments — Run agent against dataset, score with evaluators
└── Comparison — Side-by-side experiment results with score deltas
```

### 10.3 Dashboard

```
Navigation (sidebar):
├── Observability
│   ├── Overview — System health, active agents, key metrics
│   ├── Projects — Per-agent trace grouping with aggregate stats
│   │   └── Project Detail — Filtered traces, token/error metrics
│   ├── Traces — Searchable trace list with status filtering
│   │   └── Trace Detail — Hierarchical run tree with expand/collapse
│   │       ├── LLM runs: prompt, completion, tokens, latency
│   │       ├── Tool runs: arguments, results, errors
│   │       └── Feedback scores
│   └── Monitoring — Time-series charts, model usage, error rates
│       ├── Trace Volume — CSS bar chart (24h hourly buckets)
│       ├── Model Usage — Calls, tokens, latency per model/provider
│       ├── Error Rates — Per-project error rate breakdown
│       └── Project Activity — Aggregate stats table
└── Evaluation
    ├── Datasets — CRUD for evaluation datasets and examples
    │   └── Dataset Detail — Examples list, linked experiments, run experiments
    └── Experiments — Evaluation results with per-example scores
        └── Experiment Detail — Summary metrics, evaluator score aggregates, results table

Agent Detail (linked from Overview):
├── Overview — Identity, replicas, token usage, LLM config
├── Messages — Email inbox/outbox from NATS
├── Traces — Agent-specific trace list
└── Configuration — Full spec (tools, skills, permissions)
```

### 10.4 Monitoring API

```
Monitoring Endpoints:
├── GET /api/monitoring/summary — Aggregated overview (stats + timeseries + models + errors)
├── GET /api/monitoring/timeseries — Time-series trace metrics (configurable granularity/buckets)
├── GET /api/monitoring/models — Model usage breakdown
└── GET /api/monitoring/errors — Error rates per project
```

### 10.5 Health Checks

```
Readiness Probe:
├── Can connect to NATS
├── Can connect to LLM provider
├── NATS subscription active
└── Timeout: 5s, Failure: 3 attempts

Liveness Probe:
├── Pod process still running
├── No deadlocks detected
└── Timeout: 10s, Failure: 3 attempts
```

---

## 11. Security Considerations

### 11.1 Authentication & Authorization

```
Kube-Agents Security Layers:

Layer 1: Kubernetes RBAC
├── ServiceAccount per agent pod
├── ClusterRole restricts API access
├── Prevents unauthorized K8s operations
└── Enforced by API server

Layer 2: NATS Authentication
├── JetStream user/password (or mTLS)
├── Credentials in Kubernetes Secret
├── Prevents unauthorized pub/sub
└── Enforced by NATS server

Layer 3: LLM API Authentication
├── API keys in Kubernetes Secret
├── Mounted as env var to pod
├── Prevents token exposure in code
└── Enforced by LLM provider

Layer 4: Tool Execution
├── Tool allowlist in Agent CRD
├── Parameter validation per tool
├── Timeout enforcement
└── Output sanitization
```

### 11.2 Network Security

```
Network Policies:
├── Agents → NATS only (port 4222)
├── Agents → LLM provider API (HTTPS)
├── Agents → Kubernetes API (HTTPS)
├── Agents → Any other: DENIED
├── Ingress: None (agents don't listen)
└── Operator: Can reach all for management
```

### 11.3 Secret Management

```
Kubernetes Secrets:
├── llm-credentials-claude: API key
├── llm-credentials-openai: API key
├── nats-credentials: NATS auth
├── Mounted read-only to pods
├── Never exposed in logs/metrics
└── Rotated via Kubernetes secret rotation
```

---

## 12. Configuration Management

### 12.1 Operator Configuration

Located at: `/etc/kube-agents/config.yaml` (ConfigMap mount)

```yaml
cluster:
  domain: "agents.mycompany.com"
  natsServers:
    - "nats://nats1:4222"
    - "nats://nats2:4222"
    - "nats://nats3:4222"

llmProviders:
  claude:
    enabled: true
    apiUrl: "https://api.anthropic.com"
  openai:
    enabled: true
    apiUrl: "https://api.openai.com"
  ollama:
    enabled: false
    baseUrl: "http://ollama:11434"

agent:
  defaultResources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 250m
      memory: 512Mi
```

### 12.2 Agent Configuration (CRD)

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: code-agent
spec:
  email: code_agent@agents.mycompany.com
  llmProvider: claude
  llmModel: claude-opus-4-6
  llmSecretRef:
    name: llm-credentials-claude
  systemPrompt: |
    You are an expert code reviewer...
  tools:
    - name: code-search
    - name: code-analyze
    - name: code-generate
  replicas: 2
  resources:
    requests:
      cpu: 150m
      memory: 384Mi
    limits:
      cpu: 300m
      memory: 768Mi
```

---

## Conclusion

Kube-Agents provides a complete, production-ready framework for running autonomous AI agents on Kubernetes with email-based communication. The architecture leverages:

- **Kubernetes** for container orchestration and RBAC
- **NATS JetStream** for reliable, persistent messaging
- **Pluggable LLM providers** (Claude, OpenAI, Ollama)
- **CRDs** for declarative agent configuration
- **Operators** for automated lifecycle management
- **Sandboxed tool execution** for safe, controlled automation

The system is designed to scale horizontally, maintain high availability, and provide comprehensive observability for production environments.
