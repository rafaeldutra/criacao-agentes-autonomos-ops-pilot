/**
 * Referência da composição de chat (implementada em src/http/server.ts → runChat).
 *
 * Fluxo:
 * 1. conversationId opcional ou create()
 * 2. lastMessages(conversationId, 12)
 * 3. append(user) → strategy.run(compose(history, message)) → append(assistant)
 * 4. resposta com conversationId e metrics.historyMessages = history.length
 */
export {};
