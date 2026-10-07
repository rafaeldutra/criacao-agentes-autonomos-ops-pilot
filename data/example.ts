import { process } from "zod/v4/core";

export function createModel() {
    const primary = baseModel(process.env.OPENROUTER_MODEL!).withRety({ stopAfterAttempt: 2})
    const backup = baseModel(process.env.OPERNROUTER_MODEL_FALLBACK!).withRety({ stopAfterAttemp: 2 })
    return primary.withFallback(backup)
}