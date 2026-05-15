import assert from "node:assert";
import { describe, it } from "node:test";
import { Loader, TUI } from "../src/index.js";
import { VirtualTerminal } from "./virtual-terminal.js";

describe("Loader", () => {
	it("uses a message formatter with elapsed animation time", () => {
		const terminal = new VirtualTerminal(40, 4);
		const tui = new TUI(terminal);
		const loader = new Loader(
			tui,
			(text) => text,
			(text) => text,
			"Working",
			{
				frames: ["•"],
				messageFormatter: (message, animationElapsedMs) => `[${Number.isFinite(animationElapsedMs)}]${message}`,
			},
		);

		loader.stop();

		const renderedLine = loader.render(40)[1];
		assert.ok(renderedLine?.includes("• [true]Working"), `expected formatted loader line, got ${renderedLine}`);
	});
});
