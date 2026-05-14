import type { AssistantMessage } from "@earendil-works/pi-ai";
import { describe, expect, test } from "vitest";
import { AssistantMessageComponent } from "../src/modes/interactive/components/assistant-message.js";
import { initTheme } from "../src/modes/interactive/theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function createAssistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "openai-responses",
		provider: "openai",
		model: "gpt-4o-mini",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

describe("AssistantMessageComponent", () => {
	test("adds OSC 133 zone markers to assistant messages without tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(createAssistantMessage([{ type: "text", text: "hello" }]));
		const lines = component.render(40);

		expect(lines).not.toHaveLength(0);
		expect(lines[0]).toContain(OSC133_ZONE_START);
		expect(lines[lines.length - 1].startsWith(OSC133_ZONE_END + OSC133_ZONE_FINAL)).toBe(true);
	});

	test("does not add OSC 133 zone markers when assistant message contains tool calls", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([
				{ type: "text", text: "calling tool" },
				{ type: "toolCall", id: "tool-1", name: "read", arguments: { path: "file.txt" } },
			]),
		);
		const rendered = component.render(60).join("\n");

		expect(rendered.includes(OSC133_ZONE_START)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_END)).toBe(false);
		expect(rendered.includes(OSC133_ZONE_FINAL)).toBe(false);
	});

	test("renders providerNative content with collapsed and expanded states", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent(
			createAssistantMessage([
				{
					type: "providerNative",
					subtype: "web_search",
					raw: {
						items: Array.from({ length: 60 }, (_, index) => ({
							id: index,
							title: `Result ${index}`,
						})),
					},
				},
			]),
		);

		const collapsed = component.render(120).join("\n");
		expect(collapsed).toContain("▸ openai · providerNative · web_search");
		expect(collapsed).toContain("…");

		component.setExpanded(true);
		const expanded = component.render(120).join("\n");
		expect(expanded).toContain("▾ openai · providerNative · web_search");
		expect(expanded).toContain('"title": "Result 59"');
	});

	test("renders Anthropic server web search calls as compact providerNative summaries", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent({
			...createAssistantMessage([
				{
					type: "providerNative",
					subtype: "server_tool_use",
					raw: {
						type: "server_tool_use",
						id: "srvtoolu_123",
						name: "web_search",
						input: { query: "latest ast-grep release" },
					},
				},
			]),
			api: "anthropic-messages",
			provider: "anthropic",
		});

		const rendered = component.render(120).join("\n");
		expect(rendered).toContain("▸ anthropic · web_search · server_tool_use");
		expect(rendered).toContain('query: "latest ast-grep release"');
		expect(rendered).not.toContain('"type": "server_tool_use"');
	});

	test("renders Anthropic web search results without dumping encrypted payloads", () => {
		initTheme("dark");

		const component = new AssistantMessageComponent({
			...createAssistantMessage([
				{
					type: "providerNative",
					subtype: "web_search_tool_result",
					raw: {
						type: "web_search_tool_result",
						tool_use_id: "srvtoolu_123",
						content: [
							{
								type: "web_search_result",
								title: "ast-grep documentation",
								url: "https://ast-grep.github.io/",
								encrypted_content: "secret-payload",
							},
							{
								type: "web_search_result",
								title: "ast-grep releases",
								url: "https://github.com/ast-grep/ast-grep/releases",
							},
						],
					},
				},
			]),
			api: "anthropic-messages",
			provider: "anthropic",
		});

		const rendered = component.render(160).join("\n");
		expect(rendered).toContain("▸ anthropic · web_search results");
		expect(rendered).toContain("2 results");
		expect(rendered).toContain("ast-grep documentation");
		expect(rendered).toContain("https://ast-grep.github.io/");
		expect(rendered).not.toContain("secret-payload");
		expect(rendered).not.toContain("encrypted_content");
	});
});
