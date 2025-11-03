const { Annotation } = require("@langchain/core/messages");
const { BaseMessage } = require("@langchain/langgraph");

export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
  }),
});

// TypeScript's `export type AgentState = typeof AgentState.State`
// has no runtime equivalent in JS, so we simply omit it.

export function createAgentState() {
  return AgentState.spec;
}
