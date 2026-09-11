// @ts-nocheck
// RECOVERED: this source file was missing from git history (never committed) while
// production kept running off a stale compiled dist/ via Docker build cache.
// Reconstructed verbatim from the last known-good compiled output on 2026-09-11.
// TODO: remove @ts-nocheck once someone re-adds proper types for this file.
/**
 * Cliente mínimo pro OpenCode Go (endpoint OpenAI-compatible) — usado só pelo diagnóstico
 * de saúde do admin. Modelo padrão é o mais barato do catálogo Go (mimo-v2.5, ver
 * https://opencode.ai/docs/zen/go — $0.14/$0.28 por 1M tokens), sob demanda, sem streaming.
 */
const OPENCODE_GO_ENDPOINT = "https://opencode.ai/zen/go/v1/chat/completions";
export class AiHealthLlmError extends Error {
}
export async function callOpenCodeGo(prompt) {
    const apiKey = process.env.OPENCODE_GO_API_KEY;
    if (!apiKey)
        throw new AiHealthLlmError("OPENCODE_GO_API_KEY não configurada.");
    const model = process.env.OPENCODE_GO_MODEL || "mimo-v2.5";
    const res = await fetch(OPENCODE_GO_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        // mimo-v2.5 is a reasoning model — it burns tokens on a hidden "reasoning" field
        // before writing `content`. A low max_tokens truncates it mid-thought and leaves
        // `content: null`, so this must stay generous relative to the report length we ask for.
        body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 6000,
        }),
        signal: AbortSignal.timeout(100_000),
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new AiHealthLlmError(`OpenCode Go respondeu ${res.status}: ${body.slice(0, 500)}`);
    }
    const data = (await res.json());
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (content)
        return content;
    if (choice?.finish_reason === "length") {
        throw new AiHealthLlmError("OpenCode Go cortou a resposta antes de terminar (raciocínio consumiu todo o limite de tokens) — tente de novo.");
    }
    throw new AiHealthLlmError("OpenCode Go não retornou conteúdo.");
}
