/**
 * Composition reference for semantic memory + learning reflector.
 *
 * Recall (006):
 *   const q = await embed(query)
 *   return memoriesFor(userId)
 *     .map(m => ({ ...m, score: dot(q, m.embedding) }))
 *     .filter(m => m.score >= 0.3)
 *     .sort((a, b) => b.score - a.score)
 *     .slice(0, 3)
 *
 * HTTP: POST /chat with optional userId → recall → inject [Relevant memories]
 * into prompt → after 200, scheduleLearning (reflect → memories.remember async).
 * Agent tool forget_preference: recall top-1 → forget(id) using request userId.
 */
export {};
