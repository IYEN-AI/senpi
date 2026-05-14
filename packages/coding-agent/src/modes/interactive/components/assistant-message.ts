import type { AssistantMessage, ProviderNativeContent } from "@earendil-works/pi-ai";
import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@earendil-works/pi-tui";
import { getMarkdownTheme, theme } from "../theme/theme.js";

const OSC133_ZONE_START = "\x1b]133;A\x07";
const OSC133_ZONE_END = "\x1b]133;B\x07";
const OSC133_ZONE_FINAL = "\x1b]133;C\x07";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
	const value = record?.[key];
	return typeof value === "string" ? value : undefined;
}

function formatProviderName(message: AssistantMessage): string {
	return message.provider ? `${message.provider} · ` : "";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function getWebSearchResults(raw: unknown): Record<string, unknown>[] | undefined {
	if (!isRecord(raw) || !Array.isArray(raw.content)) {
		return undefined;
	}

	return raw.content.filter(isRecord).filter((item) => readString(item, "type") === "web_search_result");
}

/**
 * Component that renders a complete assistant message
 */
export class AssistantMessageComponent extends Container {
	private cachedLines?: string[];
	private cachedSignature?: string;
	private cachedWidth?: number;
	private contentContainer: Container;
	private hideThinkingBlock: boolean;
	private markdownTheme: MarkdownTheme;
	private hiddenThinkingLabel: string;
	private lastMessage?: AssistantMessage;
	private lastMessageSignature?: string;
	private hasToolCalls = false;
	private expanded = false;

	constructor(
		message?: AssistantMessage,
		hideThinkingBlock = false,
		markdownTheme: MarkdownTheme = getMarkdownTheme(),
		hiddenThinkingLabel = "Thinking...",
	) {
		super();

		this.hideThinkingBlock = hideThinkingBlock;
		this.markdownTheme = markdownTheme;
		this.hiddenThinkingLabel = hiddenThinkingLabel;

		// Container for text/thinking content
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);

		if (message) {
			this.updateContent(message);
		}
	}

	override invalidate(): void {
		this.invalidateRenderCache();
		super.invalidate();
		if (this.lastMessage) {
			this.lastMessageSignature = undefined;
			this.updateContent(this.lastMessage);
		}
	}

	setHideThinkingBlock(hide: boolean): void {
		if (this.hideThinkingBlock === hide) return;
		this.hideThinkingBlock = hide;
		if (this.lastMessage) {
			this.lastMessageSignature = undefined;
			this.updateContent(this.lastMessage);
		}
	}

	setHiddenThinkingLabel(label: string): void {
		if (this.hiddenThinkingLabel === label) return;
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.lastMessageSignature = undefined;
			this.updateContent(this.lastMessage);
		}
	}

	setExpanded(expanded: boolean): void {
		if (this.expanded === expanded) {
			return;
		}
		this.expanded = expanded;
		if (this.lastMessage) {
			this.lastMessageSignature = undefined;
			this.updateContent(this.lastMessage);
		}
	}

	override render(width: number): string[] {
		const signature = this.lastMessageSignature ?? "";
		if (this.cachedLines && this.cachedWidth === width && this.cachedSignature === signature) {
			return [...this.cachedLines];
		}

		const lines = super.render(width);
		if (this.hasToolCalls || lines.length === 0) {
			this.cacheRender(width, signature, lines);
			return lines;
		}

		lines[0] = OSC133_ZONE_START + lines[0];
		lines[lines.length - 1] = OSC133_ZONE_END + OSC133_ZONE_FINAL + lines[lines.length - 1];
		this.cacheRender(width, signature, lines);
		return lines;
	}

	updateContent(message: AssistantMessage): void {
		this.lastMessage = message;
		const messageSignature = this.createMessageSignature(message);
		if (this.lastMessageSignature === messageSignature) {
			return;
		}
		this.lastMessageSignature = messageSignature;
		this.invalidateRenderCache();

		// Clear content container
		this.contentContainer.clear();

		const hasVisibleContent = message.content.some(
			(c) =>
				(c.type === "text" && c.text.trim()) ||
				(c.type === "thinking" && c.thinking.trim()) ||
				c.type === "providerNative",
		);

		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		// Render content in order
		for (let i = 0; i < message.content.length; i++) {
			const content = message.content[i];
			if (content.type === "text" && content.text.trim()) {
				// Assistant text messages with no background - trim the text
				// Set paddingY=0 to avoid extra spacing before tool executions
				this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme));
			} else if (content.type === "thinking" && content.thinking.trim()) {
				// Add spacing only when another visible assistant content block follows.
				// This avoids a superfluous blank line before separately-rendered tool execution blocks.
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some((c) => (c.type === "text" && c.text.trim()) || (c.type === "thinking" && c.thinking.trim()));

				if (this.hideThinkingBlock) {
					// Show static thinking label when hidden
					this.contentContainer.addChild(
						new Text(theme.italic(theme.fg("thinkingText", this.hiddenThinkingLabel)), 1, 0),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				} else {
					// Thinking traces in thinkingText color, italic
					this.contentContainer.addChild(
						new Markdown(content.thinking.trim(), 1, 0, this.markdownTheme, {
							color: (text: string) => theme.fg("thinkingText", text),
							italic: true,
						}),
					);
					if (hasVisibleContentAfter) {
						this.contentContainer.addChild(new Spacer(1));
					}
				}
			} else if (content.type === "providerNative") {
				this.contentContainer.addChild(
					new Text(theme.fg("muted", this.formatProviderNativeSummary(message, content)), 1, 0),
				);
				this.contentContainer.addChild(
					new Text(theme.fg("dim", this.formatProviderNativeBody(content, this.expanded)), 3, 0),
				);
				const hasVisibleContentAfter = message.content
					.slice(i + 1)
					.some(
						(c) =>
							(c.type === "text" && c.text.trim()) ||
							(c.type === "thinking" && c.thinking.trim()) ||
							c.type === "providerNative",
					);
				if (hasVisibleContentAfter) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		// Check if aborted - show after partial content
		// But only if there are no tool calls (tool execution components will show the error)
		const hasToolCalls = message.content.some((c) => c.type === "toolCall");
		this.hasToolCalls = hasToolCalls;
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				if (hasVisibleContent) {
					this.contentContainer.addChild(new Spacer(1));
				} else {
					this.contentContainer.addChild(new Spacer(1));
				}
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMsg = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMsg}`), 1, 0));
			}
		}
	}

	private createMessageSignature(message: AssistantMessage): string {
		return JSON.stringify({
			content: message.content,
			hiddenThinkingLabel: this.hiddenThinkingLabel,
			hideThinkingBlock: this.hideThinkingBlock,
			errorMessage: message.errorMessage,
			stopReason: message.stopReason,
		});
	}

	private cacheRender(width: number, signature: string, lines: string[]): void {
		this.cachedWidth = width;
		this.cachedSignature = signature;
		this.cachedLines = [...lines];
	}

	private invalidateRenderCache(): void {
		this.cachedLines = undefined;
		this.cachedSignature = undefined;
		this.cachedWidth = undefined;
	}

	private formatProviderNativeSummary(message: AssistantMessage, content: ProviderNativeContent): string {
		const specialized = this.formatSpecializedProviderNativeSummary(message, content);
		if (specialized) {
			return specialized;
		}

		const provider = formatProviderName(message);
		const marker = this.expanded ? "▾" : "▸";
		return `${marker} ${provider}providerNative · ${content.subtype}`;
	}

	private formatProviderNativeBody(content: ProviderNativeContent, expanded: boolean): string {
		const specialized = this.formatSpecializedProviderNativeBody(content);
		if (specialized) {
			return specialized;
		}

		const rawJson = this.stringifyProviderNative(content.raw);
		if (expanded || rawJson.length <= 2000) {
			return rawJson;
		}
		return `${rawJson.slice(0, 2000)}…`;
	}

	private formatSpecializedProviderNativeSummary(
		message: AssistantMessage,
		content: ProviderNativeContent,
	): string | undefined {
		const provider = formatProviderName(message);
		const marker = this.expanded ? "▾" : "▸";
		if (content.subtype === "server_tool_use") {
			const raw = isRecord(content.raw) ? content.raw : undefined;
			const name = readString(raw, "name");
			if (name) {
				return `${marker} ${provider}${name} · server_tool_use`;
			}
		}
		if (content.subtype === "web_search_tool_result") {
			return `${marker} ${provider}web_search results`;
		}
		return undefined;
	}

	private formatSpecializedProviderNativeBody(content: ProviderNativeContent): string | undefined {
		if (content.subtype === "server_tool_use") {
			return this.formatServerToolUseBody(content.raw);
		}
		if (content.subtype === "web_search_tool_result") {
			return this.formatWebSearchResultBody(content.raw);
		}
		return undefined;
	}

	private formatServerToolUseBody(raw: unknown): string | undefined {
		const record = isRecord(raw) ? raw : undefined;
		const input = isRecord(record?.input) ? record.input : undefined;
		const query = readString(input, "query");
		if (query) {
			return `query: ${JSON.stringify(query)}`;
		}
		const name = readString(record, "name");
		if (name) {
			return `name: ${name}`;
		}
		return undefined;
	}

	private formatWebSearchResultBody(raw: unknown): string | undefined {
		const results = getWebSearchResults(raw);
		if (!results) {
			return undefined;
		}
		if (results.length === 0) {
			return "0 results";
		}

		const lines = [pluralize(results.length, "result")];
		const visibleResults = this.expanded ? results : results.slice(0, 3);
		for (const result of visibleResults) {
			const title = readString(result, "title");
			const url = readString(result, "url");
			if (title && url) {
				lines.push(`${title} ${url}`);
			} else if (title) {
				lines.push(title);
			} else if (url) {
				lines.push(url);
			}
		}
		if (!this.expanded && results.length > visibleResults.length) {
			lines.push(`… ${results.length - visibleResults.length} more results`);
		}
		return lines.join("\n");
	}

	private stringifyProviderNative(raw: unknown): string {
		try {
			return JSON.stringify(raw, null, 2) ?? "null";
		} catch {
			return String(raw);
		}
	}
}
