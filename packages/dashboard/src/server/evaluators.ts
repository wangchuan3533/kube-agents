import { randomUUID } from 'node:crypto';
import type { Feedback } from '@kube-agents/core';

// ---------------------------------------------------------------------------
// Evaluator definitions
// ---------------------------------------------------------------------------

export interface EvaluatorConfig {
  name: string;
  type: 'exact_match' | 'contains' | 'regex' | 'json_match' | 'llm_criteria';
  config: Record<string, unknown>;
}

export interface EvaluationInput {
  traceId: string;
  runId?: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
}

export interface EvaluationResult {
  key: string;
  score: number;
  value?: string;
  comment?: string;
  source: Feedback['source'];
}

// ---------------------------------------------------------------------------
// Code evaluators
// ---------------------------------------------------------------------------

function exactMatch(input: EvaluationInput, config: Record<string, unknown>): EvaluationResult {
  const field = (config['field'] as string) ?? 'response';
  const actual = String(input.outputs[field] ?? '');
  const expected = String(input.expectedOutputs?.[field] ?? '');
  const match = actual.trim() === expected.trim();

  return {
    key: 'exact_match',
    score: match ? 1 : 0,
    value: match ? 'pass' : 'fail',
    comment: match ? 'Output matches expected' : `Expected "${expected.slice(0, 100)}", got "${actual.slice(0, 100)}"`,
    source: 'code',
  };
}

function containsMatch(input: EvaluationInput, config: Record<string, unknown>): EvaluationResult {
  const field = (config['field'] as string) ?? 'response';
  const actual = String(input.outputs[field] ?? '').toLowerCase();
  const substring = (config['substring'] as string ?? '').toLowerCase();
  const keywords = config['keywords'] as string[] | undefined;

  if (keywords) {
    const found = keywords.filter((k) => actual.includes(k.toLowerCase()));
    const score = found.length / keywords.length;
    return {
      key: 'contains',
      score,
      value: score === 1 ? 'pass' : 'partial',
      comment: `Found ${found.length}/${keywords.length} keywords`,
      source: 'code',
    };
  }

  const match = actual.includes(substring);
  return {
    key: 'contains',
    score: match ? 1 : 0,
    value: match ? 'pass' : 'fail',
    comment: match ? `Contains "${substring}"` : `Does not contain "${substring}"`,
    source: 'code',
  };
}

function regexMatch(input: EvaluationInput, config: Record<string, unknown>): EvaluationResult {
  const field = (config['field'] as string) ?? 'response';
  const actual = String(input.outputs[field] ?? '');
  const pattern = config['pattern'] as string ?? '';

  try {
    const regex = new RegExp(pattern, (config['flags'] as string) ?? '');
    const match = regex.test(actual);
    return {
      key: 'regex',
      score: match ? 1 : 0,
      value: match ? 'pass' : 'fail',
      comment: match ? `Matches pattern /${pattern}/` : `Does not match pattern /${pattern}/`,
      source: 'code',
    };
  } catch {
    return {
      key: 'regex',
      score: 0,
      value: 'error',
      comment: `Invalid regex pattern: ${pattern}`,
      source: 'code',
    };
  }
}

function jsonMatch(input: EvaluationInput, config: Record<string, unknown>): EvaluationResult {
  const field = (config['field'] as string) ?? 'response';
  const actual = input.outputs[field];
  const expected = input.expectedOutputs?.[field];

  if (expected === undefined) {
    return {
      key: 'json_match',
      score: 0,
      value: 'skip',
      comment: 'No expected output to compare against',
      source: 'code',
    };
  }

  // Deep compare specific keys if specified
  const keys = config['keys'] as string[] | undefined;
  if (keys && typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
    const actualObj = actual as Record<string, unknown>;
    const expectedObj = expected as Record<string, unknown>;
    let matches = 0;
    for (const key of keys) {
      if (JSON.stringify(actualObj[key]) === JSON.stringify(expectedObj[key])) {
        matches++;
      }
    }
    const score = matches / keys.length;
    return {
      key: 'json_match',
      score,
      value: score === 1 ? 'pass' : 'partial',
      comment: `${matches}/${keys.length} keys match`,
      source: 'code',
    };
  }

  const match = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    key: 'json_match',
    score: match ? 1 : 0,
    value: match ? 'pass' : 'fail',
    comment: match ? 'JSON structures match' : 'JSON structures differ',
    source: 'code',
  };
}

// ---------------------------------------------------------------------------
// LLM-as-judge evaluator
// ---------------------------------------------------------------------------

export interface LLMJudgeOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  criteria: string;
  rubric?: string;
}

async function llmCriteriaEval(
  input: EvaluationInput,
  config: Record<string, unknown>,
): Promise<EvaluationResult> {
  const criteria = config['criteria'] as string ?? 'Is the output helpful and accurate?';
  const rubric = config['rubric'] as string ?? '';
  const apiKey = config['apiKey'] as string;
  const model = config['model'] as string ?? 'gpt-4o-mini';
  const baseUrl = config['baseUrl'] as string ?? 'https://api.openai.com/v1';

  if (!apiKey) {
    return {
      key: 'llm_criteria',
      score: 0,
      value: 'error',
      comment: 'No API key provided for LLM evaluator',
      source: 'llm',
    };
  }

  const systemPrompt = `You are an expert evaluator. Score the following output on a scale of 0.0 to 1.0 based on the given criteria.

Criteria: ${criteria}
${rubric ? `\nRubric:\n${rubric}` : ''}

Respond with ONLY a JSON object: {"score": <number>, "reasoning": "<brief explanation>"}`;

  const userPrompt = `Input: ${JSON.stringify(input.inputs)}
Output: ${JSON.stringify(input.outputs)}
${input.expectedOutputs ? `Expected: ${JSON.stringify(input.expectedOutputs)}` : ''}`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        key: 'llm_criteria',
        score: 0,
        value: 'error',
        comment: `LLM API error: ${response.status} ${text.slice(0, 200)}`,
        source: 'llm',
      };
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content ?? '';

    // Parse the JSON response
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { score: number; reasoning: string };
      return {
        key: 'llm_criteria',
        score: Math.max(0, Math.min(1, parsed.score)),
        value: parsed.score >= 0.7 ? 'pass' : parsed.score >= 0.4 ? 'partial' : 'fail',
        comment: parsed.reasoning,
        source: 'llm',
      };
    }

    return {
      key: 'llm_criteria',
      score: 0,
      value: 'error',
      comment: `Could not parse LLM response: ${content.slice(0, 200)}`,
      source: 'llm',
    };
  } catch (err) {
    return {
      key: 'llm_criteria',
      score: 0,
      value: 'error',
      comment: `LLM evaluator failed: ${err instanceof Error ? err.message : String(err)}`,
      source: 'llm',
    };
  }
}

// ---------------------------------------------------------------------------
// Evaluator runner
// ---------------------------------------------------------------------------

const CODE_EVALUATORS: Record<string, (input: EvaluationInput, config: Record<string, unknown>) => EvaluationResult> = {
  exact_match: exactMatch,
  contains: containsMatch,
  regex: regexMatch,
  json_match: jsonMatch,
};

export async function runEvaluator(
  evaluator: EvaluatorConfig,
  input: EvaluationInput,
): Promise<EvaluationResult> {
  if (evaluator.type === 'llm_criteria') {
    return llmCriteriaEval(input, evaluator.config);
  }

  const fn = CODE_EVALUATORS[evaluator.type];
  if (!fn) {
    return {
      key: evaluator.name,
      score: 0,
      value: 'error',
      comment: `Unknown evaluator type: ${evaluator.type}`,
      source: 'code',
    };
  }

  return fn(input, evaluator.config);
}

export async function runEvaluators(
  evaluators: EvaluatorConfig[],
  input: EvaluationInput,
): Promise<Feedback[]> {
  const results: Feedback[] = [];

  for (const evaluator of evaluators) {
    const result = await runEvaluator(evaluator, input);
    results.push({
      id: randomUUID(),
      traceId: input.traceId,
      runId: input.runId,
      key: evaluator.name || result.key,
      score: result.score,
      value: result.value,
      comment: result.comment,
      source: result.source,
      createdAt: new Date(),
    });
  }

  return results;
}
