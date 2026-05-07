import type { Api } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "../../types.js";

type ToolDefinition = Record<string, unknown>;

const ENABLE_ENV = "PI_GOOGLE_CODE_EXECUTION";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isGoogleApi(api: Api | undefined): api is "google-generative-ai" | "google-vertex" {
	return api === "google-generative-ai" || api === "google-vertex";
}

function sanitizeTools(tools: unknown[]): ToolDefinition[] {
	const sanitizedTools: ToolDefinition[] = [];
	for (const tool of tools) {
		if (!isRecord(tool)) {
			continue;
		}

		sanitizedTools.push(tool);
	}
	return sanitizedTools;
}

export function isGoogleCodeExecutionEnabled(): boolean {
	const value = process.env[ENABLE_ENV];
	if (!value) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function addGoogleCodeExecutionToPayload(api: Api | undefined, payload: unknown): unknown {
	if (!isGoogleApi(api)) {
		return payload;
	}

	if (!isGoogleCodeExecutionEnabled()) {
		return payload;
	}

	if (!isRecord(payload)) {
		return payload;
	}

	const tools = Array.isArray(payload.tools) ? payload.tools : [];
	const sanitizedTools = sanitizeTools(tools);

	// Google function tools use `functionDeclarations`, not a `codeExecution` key,
	// so there is no function-tool name conflict to deduplicate here.
	const hasCodeExecution = sanitizedTools.some((tool) => "codeExecution" in tool);
	if (!hasCodeExecution) {
		sanitizedTools.push({ codeExecution: {} });
	}

	return {
		...payload,
		tools: sanitizedTools,
	};
}

export const GOOGLE_CODE_EXECUTION_SECTION = `
## Code Execution

The native code_execution tool is available in this session. The model
runs Python in a Google-managed sandbox. Prefer code_execution for
numerical work, file analysis, and one-off computations when explicit
results are needed.
`;

export default function googleCodeExecutionExtension(pi: ExtensionAPI): void {
	pi.on("before_provider_request", (event, ctx) => {
		return addGoogleCodeExecutionToPayload(ctx.model?.api, event.payload);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (!isGoogleApi(ctx.model?.api)) {
			return undefined;
		}

		if (!isGoogleCodeExecutionEnabled()) {
			return undefined;
		}

		return {
			systemPrompt: `${event.systemPrompt}\n${GOOGLE_CODE_EXECUTION_SECTION}`,
		};
	});
}
