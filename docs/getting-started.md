# Getting Started with kube-agents

This guide walks you through setting up kube-agents locally and creating your first agents.

## Prerequisites

Before you start, ensure you have:

- **Node.js 20+** — JavaScript runtime
  ```bash
  node --version  # v20.0.0 or higher
  ```

- **pnpm** — Package manager
  ```bash
  npm install -g pnpm
  pnpm --version  # 8.0.0 or higher
  ```

- **Docker** — Container runtime
  ```bash
  docker --version  # Docker 20.10+
  ```

- **kind** — Kubernetes in Docker
  ```bash
  kind --version  # 0.20+
  ```

- **kubectl** — Kubernetes CLI
  ```bash
  kubectl version --client
  ```

Optional but recommended:
- **helm** — Kubernetes package manager (for easier deployment)
- **jq** — JSON processor (for working with API responses)

## Installation & Build

### 1. Clone the Repository

```bash
git clone https://github.com/anthropics/kube-agents.git
cd kube-agents
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Build the Project

```bash
pnpm build
```

This compiles TypeScript and prepares Docker images.

### 4. Build Docker Images

```bash
# Build the agent runtime image
docker build -t kube-agents/agent:latest -f docker/agent.Dockerfile .

# Build the operator image
docker build -t kube-agents/operator:latest -f docker/operator.Dockerfile .
```

Or use the provided build script:

```bash
./scripts/build.sh
```

## Start NATS Locally

kube-agents uses NATS for messaging. Start a NATS server with JetStream:

### Option A: Docker

```bash
docker run -d \
  --name nats-server \
  -p 4222:4222 \
  -p 8222:8222 \
  nats:latest \
  -js
```

Verify NATS is running:

```bash
docker logs nats-server
# Output: Server is ready for client connections
```

Access the NATS monitoring UI at `http://localhost:8222`

### Option B: Locally (if NATS CLI installed)

```bash
nats-server -js
```

### Option C: In the Kubernetes Cluster

We'll deploy NATS to the cluster in a later step.

## Create a Kind Cluster

Create a local Kubernetes cluster:

```bash
kind create cluster --name kube-agents --config - <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
metadata:
  name: kube-agents
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
```

Verify the cluster is ready:

```bash
kubectl cluster-info
kubectl get nodes
```

### Load Images into Kind

Load the Docker images you built:

```bash
kind load docker-image kube-agents/agent:latest --name kube-agents
kind load docker-image kube-agents/operator:latest --name kube-agents
kind load docker-image nats:latest --name kube-agents
```

## Apply CRDs

Install the Custom Resource Definitions:

```bash
kubectl apply -f deploy/crds/agent.yaml
kubectl apply -f deploy/crds/agentgroup.yaml
```

Verify CRDs are installed:

```bash
kubectl get crd | grep agents.kube-agents.io
# Output:
# agents.crd.agents.kube-agents.io              2024-03-11T10:30:00Z
# agentgroups.crd.agents.kube-agents.io         2024-03-11T10:30:00Z
```

## Deploy the Operator

### 1. Create a Namespace

```bash
kubectl create namespace kube-agents-system
```

### 2. Deploy NATS (in cluster)

```bash
kubectl apply -f deploy/nats/nats-server.yaml -n kube-agents-system
```

Wait for NATS to be ready:

```bash
kubectl wait pod -l app=nats -n kube-agents-system --for=condition=Ready --timeout=60s
```

### 3. Deploy the Operator

```bash
kubectl apply -f deploy/operator/operator.yaml -n kube-agents-system
```

Verify the operator is running:

```bash
kubectl get deployment -n kube-agents-system
kubectl logs -n kube-agents-system -l app=operator -f
```

The operator watches for Agent and AgentGroup resources and manages their lifecycle.

## Create Example Agents

### 1. Create the Agents Namespace

```bash
kubectl create namespace agents
```

### 2. Deploy Your First Agent

Create a file `researcher-agent.yaml`:

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: researcher
  namespace: agents
spec:
  email: researcher@agents.local

  llm:
    model: claude-opus-4.6
    temperature: 0.7
    maxTokens: 4096

  container:
    image: kube-agents/agent:latest
    imagePullPolicy: IfNotPresent
    env:
      - name: ANTHROPIC_API_KEY
        valueFrom:
          secretKeyRef:
            name: anthropic-credentials
            key: api-key
    resources:
      requests:
        cpu: 200m
        memory: 512Mi
      limits:
        cpu: 1000m
        memory: 2Gi

  tools:
    enabled:
      - file-read
      - file-write
      - http-request
      - shell-exec

  permissions:
    filesystem:
      - path: /data/**
        mode: read
      - path: /output/**
        mode: write
    network:
      - host: api.github.com
        protocol: https
        ports: [443]
      - host: "*.wikipedia.org"
        protocol: https
        ports: [443]

  labels:
    team: research
    tier: backend
```

Create a secret for API credentials:

```bash
kubectl create secret generic anthropic-credentials \
  --from-literal=api-key=$ANTHROPIC_API_KEY \
  -n agents
```

Deploy the agent:

```bash
kubectl apply -f researcher-agent.yaml
```

Verify the agent is running:

```bash
kubectl get agents -n agents
kubectl get pods -n agents
kubectl logs -n agents -l agent=researcher -f
```

### 3. Deploy a Second Agent

Create `analyst-agent.yaml`:

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: analyst
  namespace: agents
spec:
  email: analyst@agents.local

  llm:
    model: claude-opus-4.6
    temperature: 0.5

  container:
    image: kube-agents/agent:latest
    env:
      - name: ANTHROPIC_API_KEY
        valueFrom:
          secretKeyRef:
            name: anthropic-credentials
            key: api-key
    resources:
      requests:
        cpu: 200m
        memory: 512Mi
      limits:
        cpu: 1000m
        memory: 2Gi

  tools:
    enabled:
      - file-read
      - file-write
      - shell-exec

  permissions:
    filesystem:
      - path: /data/**
        mode: readwrite
      - path: /output/**
        mode: write
```

Deploy:

```bash
kubectl apply -f analyst-agent.yaml
```

### 4. Create an Agent Group

Create a group for broadcasting:

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: team
  namespace: agents
spec:
  email: team@agents.local
  members:
    - researcher
    - analyst
  deliveryPolicy:
    mode: broadcast
  description: "Research and analysis team"
```

Deploy:

```bash
kubectl apply -f - <<EOF
apiVersion: agents.kube-agents.io/v1alpha1
kind: AgentGroup
metadata:
  name: team
  namespace: agents
spec:
  email: team@agents.local
  members:
    - researcher
    - analyst
  deliveryPolicy:
    mode: broadcast
EOF
```

Verify:

```bash
kubectl get agentgroups -n agents
```

## Send a Test Email

### 1. Port-Forward to NATS

```bash
kubectl port-forward -n kube-agents-system svc/nats 4222:4222 &
```

### 2. Create a Send Script

Create `send-email.js`:

```javascript
import { connect } from "nats";

const nc = await connect({ servers: "nats://localhost:4222" });
const js = nc.jetstream();

// Send an email to the research team
const email = {
  id: crypto.randomUUID(),
  from: "user@external.com",
  to: "team@agents.local",
  subject: "Research request",
  body: "Please research the latest trends in Kubernetes networking.",
  timestamp: new Date().toISOString()
};

const subject = `mail.group.team@agents.local`;
const result = await js.publish(subject, JSON.stringify(email));

console.log(`Email published with sequence ${result.seq}`);
nc.close();
```

### 3. Run the Script

```bash
node send-email.js
```

### 4. Check Agent Logs

Watch the agents process the email:

```bash
kubectl logs -n agents -l agent=researcher -f
kubectl logs -n agents -l agent=analyst -f
```

You should see logs indicating that the agents received the email and are processing it.

### 5. Send a Reply

The agents will send replies (emails) back. You can subscribe to see them:

```bash
nats sub "mail.>" --raw
```

You should see agents sending emails back with their responses.

## Verify the Setup

Check everything is running:

```bash
# Check CRDs
kubectl get agents -n agents
kubectl get agentgroups -n agents

# Check pods
kubectl get pods -n agents
kubectl get pods -n kube-agents-system

# Check NATS streams
kubectl port-forward -n kube-agents-system svc/nats 4222:4222 &
nats stream info AGENT_MAIL

# Check agent health
kubectl describe agent researcher -n agents
```

## Troubleshooting

### Agents not receiving emails?

1. Check NATS is running:
   ```bash
   kubectl get pods -n kube-agents-system | grep nats
   ```

2. Check JetStream is enabled:
   ```bash
   nats server info
   ```

3. Check agent logs:
   ```bash
   kubectl logs -n agents deployment/researcher
   ```

### Pod crashes?

1. Check pod events:
   ```bash
   kubectl describe pod researcher-xyz -n agents
   ```

2. Check logs for errors:
   ```bash
   kubectl logs researcher-xyz -n agents --previous
   ```

3. Check resource limits:
   ```bash
   kubectl top pod -n agents
   ```

### Cannot connect to NATS?

1. Verify NATS pod is running:
   ```bash
   kubectl get pods -n kube-agents-system
   kubectl logs -n kube-agents-system nats-0
   ```

2. Check NATS service:
   ```bash
   kubectl get svc -n kube-agents-system
   kubectl describe svc nats -n kube-agents-system
   ```

3. Test connection from agent pod:
   ```bash
   kubectl exec -it researcher-xyz -n agents -- \
     nats server info -s nats://nats.kube-agents-system:4222
   ```

## Next Steps

1. **Explore the docs**:
   - Read [concepts.md](./concepts.md) for architecture
   - Check [messaging.md](./messaging.md) for email patterns
   - Learn [tools-and-skills.md](./tools-and-skills.md) for extending agents

2. **Build custom tools**:
   - Create a sidecar container with a custom tool
   - Reference it in your Agent spec

3. **Deploy to production**:
   - Use Helm for easier management
   - Set up monitoring with Prometheus
   - Configure TLS for NATS
   - Use persistent storage for NATS

4. **Create more agents**:
   - Build specialized agents for different tasks
   - Use AgentGroups for role-based communication
   - Set up email workflows between agents

## Example Complete Workflow

```bash
# 1. Set up the cluster
kind create cluster --name kube-agents
kubectl create namespace kube-agents-system
kubectl create namespace agents

# 2. Build images
./scripts/build.sh

# 3. Load images
kind load docker-image kube-agents/agent:latest --name kube-agents
kind load docker-image kube-agents/operator:latest --name kube-agents

# 4. Apply CRDs
kubectl apply -f deploy/crds/

# 5. Deploy NATS and operator
kubectl apply -f deploy/ -n kube-agents-system

# 6. Create agents
kubectl apply -f examples/agents/

# 7. Port-forward NATS
kubectl port-forward -n kube-agents-system svc/nats 4222:4222 &

# 8. Send test email
node send-email.js

# 9. Watch agents work
kubectl logs -n agents -l agent=researcher -f
```

That's it! You now have a working kube-agents setup. Agents are receiving emails, executing tools, and collaborating asynchronously.
