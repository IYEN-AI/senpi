import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import sessionObserverExtension, {
	resolveSessionHudRoot,
	scanSessionHudEntries,
} from "../../src/core/extensions/builtin/session-observer/index.ts";
import { createHarness, type Harness } from "./harness.ts";
import {
	BASE_TIME,
	createTempRootRegistry,
	sessionLine,
	userLine,
	writeSessionFile,
} from "./history-search-fixtures.ts";

const tempRoots = createTempRootRegistry();
const harnesses: Harness[] = [];

afterEach(async () => {
	for (const harness of harnesses.splice(0)) harness.cleanup();
	await tempRoots.cleanup();
});

describe("resolveSessionHudRoot", () => {
	const defaultRoot = "/home/user/.senpi/agent/sessions";

	it("returns the cross-cwd sessions root for default session subdirectories", () => {
		expect(resolveSessionHudRoot("", defaultRoot)).toBe(defaultRoot);
		expect(resolveSessionHudRoot(defaultRoot, defaultRoot)).toBe(defaultRoot);
		expect(resolveSessionHudRoot(`${defaultRoot}/encoded-cwd`, defaultRoot)).toBe(defaultRoot);
	});

	it("keeps custom session directories isolated", () => {
		expect(resolveSessionHudRoot("/tmp/custom-sessions", defaultRoot)).toBe("/tmp/custom-sessions");
	});
});

describe("scanSessionHudEntries", () => {
	it("returns empty results for a missing sessions root", async () => {
		const root = await tempRoots.make();

		expect(await scanSessionHudEntries(join(root, "missing"))).toEqual([]);
	});

	it("discovers flat and cwd-nested sessions sorted by newest message", async () => {
		const root = await tempRoots.make();
		const sessionsDir = join(root, "sessions");
		await writeSessionFile(sessionsDir, "20260520_old-session.jsonl", [
			sessionLine("old-session", "/repo-old", BASE_TIME),
			userLine(["old prompt"], BASE_TIME + 1_000),
		]);
		const currentFile = await writeSessionFile(sessionsDir, "20260520_new-session-abcdef.jsonl", [
			sessionLine("new-session-abcdef", "/repo-new", BASE_TIME + 2_000),
			userLine(["new first"], BASE_TIME + 3_000),
			userLine(["new last"], BASE_TIME + 4_000),
		]);
		await mkdir(sessionsDir, { recursive: true });
		await writeFile(
			join(sessionsDir, "20260520_flat-session.jsonl"),
			[
				sessionLine("flat-session", "/repo-flat", BASE_TIME + 1_000),
				userLine(["flat prompt"], BASE_TIME + 2_500),
			].join("\n"),
			"utf-8",
		);

		const sessions = await scanSessionHudEntries(sessionsDir, currentFile);

		expect(sessions.map((session) => session.id)).toEqual(["new-session-abcdef", "flat-session", "old-session"]);
		expect(sessions[0]).toMatchObject({
			shortId: "new-sess",
			cwd: "/repo-new",
			messageCount: 2,
			lastUserText: "new last",
			isCurrent: true,
		});
		expect(sessions[1]?.lastUserText).toBe("flat prompt");
		expect(sessions[2]?.isCurrent).toBe(false);
	});
});

describe("sessionObserverExtension", () => {
	it("registers /sessions and no-ops safely without interactive UI", async () => {
		const harness = await createHarness({ extensionFactories: [sessionObserverExtension] });
		harnesses.push(harness);

		const command = harness.session.extensionRunner.getRegisteredCommands().find((item) => item.name === "sessions");
		expect(command?.invocationName).toBe("sessions");

		await harness.session.prompt("/sessions");
		expect(harness.session.messages).toEqual([]);
	});
});
