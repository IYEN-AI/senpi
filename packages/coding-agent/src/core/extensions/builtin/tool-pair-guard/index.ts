import type { ExtensionAPI } from "../../types.js";
import { sanitizeAnthropicPayload } from "./sanitize-anthropic-payload.js";

/** Guards provider requests by removing orphan tool_result blocks. */
export default function toolPairGuardExtension(pi: ExtensionAPI): void {
	pi.on("before_provider_request", (event) => {
		const sanitized = sanitizeAnthropicPayload(event.payload);
		if (sanitized === event.payload) return undefined;
		return sanitized;
	});
}
