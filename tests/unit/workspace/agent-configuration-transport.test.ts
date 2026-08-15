import { describe, expect, it } from "vitest";
import { isAgentConfigurationTransportError } from "@/components/workspace/workspace-conversation";

describe("agent configuration transport recovery", () => {
  it("recognizes only the safe local configuration envelope", () => {
    expect(isAgentConfigurationTransportError(new Error('{"error":{"code":"agent_configuration_unavailable","details":{"adminPath":"/admin/agents"}}}'))).toBe(true);
    expect(isAgentConfigurationTransportError(new Error("request failed: {\"error\":{\"code\":\"agent_configuration_unavailable\",\"details\":{\"adminPath\":\"/admin/agents\"}}}"))).toBe(true);
    expect(isAgentConfigurationTransportError(new Error('{"error":{"code":"internal_error","details":{"adminPath":"/admin/agents"}}}'))).toBe(false);
    expect(isAgentConfigurationTransportError(new Error("provider said: secret details"))).toBe(false);
  });
});
