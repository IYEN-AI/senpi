import { afterEach, describe, expect, it } from "vitest";
import googleCodeExecutionExtension, {
	addGoogleCodeExecutionToPayload,
	GOOGLE_CODE_EXECUTION_SECTION,
	isGoogleCodeExecutionEnabled,
} from "../../src/core/extensions/builtin/google-code-execution/index.js";
import type { ExtensionAPI } from "../../src/core/extensions/types.js";

const ENABLE_ENV = "PI_GOOGLE_CODE_EXECUTION";

afterEach(() => {
	delete process.env[ENABLE_ENV];
});

describe("google-code-execution builtin extension", () => {
	it("is a no-op when api is anthropic-messages", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [{ codeExecution: {} }],
		};

		const result = addGoogleCodeExecutionToPayload("anthropic-messages", payload);

		expect(result).toBe(payload);
	});

	it("is a no-op when api is openai-responses", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [{ codeExecution: {} }],
		};

		const result = addGoogleCodeExecutionToPayload("openai-responses", payload);

		expect(result).toBe(payload);
	});

	it("is a no-op when api is openai-completions", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [{ codeExecution: {} }],
		};

		const result = addGoogleCodeExecutionToPayload("openai-completions", payload);

		expect(result).toBe(payload);
	});

	it("is a no-op when env is unset on google-generative-ai", () => {
		const payload = {
			tools: [{ functionDeclarations: [{ name: "lookup", description: "fn", parameters: { type: "object" } }] }],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload);

		expect(result).toBe(payload);
	});

	it.each(["0", "false", "no", "off", ""])("is a no-op when env is explicitly disabled (%s)", (value) => {
		process.env[ENABLE_ENV] = value;
		const payload = {
			tools: [{ functionDeclarations: [{ name: "lookup", description: "fn", parameters: { type: "object" } }] }],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload);
		expect(result).toBe(payload);
	});

	it("injects { codeExecution: {} } when api is google-generative-ai and env truthy", () => {
		process.env[ENABLE_ENV] = "1";
		const payload = {
			tools: [],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		expect(result.tools).toEqual([{ codeExecution: {} }]);
	});

	it("injects { codeExecution: {} } when api is google-vertex and env truthy", () => {
		process.env[ENABLE_ENV] = "true";
		const payload = {
			tools: [],
		};

		const result = addGoogleCodeExecutionToPayload("google-vertex", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		expect(result.tools).toEqual([{ codeExecution: {} }]);
	});

	it("preserves caller-supplied { codeExecution: {} } without duplication", () => {
		process.env[ENABLE_ENV] = "yes";
		const payload = {
			tools: [{ codeExecution: {} }],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		const codeExecutionTools = result.tools.filter((tool) => "codeExecution" in tool);
		expect(codeExecutionTools).toHaveLength(1);
		expect(codeExecutionTools[0]).toEqual({ codeExecution: {} });
	});

	it("preserves caller-supplied { codeExecution: { ... } } without overwriting", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [{ codeExecution: { sandbox: "future-config" } }],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		const codeExecutionTools = result.tools.filter((tool) => "codeExecution" in tool);
		expect(codeExecutionTools).toHaveLength(1);
		expect(codeExecutionTools[0]).toEqual({ codeExecution: { sandbox: "future-config" } });
	});

	it("adds separate codeExecution tool object when caller has functionDeclarations", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [{ functionDeclarations: [{ name: "lookup", description: "fn", parameters: { type: "object" } }] }],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		expect(result.tools).toHaveLength(2);
		expect(result.tools[0]).toEqual({
			functionDeclarations: [{ name: "lookup", description: "fn", parameters: { type: "object" } }],
		});
		expect(result.tools[1]).toEqual({ codeExecution: {} });
	});

	it("preserves both tool objects when functionDeclarations and codeExecution already exist", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [
				{ functionDeclarations: [{ name: "lookup", description: "fn", parameters: { type: "object" } }] },
				{ codeExecution: {} },
			],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		expect(result.tools).toHaveLength(2);
		expect(result.tools).toEqual(payload.tools);
	});

	it("injects single entry when tools array is empty", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			tools: [],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			tools: Array<Record<string, unknown>>;
		};

		expect(result.tools).toEqual([{ codeExecution: {} }]);
	});

	it("creates tools array when payload has no tools field", () => {
		process.env[ENABLE_ENV] = "on";
		const payload = {
			temperature: 0.2,
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload) as {
			temperature: number;
			tools: Array<Record<string, unknown>>;
		};

		expect(result.temperature).toBe(0.2);
		expect(result.tools).toEqual([{ codeExecution: {} }]);
	});

	it("returns new payload object when injecting", () => {
		process.env[ENABLE_ENV] = "1";
		const payload = {
			tools: [],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload);

		expect(result).not.toBe(payload);
	});

	it("returns original payload reference when no-op", () => {
		const payload = {
			tools: [],
		};

		const result = addGoogleCodeExecutionToPayload("google-generative-ai", payload);

		expect(result).toBe(payload);
	});
});

describe("isGoogleCodeExecutionEnabled", () => {
	it("returns false when env is unset", () => {
		expect(isGoogleCodeExecutionEnabled()).toBe(false);
	});

	it.each(["1", "true", "yes", "on", " TRUE ", "Yes", "ON", "  on  "])("returns true for truthy value %s", (value) => {
		process.env[ENABLE_ENV] = value;
		expect(isGoogleCodeExecutionEnabled()).toBe(true);
	});

	it.each(["", "0", "false", "no", "off", "garbage", "enable", "enabled", "2"])(
		"returns false for falsy or unknown value %s",
		(value) => {
			process.env[ENABLE_ENV] = value;
			expect(isGoogleCodeExecutionEnabled()).toBe(false);
		},
	);
});

describe("GOOGLE_CODE_EXECUTION_SECTION", () => {
	it("is non-empty and mentions code execution", () => {
		expect(GOOGLE_CODE_EXECUTION_SECTION.trim().length).toBeGreaterThan(0);
		expect(GOOGLE_CODE_EXECUTION_SECTION.toLowerCase()).toContain("code_execution");
	});
});

describe("googleCodeExecutionExtension", () => {
	it("registers hooks and appends section on google model when enabled", async () => {
		process.env[ENABLE_ENV] = "on";

		const beforeProviderHandlers: Array<(...args: unknown[]) => unknown> = [];
		const beforeAgentHandlers: Array<(...args: unknown[]) => unknown> = [];

		const fakePi: ExtensionAPI = {
			on(eventName: string, handler: unknown) {
				if (eventName === "before_provider_request") {
					beforeProviderHandlers.push(handler as (...args: unknown[]) => unknown);
				}

				if (eventName === "before_agent_start") {
					beforeAgentHandlers.push(handler as (...args: unknown[]) => unknown);
				}
			},
		} as ExtensionAPI;

		googleCodeExecutionExtension(fakePi);

		expect(beforeProviderHandlers).toHaveLength(1);
		expect(beforeAgentHandlers).toHaveLength(1);
		const providerHandler = beforeProviderHandlers[0];
		const agentHandler = beforeAgentHandlers[0];
		expect(providerHandler).toBeDefined();
		expect(agentHandler).toBeDefined();
		if (!providerHandler || !agentHandler) {
			throw new Error("Expected handlers to be registered");
		}

		const providerResult = providerHandler(
			{ payload: { tools: [] } },
			{ model: { api: "google-generative-ai" } },
		) as { tools: Array<Record<string, unknown>> };
		expect(providerResult.tools).toContainEqual({ codeExecution: {} });

		const promptResult = (await agentHandler(
			{ systemPrompt: "base prompt" },
			{ model: { api: "google-generative-ai" } },
		)) as { systemPrompt: string };
		expect(promptResult.systemPrompt).toContain("base prompt");
		expect(promptResult.systemPrompt).toContain("## Code Execution");
	});
});
