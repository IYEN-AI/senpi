import { describe, expect, it, vi } from "vitest";
import { getModel } from "../src/models.js";
import { streamAnthropic } from "../src/providers/anthropic.js";
import type { Context } from "../src/types.js";

const mockState = vi.hoisted(() => ({
	createParams: undefined as Record<string, unknown> | undefined,
	requestOptions: undefined as Record<string, unknown> | undefined,
}));

vi.mock("@anthropic-ai/sdk", () => {
	function createSseResponse(): Response {
		const body = [
			`event: message_start\ndata: ${JSON.stringify({
				type: "message_start",
				message: {
					id: "msg_test",
					usage: { input_tokens: 10, output_tokens: 0 },
				},
			})}\n`,
			`event: message_delta\ndata: ${JSON.stringify({
				type: "message_delta",
				delta: { stop_reason: "end_turn" },
				usage: { output_tokens: 5 },
			})}\n`,
			`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n`,
		].join("\n");

		return new Response(body, {
			status: 200,
			headers: { "content-type": "text/event-stream" },
		});
	}

	class FakeAnthropic {
		messages = {
			create: (params: Record<string, unknown>, requestOptions: Record<string, unknown>) => {
				mockState.createParams = params;
				mockState.requestOptions = requestOptions;
				return {
					asResponse: async () => createSseResponse(),
				};
			},
		};
	}

	return { default: FakeAnthropic };
});

describe("Anthropic onPayload request metadata", () => {
	const context: Context = {
		messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
	};

	it("forwards hook-added headers to SDK request options without leaking metadata into the body", async () => {
		const model = getModel("anthropic", "claude-sonnet-4-5");

		const stream = streamAnthropic(model, context, {
			apiKey: "fake-key",
			onPayload: (payload) => ({
				...(payload as Record<string, unknown>),
				headers: { "anthropic-beta": "computer-use-2025-01-24" },
				extra_body: { betas: ["computer-use-2025-01-24"] },
			}),
		});

		await stream.result();

		expect(mockState.requestOptions?.headers).toEqual({ "anthropic-beta": "computer-use-2025-01-24" });
		expect(mockState.createParams).not.toHaveProperty("headers");
		expect(mockState.createParams).not.toHaveProperty("extra_body");
	});
});
