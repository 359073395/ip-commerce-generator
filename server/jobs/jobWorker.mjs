import { runAgentExecution } from '../agentExecutor.mjs';
import { generateModuleForUser } from '../generationService.mjs';

export async function executeGenerationJob({
  job,
  user,
  project,
  onProgress,
  signal,
  generateModule = generateModuleForUser,
  runAgent = runAgentExecution,
}) {
  if (job.kind === 'agent-run') {
    const executed = await runAgent({
      user,
      project,
      goal: String(job.request.goal || ''),
      maxSteps: Math.max(1, Math.min(Number(job.request.maxSteps) || 4, 4)),
      onProgress,
      signal,
    });
    if (executed.status === 'failed') {
      const failedStep = [...(executed.steps || [])].reverse().find((step) => step.status === 'failed');
      const error = new Error(failedStep?.error?.message || 'Agent执行链未完成。');
      error.code = failedStep?.error?.code || 'AGENT_RUN_FAILED';
      throw error;
    }
    return {
      status: executed.status === 'completed'
        ? 'completed'
        : executed.status === 'cancelled'
          ? 'cancelled'
          : 'needs_review',
      result: executed,
    };
  }

  const generated = await generateModule({
    user,
    project,
    requestBody: job.request,
    onProgress,
    signal,
  });
  return {
    status: 'completed',
    result: {
      module: generated.module,
      result: generated.result,
      record: generated.record,
    },
  };
}
