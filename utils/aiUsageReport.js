// Sends Claude token usage to Haustable, which prices it and shows one estimated
// AI bill for both bots in the back office (Analytics tab, "ค่า AI ประมาณการ").
// Env: HAUSTABLE_AI_USAGE_URL (the ai-usage-ingest function URL) and AI_USAGE_KEY
// (same value as the AI_USAGE_KEY secret there). Without them nothing is sent.
// Never throws and waits at most 1.5 s, so a slow report cannot hold up a reply.

export async function reportAiUsage({ feature, model, usage }) {
    const url = process.env.HAUSTABLE_AI_USAGE_URL;
    const key = process.env.AI_USAGE_KEY;
    if (!url || !key || !usage) return;
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-usage-key": key },
            body: JSON.stringify({
                feature,
                model,
                usage: {
                    input_tokens: usage.input_tokens,
                    output_tokens: usage.output_tokens,
                    cache_read_input_tokens: usage.cache_read_input_tokens,
                    cache_creation_input_tokens: usage.cache_creation_input_tokens,
                },
            }),
            signal: AbortSignal.timeout(1500),
        });
    } catch (err) {
        console.warn("[ai usage] report failed:", err?.message || err);
    }
}
