interface AgentState {
  status: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One sentence on the agents, in the voice of the other screens. */
export function summarizeAgents(agents: AgentState[], available: boolean | null): string {
  if (available === false) return 'The agent manager is off. Turn it on in your config to launch agents.';
  if (agents.length === 0) return 'No agents yet. Launch one to get started.';
  const running = agents.filter((a) => a.status === 'running').length;
  const paused = agents.filter((a) => a.status === 'paused').length;
  const attention = agents.filter((a) => ['error', 'needs_attention', 'budget_exceeded', 'stalled'].includes(a.status)).length;
  const head = `${plural(agents.length, 'agent', 'agents')}, ${running} running and ${paused} paused.`;
  return attention ? `${head} ${attention} ${attention === 1 ? 'needs' : 'need'} attention.` : head;
}
