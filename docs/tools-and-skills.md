# Tool System & Skills Design

This document explains how agents interact with the environment through tools and skills.

## Tool Interface

A **Tool** defines an action an agent can perform. Each tool has a standard interface:

```typescript
interface Tool {
  // Unique identifier
  name: string;

  // Human-readable description
  description: string;

  // Input parameter schema (JSON Schema)
  parameters: JSONSchema;

  // Execute the tool
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

interface ToolResult {
  // Success/failure status
  success: boolean;

  // Result data
  data?: unknown;

  // Error message if failed
  error?: string;

  // Execution metadata
  metadata?: {
    duration: number;        // Milliseconds
    bytesRead?: number;
    bytesWritten?: number;
  };
}
```

### Tool Example: file-read

```typescript
const fileReadTool: Tool = {
  name: "file-read",
  description: "Read the contents of a file",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "File path to read"
      },
      encoding: {
        type: "string",
        enum: ["utf-8", "base64"],
        default: "utf-8",
        description: "File encoding"
      }
    },
    required: ["path"]
  },
  execute: async (params) => {
    const { path, encoding = "utf-8" } = params;

    // Permission check (before execution)
    if (!await checkPermission("file-read", path)) {
      return {
        success: false,
        error: `Permission denied: cannot read ${path}`
      };
    }

    // Execute the tool
    try {
      const content = await fs.readFile(path, encoding);
      return {
        success: true,
        data: { content },
        metadata: {
          duration: 5,
          bytesRead: content.length
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
};
```

## Built-in Tools

kube-agents provides these core tools out of the box:

### file-read

Read file contents.

```typescript
Parameters:
  path: string (required)     - Path to read
  encoding: string (optional) - "utf-8" or "base64", default "utf-8"

Example:
  {
    "path": "/data/config.json",
    "encoding": "utf-8"
  }

Result:
  {
    "success": true,
    "data": {
      "content": "{ ... }"
    }
  }
```

### file-write

Write or create a file.

```typescript
Parameters:
  path: string (required)     - Path to write
  content: string (required)  - Content to write
  encoding: string (optional) - "utf-8" or "base64", default "utf-8"
  createDirs: boolean (optional) - Create parent directories, default true

Example:
  {
    "path": "/output/report.md",
    "content": "# Report\n...",
    "createDirs": true
  }

Result:
  {
    "success": true,
    "data": {
      "bytesWritten": 1024,
      "path": "/output/report.md"
    }
  }
```

### file-delete

Delete a file or directory.

```typescript
Parameters:
  path: string (required)       - Path to delete
  recursive: boolean (optional) - Recursive delete for directories

Example:
  {
    "path": "/tmp/temp-file.txt"
  }

Result:
  {
    "success": true,
    "data": {
      "deleted": "/tmp/temp-file.txt"
    }
  }
```

### shell-exec

Execute a shell command.

```typescript
Parameters:
  command: string (required)   - Shell command to execute
  cwd: string (optional)       - Working directory
  timeout: number (optional)   - Timeout in seconds, default 30
  env: object (optional)       - Environment variables

Example:
  {
    "command": "python analyze.py data.csv",
    "cwd": "/workspace",
    "timeout": 60
  }

Result:
  {
    "success": true,
    "data": {
      "stdout": "Analysis complete...",
      "stderr": "",
      "exitCode": 0
    }
  }
```

### http-request

Make HTTP requests.

```typescript
Parameters:
  url: string (required)              - URL to request
  method: string (optional)           - HTTP method, default "GET"
  headers: object (optional)          - HTTP headers
  body: string | object (optional)    - Request body
  timeout: number (optional)          - Timeout in seconds, default 30
  tlsVerify: boolean (optional)       - Verify TLS certificates

Example:
  {
    "url": "https://api.github.com/repos/owner/repo/pulls",
    "method": "GET",
    "headers": {
      "Authorization": "Bearer ${GITHUB_TOKEN}",
      "Accept": "application/vnd.github+json"
    }
  }

Result:
  {
    "success": true,
    "data": {
      "status": 200,
      "headers": { ... },
      "body": "{ ... }"
    }
  }
```

### kubernetes

Interact with the Kubernetes API.

```typescript
Parameters:
  apiVersion: string (required) - API version (e.g., "v1", "apps/v1")
  kind: string (required)       - Resource kind (e.g., "Pod", "Deployment")
  action: string (required)     - "get", "list", "create", "patch", "delete"
  name: string (optional)       - Resource name (for get/patch/delete)
  namespace: string (optional)  - Namespace (default from config)
  body: object (optional)       - Resource body (for create/patch)

Example:
  {
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "action": "list",
    "namespace": "default"
  }

Result:
  {
    "success": true,
    "data": {
      "items": [
        {
          "metadata": { "name": "app1", ... },
          "spec": { ... }
        }
      ]
    }
  }
```

## Custom Tools via Sidecars

Agents can use custom tools by running **tool sidecar containers** alongside the agent.

### Sidecar Architecture

```
┌─────────────────────────────────┐
│       Agent Pod                 │
├─────────────────────────────────┤
│ ┌──────────────────────────────┐│
│ │  Agent Container             ││
│ │  - Runs LLM logic            ││
│ │  - Calls tools via HTTP      ││
│ └──────────────────────────────┘│
│ ┌──────────────────────────────┐│
│ │  Tool Sidecar Container      ││
│ │  - Exposes tool endpoints    ││
│ │  - Handles tool execution    ││
│ │  (e.g., Python, Java, etc.)  ││
│ └──────────────────────────────┘│
└─────────────────────────────────┘
```

### Implementing a Custom Tool

Here's a Python example for a "data-analysis" tool:

```python
# tool_server.py
from flask import Flask, request, jsonify
import json

app = Flask(__name__)

@app.route("/tools/data-analysis/execute", methods=["POST"])
def execute_data_analysis():
    params = request.json

    try:
        # Execute the custom tool logic
        result = analyze_data(params["file"], params["metric"])

        return jsonify({
            "success": True,
            "data": {
                "result": result,
                "summary": f"Analyzed {params['metric']}"
            },
            "metadata": {
                "duration": 150
            }
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 400

def analyze_data(file, metric):
    import pandas as pd
    df = pd.read_csv(file)
    return df[metric].describe().to_dict()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8080)
```

### Sidecar Configuration in Agent CRD

```yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Agent
metadata:
  name: data-analyst
spec:
  email: analyst@agents.local
  container:
    image: kube-agents/agent:latest

  # Define tool sidecars
  sidecars:
    - name: data-analysis-tool
      image: my-org/data-analysis-tool:latest
      env:
        - name: TOOL_PORT
          value: "8080"
      ports:
        - containerPort: 8080
          name: tool
      resources:
        requests:
          cpu: 100m
          memory: 256Mi
        limits:
          cpu: 500m
          memory: 1Gi

  # Enable the custom tool
  tools:
    enabled:
      - file-read
      - file-write
      - shell-exec
      - data-analysis   # Custom tool from sidecar
```

### Tool Discovery

When a sidecar starts, it registers with the agent:

```http
POST http://127.0.0.1:9090/register-tool
Content-Type: application/json

{
  "name": "data-analysis",
  "description": "Analyze data files and compute statistics",
  "parameters": {
    "type": "object",
    "properties": {
      "file": {
        "type": "string",
        "description": "Path to data file"
      },
      "metric": {
        "type": "string",
        "description": "Metric to analyze"
      }
    },
    "required": ["file", "metric"]
  },
  "endpoint": "http://127.0.0.1:8080/tools/data-analysis/execute"
}
```

The agent can then use this tool like any built-in tool.

## Skills

**Skills** are composed workflows that orchestrate multiple tools to accomplish a task. A skill:

1. Defines a sequence of tool calls
2. Passes results between steps
3. Handles errors
4. Returns a final result

### Skill Interface

```typescript
interface Skill {
  // Identifier
  name: string;

  // Description
  description: string;

  // Input parameters
  parameters: JSONSchema;

  // Execute the skill (orchestrate tools)
  execute(params: Record<string, unknown>): Promise<SkillResult>;
}

interface SkillResult {
  success: boolean;
  data?: unknown;
  error?: string;
  steps?: {
    tool: string;
    result: ToolResult;
    duration: number;
  }[];
}
```

### Built-in Skills

#### code-review

Performs code review on a pull request.

```typescript
const codeReviewSkill: Skill = {
  name: "code-review",
  description: "Review a pull request and provide feedback",
  parameters: {
    type: "object",
    properties: {
      prUrl: {
        type: "string",
        description: "GitHub PR URL"
      },
      focusAreas: {
        type: "array",
        items: { type: "string" },
        description: "Areas to focus on (security, performance, style, etc.)"
      }
    },
    required: ["prUrl"]
  },

  execute: async (params) => {
    const steps = [];

    // Step 1: Fetch PR metadata
    const prResult = await tools["http-request"].execute({
      url: `${params.prUrl}/api/pulls`,
      headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    steps.push({ tool: "http-request", result: prResult, duration: 100 });

    if (!prResult.success) {
      return { success: false, error: "Could not fetch PR" };
    }

    // Step 2: Download diff
    const pr = JSON.parse(prResult.data.body);
    const diffResult = await tools["http-request"].execute({
      url: pr.diff_url
    });
    steps.push({ tool: "http-request", result: diffResult, duration: 50 });

    // Step 3: Write diff to temp file
    const writeResult = await tools["file-write"].execute({
      path: "/tmp/pr.diff",
      content: diffResult.data.body
    });
    steps.push({ tool: "file-write", result: writeResult, duration: 10 });

    // Step 4: Use LLM to analyze (implicit in agent execution)
    // The agent's LLM reads the diff and generates review

    // Step 5: Write review
    const reviewResult = await tools["file-write"].execute({
      path: `/output/review-${pr.id}.md`,
      content: "# Code Review\n\n## Security\n...\n## Performance\n...",
      createDirs: true
    });
    steps.push({ tool: "file-write", result: reviewResult, duration: 15 });

    return {
      success: true,
      data: {
        reviewPath: "/output/review.md",
        focusAreas: params.focusAreas
      },
      steps
    };
  }
};
```

#### data-pipeline

Execute a data processing pipeline.

```typescript
const dataPipelineSkill: Skill = {
  name: "data-pipeline",
  description: "Run a data processing pipeline (extract, transform, load)",

  execute: async (params) => {
    // Step 1: Extract - read source data
    const extractResult = await tools["file-read"].execute({
      path: params.sourceFile
    });

    // Step 2: Transform - run processing script
    const transformResult = await tools["shell-exec"].execute({
      command: `python transform.py --input /tmp/data.json --output /tmp/transformed.json`,
      timeout: 300
    });

    // Step 3: Load - write to destination
    const loadResult = await tools["file-write"].execute({
      path: params.destFile,
      content: transformResult.data.stdout
    });

    return {
      success: transformResult.success && loadResult.success,
      data: { rowsProcessed: 10000 },
      steps: [
        { tool: "file-read", result: extractResult, duration: 50 },
        { tool: "shell-exec", result: transformResult, duration: 5000 },
        { tool: "file-write", result: loadResult, duration: 100 }
      ]
    };
  }
};
```

### Custom Skills

Define custom skills in your agent's configuration or code:

```yaml
# skill-definition.yaml
apiVersion: agents.kube-agents.io/v1alpha1
kind: Skill
metadata:
  name: custom-analysis
spec:
  description: "Custom data analysis workflow"
  tools:
    - data-analysis
    - file-read
    - file-write
  steps:
    - name: load-data
      tool: file-read
      params:
        path: "{{ input.dataFile }}"
    - name: analyze
      tool: data-analysis
      params:
        file: "{{ steps.load-data.data.content }}"
        metric: "{{ input.metric }}"
    - name: save-results
      tool: file-write
      params:
        path: "/output/results.json"
        content: "{{ steps.analyze.data.result }}"
```

## Permission Model

Tools enforce permissions before execution. Each tool respects the agent's permissions.

### Permission Checks

```typescript
// Before executing a tool, the framework checks:
async function executeToolWithPermissions(
  agent: Agent,
  tool: Tool,
  params: Record<string, unknown>
): Promise<ToolResult> {
  // 1. Check if tool is enabled for this agent
  if (!agent.spec.tools.enabled.includes(tool.name)) {
    return {
      success: false,
      error: `Tool ${tool.name} is not enabled for ${agent.spec.email}`
    };
  }

  // 2. Tool-specific checks
  if (tool.name === "file-read") {
    const path = params.path as string;
    if (!canAccessPath(agent, path, "read")) {
      return {
        success: false,
        error: `Permission denied: cannot read ${path}`
      };
    }
  }

  if (tool.name === "shell-exec") {
    const command = params.command as string;
    if (isBlockedCommand(agent, command)) {
      return {
        success: false,
        error: `Command blocked: ${command}`
      };
    }
  }

  if (tool.name === "http-request") {
    const url = params.url as string;
    if (!canAccessHost(agent, extractHost(url))) {
      return {
        success: false,
        error: `Network access denied to ${extractHost(url)}`
      };
    }
  }

  if (tool.name === "kubernetes") {
    if (!canAccessK8sResource(agent, params)) {
      return {
        success: false,
        error: `Kubernetes access denied`
      };
    }
  }

  // 3. Execute the tool
  return await tool.execute(params);
}
```

### Filesystem Permissions

Defined in Agent CRD:

```yaml
permissions:
  filesystem:
    - path: /data/**/*.json
      mode: read          # read, write, or readwrite
    - path: /output/**
      mode: write
```

Checking:
```typescript
function canAccessPath(agent: Agent, path: string, mode: string): boolean {
  for (const rule of agent.spec.permissions.filesystem) {
    if (pathMatches(path, rule.path)) {
      if (mode === "read" && (rule.mode === "read" || rule.mode === "readwrite")) {
        return true;
      }
      if (mode === "write" && (rule.mode === "write" || rule.mode === "readwrite")) {
        return true;
      }
    }
  }
  return false;
}
```

### Network Permissions

```yaml
permissions:
  network:
    - host: "*.github.com"
      protocol: https
      ports: [443]
    - host: api.example.com
      protocol: https
      ports: [443]
```

### Kubernetes Permissions

```yaml
permissions:
  kubernetes:
    - apiGroup: ""
      resources: [pods]
      namespaces: [default, monitoring]
      verbs: [get, list, watch]
    - apiGroup: apps
      resources: [deployments]
      namespaces: [default]
      verbs: [get, patch]
```

## Tool Execution Flow

```
1. Agent calls tool (via LLM or skill)
   toolCall = {
     name: "file-read",
     params: { path: "/data/file.json" }
   }

2. Framework checks permissions
   ✓ Is tool enabled?
   ✓ Can agent access the resource?

3. Tool executes
   result = await fileTool.execute(params)

4. Return result to agent
   {
     success: true,
     data: { content: "..." }
   }

5. Agent processes result and continues
```

## Monitoring Tools

Track tool usage and performance:

```bash
# View tool metrics
kubectl logs -f deployment/agent-researcher | grep "tool_"

# Example logs:
# 2024-03-11T10:30:15Z INFO  tool_execution
#   tool=file-read
#   status=success
#   duration_ms=5
#   bytes_read=1024
```

Tools are the foundation of agent capability. Combined with LLM reasoning and skills for orchestration, they enable powerful autonomous workflows.
