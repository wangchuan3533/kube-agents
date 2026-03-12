# CRD Specification Reference

This document provides the complete specification for the Agent and AgentGroup Custom Resource Definitions.

API Group: `agents.kube-agents.io/v1alpha1`

## Agent CRD

The Agent CRD defines an LLM-powered entity running in Kubernetes.

### Full Specification

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: researcher
  namespace: default
spec:
  # Email address for this agent (must be unique cluster-wide)
  email: researcher@agents.local

  # LLM Configuration
  llm:
    # Identifier of the model to use
    model: claude-opus-4.6
    # Temperature for model inference (0.0-1.0)
    temperature: 0.7
    # Maximum tokens in a response
    maxTokens: 4096
    # Timeout for LLM calls (seconds)
    timeout: 60

  # Container specification
  container:
    # Container image
    image: kube-agents/agent:latest
    # Image pull policy
    imagePullPolicy: IfNotPresent
    # Environment variables
    env:
      - name: LOG_LEVEL
        value: info
      - name: AGENT_NAME
        value: researcher
    # Resource requests and limits
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 1Gi

  # Tool sidecars (optional)
  sidecars:
    - name: code-analyzer
      image: kube-agents/code-analyzer:latest
      imagePullPolicy: IfNotPresent
      env:
        - name: TOOL_PORT
          value: "8080"
      ports:
        - containerPort: 8080
          name: tool
      resources:
        requests:
          cpu: 50m
          memory: 128Mi
        limits:
          cpu: 200m
          memory: 512Mi

  # Available tools (by default, all built-in tools are available)
  tools:
    # List of tool names to enable
    enabled:
      - file-read
      - file-write
      - shell-exec
      - http-request
      - kubernetes
    # Tool-specific configurations
    config:
      shell-exec:
        # Whether shell execution is allowed
        enabled: true
        # Timeout for shell commands (seconds)
        timeout: 30
      http-request:
        # Timeout for HTTP requests (seconds)
        timeout: 30
        # TLS verification
        tlsVerify: true
      kubernetes:
        # Default namespace for K8s operations
        namespace: default

  # Permissions (access control)
  permissions:
    # Filesystem access rules
    filesystem:
      - path: /data/**/*.json
        mode: read
      - path: /output/**
        mode: write
      - path: /tmp/**
        mode: readwrite
    # Network access rules
    network:
      - host: "*.example.com"
        protocol: https
        ports: [443]
      - host: api.github.com
        protocol: https
        ports: [443]
    # Kubernetes API access rules
    kubernetes:
      - apiGroup: ""
        resources: [pods]
        namespaces: [default]
        verbs: [get, list, watch]
      - apiGroup: apps
        resources: [deployments]
        namespaces: [default]
        verbs: [get, list, patch]
    # Tool execution restrictions
    tools:
      - name: shell-exec
        allowed: true
        restrictions:
          # Disallowed shell commands (regex patterns)
          blockedCommands:
            - "rm -rf /.*"
            - "sudo.*"
            - ":(){ :|:& };:"

  # Scaling configuration
  replicas: 1

  # Pod disruption budget (optional)
  podDisruptionBudget:
    minAvailable: 1

  # Node affinity rules (optional)
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: kubernetes.io/os
                operator: In
                values:
                  - linux

  # Labels applied to the agent pod
  labels:
    team: research
    tier: backend

  # Annotations applied to the agent pod
  annotations:
    description: "Research agent for data analysis"

status:
  # Current replica count
  replicas: 1
  # Number of ready replicas
  readyReplicas: 1
  # Phase: Pending, Running, Failed, Unknown
  phase: Running
  # Last update time
  lastUpdateTime: "2024-03-11T10:30:00Z"
  # Agent status message
  message: "Agent is running successfully"
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.email` | string | Yes | Unique email address for the agent (e.g., `agent@agents.local`) |
| `spec.llm.model` | string | Yes | LLM model identifier (e.g., `claude-opus-4.6`) |
| `spec.llm.temperature` | float | No | Sampling temperature (0.0-1.0), default 0.7 |
| `spec.llm.maxTokens` | integer | No | Max tokens per response, default 4096 |
| `spec.llm.timeout` | integer | No | LLM call timeout in seconds, default 60 |
| `spec.container.image` | string | Yes | Container image URI |
| `spec.container.imagePullPolicy` | string | No | Pull policy (Always, IfNotPresent, Never) |
| `spec.container.env` | []EnvVar | No | Environment variables |
| `spec.container.resources` | ResourceRequirements | No | CPU/memory requests and limits |
| `spec.sidecars` | []Container | No | Tool sidecar containers |
| `spec.tools.enabled` | []string | No | List of enabled tool names |
| `spec.tools.config` | object | No | Tool-specific configurations |
| `spec.permissions.filesystem` | []FilesystemRule | No | Filesystem access rules |
| `spec.permissions.network` | []NetworkRule | No | Network access rules |
| `spec.permissions.kubernetes` | []KubernetesRule | No | Kubernetes API rules |
| `spec.permissions.tools` | []ToolRule | No | Tool execution restrictions |
| `spec.replicas` | integer | No | Number of pod replicas, default 1 |
| `status.phase` | string | Read-only | Current phase (Pending, Running, Failed, Unknown) |

---

## AgentGroup CRD

The AgentGroup CRD defines a named collection of agents that share a single email address.

### Full Specification

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: reviewers
  namespace: default
spec:
  # Email address for this group (must be unique cluster-wide)
  email: reviewers@agents.local

  # List of agent names (references to Agent resources)
  members:
    - researcher
    - analyst
    - reviewer

  # Email delivery policy
  deliveryPolicy:
    # How to handle group emails
    mode: broadcast  # broadcast, roundRobin, sticky
    # If mode: sticky, which member gets preference
    preferredMember: researcher

  # Description of the group
  description: "Code review agents"

  # Labels for the group
  labels:
    team: engineering
    tier: backend

  # Annotations
  annotations:
    created-by: platform-team

status:
  # Number of members in the group
  memberCount: 3
  # Member statuses
  members:
    - name: researcher
      status: Ready
      lastHeartbeat: "2024-03-11T10:30:00Z"
    - name: analyst
      status: Ready
      lastHeartbeat: "2024-03-11T10:29:55Z"
    - name: reviewer
      status: NotReady
      lastHeartbeat: "2024-03-11T10:20:00Z"
  # Group status message
  message: "2 of 3 members ready"
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.email` | string | Yes | Unique email address for the group (e.g., `group@agents.local`) |
| `spec.members` | []string | Yes | List of Agent resource names to include in the group |
| `spec.deliveryPolicy.mode` | string | No | Delivery mode: `broadcast`, `roundRobin`, `sticky`. Default: `broadcast` |
| `spec.deliveryPolicy.preferredMember` | string | No | Preferred member for sticky mode |
| `spec.description` | string | No | Human-readable group description |
| `spec.labels` | map | No | Labels for the group |
| `spec.annotations` | map | No | Annotations for the group |
| `status.memberCount` | integer | Read-only | Number of member agents |
| `status.members` | []MemberStatus | Read-only | Status of each member |
| `status.message` | string | Read-only | Status message |

---

## Example: Complete Setup

Here's a practical example setting up multiple agents and a group:

```yaml
---
# Code Review Agent
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: code-reviewer
  namespace: agents
spec:
  email: code-reviewer@agents.local
  llm:
    model: claude-opus-4.6
    temperature: 0.3
  container:
    image: kube-agents/agent:latest
    resources:
      requests:
        cpu: 200m
        memory: 512Mi
      limits:
        cpu: 1000m
        memory: 2Gi
  tools:
    enabled: [file-read, file-write, http-request, kubernetes]
  permissions:
    filesystem:
      - path: /repo/**
        mode: read
      - path: /reviews/**
        mode: write
    network:
      - host: api.github.com
        protocol: https
        ports: [443]
    kubernetes:
      - apiGroup: ""
        resources: [pods]
        verbs: [get, list]

---
# Data Analysis Agent
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: data-analyst
  namespace: agents
spec:
  email: data-analyst@agents.local
  llm:
    model: claude-opus-4.6
    temperature: 0.5
  container:
    image: kube-agents/agent:latest
    resources:
      requests:
        cpu: 500m
        memory: 1Gi
      limits:
        cpu: 2000m
        memory: 4Gi
  sidecars:
    - name: python-runner
      image: kube-agents/python-runner:latest
      ports:
        - containerPort: 8080
          name: tool
  tools:
    enabled: [file-read, file-write, shell-exec]
  permissions:
    filesystem:
      - path: /data/**
        mode: readwrite
      - path: /output/**
        mode: write

---
# Review Group (broadcasts to all members)
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: review-team
  namespace: agents
spec:
  email: reviews@agents.local
  members:
    - code-reviewer
    - data-analyst
  deliveryPolicy:
    mode: broadcast
  description: "Team handling code and data reviews"
```

## CRD Installation

Install these CRDs before deploying agents:

```bash
kubectl apply -f crd-agent.yaml
kubectl apply -f crd-agentgroup.yaml
```

Or via Helm:

```bash
helm install kube-agents ./charts/kube-agents --namespace kube-agents-system --create-namespace
```
