import type Anthropic from '@anthropic-ai/sdk'

/**
 * Wrapper around client.messages.create that logs one structured line per
 * LLM call: route, model, latency, token usage (including prompt-cache
 * reads/writes), and stop reason. This is the raw material for cost
 * dashboards and latency alerts — searchable in Vercel logs as [llm].
 *
 * Usage: const msg = await tracedMessage('evaluate-answer', client, { ... })
 */
export async function tracedMessage(
  route: string,
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming
): Promise<Anthropic.Message> {
  const startedAt = Date.now()
  try {
    const message = await client.messages.create(params)
    const u = message.usage
    console.log(
      `[llm] ${JSON.stringify({
        route,
        model: params.model,
        latency_ms: Date.now() - startedAt,
        input_tokens: u.input_tokens,
        output_tokens: u.output_tokens,
        cache_read_tokens: u.cache_read_input_tokens ?? 0,
        cache_write_tokens: u.cache_creation_input_tokens ?? 0,
        stop_reason: message.stop_reason,
      })}`
    )
    if (message.stop_reason === 'max_tokens') {
      console.warn(`[llm] ${route}: response truncated at max_tokens=${params.max_tokens} — output may be malformed`)
    }
    return message
  } catch (error) {
    console.error(
      `[llm] ${JSON.stringify({
        route,
        model: params.model,
        latency_ms: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      })}`
    )
    throw error
  }
}
