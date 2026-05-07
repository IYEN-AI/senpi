import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { TextContent } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import {
	ANTHROPIC_TEXT_EDITOR_SECTION,
	addAnthropicTextEditorToPayload,
	executeTextEditorCommand,
	isAnthropicTextEditorEnabled,
} from "../../src/core/extensions/builtin/anthropic-text-editor/index.js";

const ANTHROPIC_TEXT_EDITOR_ENV = "PI_ANTHROPIC_TEXT_EDITOR";

const tempDirectories = new Set<string>();

async function makeTempDirectory(): Promise<string> {
	const directoryPath = await mkdtemp(path.join(tmpdir(), "anthropic-text-editor-test-"));
	tempDirectories.add(directoryPath);
	return directoryPath;
}

afterEach(async () => {
	delete process.env[ANTHROPIC_TEXT_EDITOR_ENV];
	await Promise.all(
		[...tempDirectories].map(async (directoryPath) => {
			await rm(directoryPath, { recursive: true, force: true });
		}),
	);
	tempDirectories.clear();
});

describe("anthropic-text-editor builtin extension", () => {
	it("is a no-op when env var is unset", () => {
		const payload = { tools: [{ name: "read", description: "function read" }] };
		const result = addAnthropicTextEditorToPayload("anthropic-messages", payload);
		expect(result).toBe(payload);
	});

	it("is a no-op for explicitly disabled env values", () => {
		const payload = { tools: [{ name: "read", description: "function read" }] };
		for (const envValue of ["0", "false", "no", "off", ""] as const) {
			process.env[ANTHROPIC_TEXT_EDITOR_ENV] = envValue;
			expect(addAnthropicTextEditorToPayload("anthropic-messages", payload)).toBe(payload);
		}
	});

	it("is a no-op when api is openai-responses", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "on";
		const payload = { tools: [{ name: "read", description: "function read" }] };
		const result = addAnthropicTextEditorToPayload("openai-responses", payload);
		expect(result).toBe(payload);
	});

	it("is a no-op when api is google-generative-ai", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "on";
		const payload = { tools: [{ name: "read", description: "function read" }] };
		const result = addAnthropicTextEditorToPayload("google-generative-ai", payload);
		expect(result).toBe(payload);
	});

	it("injects native text_editor_20250728 when enabled and no native tool exists", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "true";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ name: "grep", description: "function grep" }],
		}) as { tools: Array<Record<string, unknown>> };

		expect(result.tools).toContainEqual({
			type: "text_editor_20250728",
			name: "str_replace_based_edit_tool",
		});
	});

	it("strips function-shape str_replace_based_edit_tool and replaces with native", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "true";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [
				{ name: "str_replace_based_edit_tool", input_schema: { type: "object" } },
				{ name: "grep", description: "function grep" },
			],
		}) as { tools: Array<Record<string, unknown>> };

		expect(result.tools).toContainEqual({
			type: "text_editor_20250728",
			name: "str_replace_based_edit_tool",
		});
		expect(result.tools).not.toContainEqual({
			name: "str_replace_based_edit_tool",
			input_schema: { type: "object" },
		});
	});

	it("strips function-shape read", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "1";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ name: "read", input_schema: { type: "object" } }],
		}) as { tools: Array<Record<string, unknown>> };
		expect(result.tools.some((tool) => tool.name === "read")).toBe(false);
	});

	it("strips function-shape write", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "1";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ name: "write", input_schema: { type: "object" } }],
		}) as { tools: Array<Record<string, unknown>> };
		expect(result.tools.some((tool) => tool.name === "write")).toBe(false);
	});

	it("strips function-shape edit", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "1";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ name: "edit", input_schema: { type: "object" } }],
		}) as { tools: Array<Record<string, unknown>> };
		expect(result.tools.some((tool) => tool.name === "edit")).toBe(false);
	});

	it("preserves caller-supplied text_editor_20250728 without duplication", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "yes";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ type: "text_editor_20250728", name: "str_replace_based_edit_tool" }],
		}) as { tools: Array<Record<string, unknown>> };

		const nativeTools = result.tools.filter((tool) => tool.type === "text_editor_20250728");
		expect(nativeTools).toHaveLength(1);
	});

	it("preserves caller-supplied text_editor_20250728 with older name variant", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "yes";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [{ type: "text_editor_20250728", name: "str_replace_editor" }],
		}) as { tools: Array<Record<string, unknown>> };

		expect(result.tools).toContainEqual({ type: "text_editor_20250728", name: "str_replace_editor" });
		const nativeTools = result.tools.filter((tool) => tool.type === "text_editor_20250728");
		expect(nativeTools).toHaveLength(1);
	});

	it("does not strip read/write/edit when env disabled", () => {
		const payload = {
			tools: [{ name: "read" }, { name: "write" }, { name: "edit" }],
		};
		const result = addAnthropicTextEditorToPayload("anthropic-messages", payload) as {
			tools: Array<Record<string, unknown>>;
		};
		expect(result.tools).toEqual(payload.tools);
	});

	it("does not strip read/write/edit when api does not match", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "true";
		const payload = {
			tools: [{ name: "read" }, { name: "write" }, { name: "edit" }],
		};
		const result = addAnthropicTextEditorToPayload("openai-responses", payload) as {
			tools: Array<Record<string, unknown>>;
		};
		expect(result.tools).toEqual(payload.tools);
	});

	it("preserves other tools untouched", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "true";
		const result = addAnthropicTextEditorToPayload("anthropic-messages", {
			tools: [
				{ name: "bash", type: "bash_20250124" },
				{ name: "grep", description: "function grep" },
			],
		}) as { tools: Array<Record<string, unknown>> };

		expect(result.tools).toContainEqual({ name: "bash", type: "bash_20250124" });
		expect(result.tools).toContainEqual({ name: "grep", description: "function grep" });
	});

	it("isAnthropicTextEditorEnabled returns false when env unset", () => {
		expect(isAnthropicTextEditorEnabled()).toBe(false);
	});

	it("isAnthropicTextEditorEnabled returns correct truthy/falsy values", () => {
		for (const envValue of ["1", "true", "yes", "on", " TRUE ", "\tYes\n"] as const) {
			process.env[ANTHROPIC_TEXT_EDITOR_ENV] = envValue;
			expect(isAnthropicTextEditorEnabled()).toBe(true);
		}

		for (const envValue of ["0", "false", "no", "off", "", "garbage"] as const) {
			process.env[ANTHROPIC_TEXT_EDITOR_ENV] = envValue;
			expect(isAnthropicTextEditorEnabled()).toBe(false);
		}
	});

	it("ANTHROPIC_TEXT_EDITOR_SECTION is non-empty", () => {
		expect(ANTHROPIC_TEXT_EDITOR_SECTION.trim().length).toBeGreaterThan(0);
	});

	it("payload mutator returns new object when modifying", () => {
		process.env[ANTHROPIC_TEXT_EDITOR_ENV] = "on";
		const payload = { tools: [{ name: "read" }] };
		const result = addAnthropicTextEditorToPayload("anthropic-messages", payload);
		expect(result).not.toBe(payload);
	});

	it("view on existing file returns formatted contents with line numbers", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "file.txt");
		await writeFile(filePath, "first\nsecond\nthird", "utf-8");

		const result = await executeTextEditorCommand({ command: "view", path: filePath });
		expect(result.isError).toBeUndefined();
		const firstBlock = result.content[0] as TextContent;
		expect(firstBlock.text).toContain("1\tfirst");
		expect(firstBlock.text).toContain("2\tsecond");
		expect(firstBlock.text).toContain("3\tthird");
	});

	it("view with view_range [2,4] returns only lines 2-4", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "file.txt");
		await writeFile(filePath, "l1\nl2\nl3\nl4\nl5", "utf-8");

		const result = await executeTextEditorCommand({ command: "view", path: filePath, view_range: [2, 4] });
		const text = (result.content[0] as TextContent).text;
		expect(text).toBe("2\tl2\n3\tl3\n4\tl4");
	});

	it("view on missing file returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "missing.txt");
		const result = await executeTextEditorCommand({ command: "view", path: filePath });
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("ENOENT");
	});

	it("view on directory returns directory listing", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "entry.txt");
		await writeFile(filePath, "x", "utf-8");
		const result = await executeTextEditorCommand({ command: "view", path: directoryPath });
		expect(result.isError).toBeUndefined();
		expect((result.content[0] as TextContent).text).toContain("entry.txt");
	});

	it("create writes new file successfully", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "new.txt");
		const result = await executeTextEditorCommand({ command: "create", path: filePath, file_text: "hello" });
		expect(result.isError).toBeUndefined();
		expect(await readFile(filePath, "utf-8")).toBe("hello");
	});

	it("create on existing file returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "existing.txt");
		await writeFile(filePath, "existing", "utf-8");
		const result = await executeTextEditorCommand({ command: "create", path: filePath, file_text: "new" });
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("File already exists");
	});

	it("str_replace with single match performs replacement", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "replace.txt");
		await writeFile(filePath, "hello world", "utf-8");
		const result = await executeTextEditorCommand({
			command: "str_replace",
			path: filePath,
			old_str: "world",
			new_str: "there",
		});
		expect(result.isError).toBeUndefined();
		expect(await readFile(filePath, "utf-8")).toBe("hello there");
	});

	it("str_replace with no matches returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "replace.txt");
		await writeFile(filePath, "hello world", "utf-8");
		const result = await executeTextEditorCommand({
			command: "str_replace",
			path: filePath,
			old_str: "missing",
			new_str: "there",
		});
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("No match found");
	});

	it("str_replace with multiple matches returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "replace.txt");
		await writeFile(filePath, "dup dup", "utf-8");
		const result = await executeTextEditorCommand({
			command: "str_replace",
			path: filePath,
			old_str: "dup",
			new_str: "once",
		});
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("Multiple matches found");
	});

	it("insert at line 0 inserts at beginning", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "insert.txt");
		await writeFile(filePath, "b\nc", "utf-8");
		const result = await executeTextEditorCommand({
			command: "insert",
			path: filePath,
			insert_line: 0,
			new_str: "a",
		});
		expect(result.isError).toBeUndefined();
		expect(await readFile(filePath, "utf-8")).toBe("a\nb\nc");
	});

	it("insert at last line inserts after last line", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "insert.txt");
		await writeFile(filePath, "a\nb\nc", "utf-8");
		const result = await executeTextEditorCommand({
			command: "insert",
			path: filePath,
			insert_line: 3,
			new_str: "d",
		});
		expect(result.isError).toBeUndefined();
		expect(await readFile(filePath, "utf-8")).toBe("a\nb\nc\nd");
	});

	it("insert with out-of-range line returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "insert.txt");
		await writeFile(filePath, "a\nb", "utf-8");
		const result = await executeTextEditorCommand({
			command: "insert",
			path: filePath,
			insert_line: 5,
			new_str: "x",
		});
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("out of range");
	});

	it("invalid command returns error", async () => {
		const directoryPath = await makeTempDirectory();
		const filePath = path.join(directoryPath, "invalid.txt");
		await writeFile(filePath, "x", "utf-8");
		const result = await executeTextEditorCommand({
			command: "unknown" as "view",
			path: filePath,
		});
		expect(result.isError).toBe(true);
		expect((result.content[0] as TextContent).text).toContain("Unsupported command");
	});
});
