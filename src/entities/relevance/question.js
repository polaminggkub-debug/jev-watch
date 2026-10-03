// "Does the agent need to read this file?" asked of Jev, so the agent can skip
// files without loading them into its own context.

import { decide } from '../../shared/jev/index.js';

const RELEVANCE_QUESTION = {
  type: 'choice',
  instructions:
    'A coding agent is about to work on `task`. `content` is the file at `path`. ' +
    'Does the agent need to read this file to do the task well?',
  criteria: {
    must_read: 'Directly relevant: the agent would edit it, or needs its logic, API or config to do the task correctly',
    skim: 'Background at most: the agent can get by with the file name and a glance',
    skip: 'Unrelated to the task',
  },
};

export function relevanceRequest({ task, path, content }) {
  return { state: { task: task.slice(0, 1500), path, content }, questions: { relevance: RELEVANCE_QUESTION } };
}

export async function askRelevance(input, clientOpts) {
  const res = await decide(relevanceRequest(input), clientOpts);
  if (res.error) return res;
  const answer = res.answers.relevance || {};
  return { choice: answer.choice, probabilities: answer.probabilities || {}, usage: res.usage, ms: res.ms };
}

// Skipping a needed file is the costly mistake, so only a confident "skip" skips.
// Doubt, a missing answer or an API error all mean read.
export function readVerdict(answer, { skipAt = 0.8 } = {}) {
  if (!answer || answer.error) return { verdict: 'read', p: null, reason: answer?.error || 'no_answer' };
  const p = answer.probabilities;
  if ((p.skip || 0) >= skipAt) return { verdict: 'skip', p: p.skip };
  if (answer.choice === 'skim' && (p.skim || 0) >= 0.5) return { verdict: 'skim', p: p.skim };
  return { verdict: 'read', p: p.must_read ?? null };
}
