# Email & NATS Messaging Design

This document explains how kube-agents implements asynchronous messaging between agents using NATS.

## Overview

kube-agents uses **NATS** (a cloud-native messaging system) as its messaging backbone. NATS provides:

- Low-latency message delivery
- Built-in persistence (JetStream)
- Pub/sub and request-reply patterns
- Horizontal scalability
- High availability

## NATS Subject Mapping

Email addresses map to NATS subjects for routing:

### Direct Agent Mail

For an agent with email `researcher@agents.local`:

- **Subject**: `mail.researcher@agents.local`
- **Queue group**: `mail:researcher@agents.local` (for load balancing across replicas)

Example:
```
To: researcher@agents.local
→ Publish to: mail.researcher@agents.local
```

### Group Mail

For an AgentGroup with email `reviewers@agents.local`:

- **Subject**: `mail.group.reviewers@agents.local`
- **Queue group**: `mail:group.reviewers@agents.local`

Example:
```
To: reviewers@agents.local
→ Publish to: mail.group.reviewers@agents.local
→ All agents in the group receive it
```

### Subject Pattern

```
mail.<type>.<email>

where:
  <type> = "" (empty for direct) or "group"
  <email> = email address with @ and . preserved
```

Examples:
- `mail.alice@agents.local` → Direct mail to alice
- `mail.bob@internal.acme.com` → Direct mail to bob
- `mail.group.reviewers@agents.local` → Group mail to reviewers group
- `mail.group.data-team@internal.acme.com` → Group mail to data-team

## JetStream Streams

NATS JetStream provides durable, persistent message storage. kube-agents configures:

### Stream: `AGENT_MAIL`

Stores all agent emails for persistence and replay.

Configuration:
```javascript
{
  name: "AGENT_MAIL",
  subjects: ["mail.>"],
  maxAge: 604800000000000,  // 7 days in nanoseconds
  storage: "file",           // Persistent file storage
  discard: "old",            // Discard oldest messages when full
  replicas: 3                // HA across 3 nodes
}
```

Key features:
- Retention: 7 days by default (configurable)
- All messages to `mail.*` subjects are persisted
- Subjects include both direct and group emails
- Automatic replication for high availability

### Consumer Groups

Each agent creates a consumer for its mailbox:

```javascript
{
  durable_name: "agent-researcher",
  delivery_subject: "mail.researcher@agents.local",
  filter_subject: "mail.researcher@agents.local",
  ack_policy: "explicit",
  max_ack_pending: 100
}
```

## Message Format

Emails are serialized as JSON before transmission:

```typescript
interface Email {
  id?: string;              // Unique message ID (UUID v4)
  from: string;             // Sender email
  to: string;               // Recipient email
  subject: string;          // Email subject
  body: string;             // Email body (markdown)
  inReplyTo?: string;       // Message ID this replies to
  attachments?: Attachment[];
  timestamp?: string;       // ISO 8601 timestamp
  metadata?: {
    priority?: "low" | "normal" | "high";
    tags?: string[];
    source?: string;        // e.g., "webhook", "scheduler", "agent"
  };
}

interface Attachment {
  filename: string;
  contentType: string;
  data: string;             // Base64-encoded content
  size: number;             // Bytes
}
```

### Serialization Example

```json
{
  "id": "msg_550e8400-e29b-41d4-a716-446655440000",
  "from": "scheduler@agents.local",
  "to": "reviewers@agents.local",
  "subject": "Daily code review batch",
  "body": "Please review the following PRs:\n\n- PR #123\n- PR #456",
  "inReplyTo": null,
  "timestamp": "2024-03-11T10:30:00Z",
  "metadata": {
    "priority": "normal",
    "tags": ["batch", "daily"],
    "source": "scheduler"
  },
  "attachments": [
    {
      "filename": "pr-list.json",
      "contentType": "application/json",
      "data": "W3sicHIiOjEyMywibGluZXMiOjE5OH0seyJwciI6NDU2LCJsaW5lcyI6NDU1fV0=",
      "size": 64
    }
  ]
}
```

## Message Threading

Emails form conversation threads using `inReplyTo`:

```
Email 1 (id: msg_1)
  from: alice@agents.local
  to: bob@agents.local
  subject: "Project status"
  body: "What's the status?"

Email 2 (id: msg_2)
  from: bob@agents.local
  to: alice@agents.local
  subject: "RE: Project status"
  inReplyTo: msg_1
  body: "We're on track..."

Email 3 (id: msg_3)
  from: alice@agents.local
  to: bob@agents.local
  subject: "RE: Project status"
  inReplyTo: msg_2
  body: "Great! Keep me posted."
```

The `inReplyTo` field creates a thread. Agents can query thread history:

```typescript
// Get all messages in this thread
const thread = await mailbox.getThread(messageId);
// Returns: [msg_1, msg_2, msg_3, ...]
```

## Delivery Guarantees

kube-agents provides **at-least-once delivery**:

1. **Publishing**: Sender publishes to NATS with JetStream confirmation
2. **Storage**: NATS stores in JetStream (persisted, replicated)
3. **Delivery**: Consumer pulls from stream, agent processes
4. **Acknowledgment**: Agent explicitly acks the message

If an agent crashes before acking, NATS redelivers when it restarts.

### Idempotency

Since at-least-once can cause duplicates, agents should be idempotent:

```typescript
// Good: Check for duplicate processing
const existingReview = await db.findReview(email.id);
if (existingReview) {
  console.log("Already processed this email");
  return;
}

// Bad: Always process, can cause duplicates
async function handleEmail(email) {
  // Process without checking...
}
```

## Dead Letter Handling

Messages that fail processing go to a dead letter subject:

- **DLQ Subject**: `mail.dlq.{originalSubject}`
- **Retention**: 30 days
- **Monitoring**: Alerts when DLQ has messages

Example:
```
Original: mail.researcher@agents.local
DLQ:      mail.dlq.researcher@agents.local
```

An agent can subscribe to its DLQ for failed messages:

```typescript
const dlqSubject = `mail.dlq.${agentEmail}`;
const dlqMessages = await jetstream.subscribe(dlqSubject);

for await (const msg of dlqMessages) {
  console.error(`Failed to process: ${msg.data}`);
  // Manual retry or alerting logic
}
```

## Request-Reply Pattern

For synchronous-style communication, use NATS request-reply:

```typescript
// Sender (alice) sends request, waits for reply
const replySubject = createUniqueReplySubject();
const request = {
  from: "alice@agents.local",
  to: "bob@agents.local",
  subject: "What's the status?",
  body: "..."
};

const response = await nc.request(
  "mail.bob@agents.local",
  JSON.stringify(request),
  { timeout: 30000 }  // 30 second timeout
);

// Receiver (bob) subscribes and replies
nc.subscribe("mail.bob@agents.local", {
  callback: (err, msg) => {
    const reply = {
      body: "Status is good!",
      // ... other fields
    };
    msg.respond(JSON.stringify(reply));
  }
});
```

This is useful for quick queries but less ideal for long-running tasks (use async emails instead).

## Configuration

### NATS Server Setup

```yaml
# nats-server.conf
jetstream {
  store_dir: /data/jetstream

  # AGENT_MAIL stream
  streams: [
    {
      name: AGENT_MAIL
      subjects: ["mail.>"]
      max_age: "168h"     # 7 days
      storage: file
      replicas: 3
      discard: old
    }
  ]
}
```

### Agent Configuration

```yaml
# agent-config.yaml
messaging:
  nats:
    url: nats://nats.kube-agents-system:4222
    tls:
      enabled: true
      caFile: /etc/nats/ca.crt
      certFile: /etc/nats/client.crt
      keyFile: /etc/nats/client.key

  consumer:
    durable: agent-${AGENT_NAME}
    maxAckPending: 100

  # Retry policy
  retry:
    maxRetries: 3
    backoffSeconds: [1, 5, 30]
```

## Monitoring and Observability

### Metrics

kube-agents exposes NATS metrics:

- `mail_messages_received_total`: Total emails received
- `mail_messages_processed_total`: Total emails processed
- `mail_messages_failed_total`: Total processing failures
- `mail_processing_duration_seconds`: Processing latency
- `mail_queue_depth`: Pending messages in agent's mailbox

### Logging

Each email processing logs:

```
2024-03-11T10:30:15Z INFO  Agent processing email
  message_id=msg_550e8400...
  from=scheduler@agents.local
  to=reviewers@agents.local
  subject="Daily code review batch"
```

### Debugging

Check stream status:

```bash
nats stream info AGENT_MAIL
nats consumer info AGENT_MAIL agent-researcher
```

View DLQ messages:

```bash
nats sub "mail.dlq.>" --raw
```

## Security

### Message Encryption

NATS supports TLS for transport security. Enable in cluster:

```yaml
tls:
  cert: /etc/nats/server.crt
  key: /etc/nats/server.key
```

### Access Control

NATS authentication restricts who can publish/subscribe:

```conf
accounts {
  agent-researcher {
    users [
      { user: agent-researcher-token, password: ... }
    ]
    publish {
      allow: ["mail.researcher@agents.local"]
    }
    subscribe {
      allow: [
        "mail.researcher@agents.local",
        "mail.group.>",
        "mail.dlq.researcher@agents.local"
      ]
    }
  }
}
```

Each agent's NATS credentials allow:
- Publishing to its own email address (for replies)
- Publishing to any group it's in
- Subscribing to its own mailbox and DLQ

---

## Example: Complete Email Flow

```
1. Scheduler publishes Email to NATS
   Subject: mail.group.reviewers@agents.local
   Payload: { id: msg_1, from: scheduler, to: reviewers, ... }

2. NATS JetStream persists the message

3. Both agents in reviewers group see it:
   - mail consumer for reviewer-1
   - mail consumer for reviewer-2

4. Agent 1 pulls the message (queue group, only one gets it)
   → Processes the email
   → Executes tools (file-read, code-analysis, etc.)
   → Publishes reply email (inReplyTo: msg_1)

5. Scheduler receives reply
   Subject: mail.scheduler@agents.local
   Payload: { id: msg_2, from: reviewer-1, inReplyTo: msg_1, ... }

6. Thread complete: [msg_1, msg_2]
```
