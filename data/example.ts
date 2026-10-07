import { StateGraph } from "@langchain/langgraph"

src/graph/production-Graph 

const graph = new StateGraph(GraphState)
.addNode("contexto", contextNode)
.addNode("roteador", routerNode)
.addNode("react", reactNode)
.addNode("planExecute", planExecuteNode)
.addNode("reflect", reflectNode)
.addNode("resposta", answerNode)
.addEdge("START", "contexto")
.addConditionalEdges("roteador", (s) => s.route, {
    "react": "react",
    "planExecute": "planExecute",
    "reflect": "reflect"
})
.addEdge("react", "resposta")
.addEdge("planExecute", "resposta")
.addEdge("reflect", "resposta")
.addEdge("resposta", "END")
.compile()



//parte esquema

const routeSchema = z.object({
    route: z.enum(["react", "planExecute", "reflect"]),
    reason: z.string().describe('uma frase justificando a escolha')
})

async function routerNode(state: typeof GraphState.State) {
    const verdict = await CohereAsrPreTrainedModel().withSturcturedOutput(routerSchema).invoke([
        ["system", SYSTEM_PROMPT],
        ["user", state.input],
    ])
    trace.push({
        node: "roteador",
        type: "route",
        route: verdict.route,
        reason: verdict.reason,
    })
    return { route: verdict.route }
}