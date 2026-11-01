/**
 * Stretchtext engine: the words stay, the reading grows.
 *
 * One idea, two hosts. The extension runs this against the page's selection,
 * the demo page runs it against a paragraph. Everything that touches the DOM
 * lives here so both behave identically.
 */

const NS = (globalThis.Stretchtext = globalThis.Stretchtext || {});

NS.MAX_SELECTION = 1200;
NS.MODEL = "z-ai/glm-5.3-flash";

/**
 * Prompt for growing a passage in place. The reply replaces the selection, so
 * it must read as the same voice continuing, not as a commentary.
 */
NS.buildPrompt = (phrase, context, direction = "more") => {
	const verb = direction === "less" ? "tighten" : "expand";
	return [
		`Rewrite the passage so it says the same thing but ${verb === "tighten" ? "in fewer words" : "in more words"}, keeping the author's voice, tense and point of view.`,
		direction === "less"
			? "Lose at most a quarter of the words. Keep every fact."
			: "Add concrete detail that the passage implies but leaves unsaid: what it looks like, what happens next, why it matters. Two to four times as long as the original.",
		"Reply with the rewritten passage only. No quotes, no preamble, no markdown, no headings.",
		"",
		`Passage: ${phrase}`,
		context && context !== phrase
			? `\nSurrounding text, for voice only: ${context}`
			: "",
	]
		.filter(Boolean)
		.join("\n");
};

/** Ask Pollinations for the grown text. */
NS.requestStretch = async ({ apiKey, phrase, context, direction, signal }) => {
	const response = await fetch(
		"https://gen.pollinations.ai/v1/chat/completions",
		{
			method: "POST",
			signal,
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: NS.MODEL,
				reasoning_effort: "low",
				max_tokens: 900,
				messages: [
					{
						role: "system",
						content:
							"You are a stretchtext editor: you grow and shrink passages while keeping their voice exactly. You answer with prose only.",
					},
					{ role: "user", content: NS.buildPrompt(phrase, context, direction) },
				],
			}),
		},
	);

	if (!response.ok) {
		let detail = response.statusText;
		try {
			const body = await response.json();
			detail = body?.error?.message || detail;
		} catch {
			/* keep the status text */
		}
		throw new Error(`${response.status} ${detail}`);
	}

	const body = await response.json();
	const text = body?.choices?.[0]?.message?.content ?? "";
	const cleaned = text
		.replace(/^```[a-z]*\n?|```$/g, "")
		.replace(/^["“]|["”]$/g, "")
		.trim();
	if (!cleaned) throw new Error("The model returned nothing.");
	return cleaned;
};

NS.closestBlock = (node) => {
	let element = node instanceof Element ? node : node?.parentElement;
	while (
		element &&
		!/^(P|LI|BLOCKQUOTE|TD|DD|H1|H2|H3|H4|ARTICLE|SECTION|DIV)$/.test(
			element.tagName,
		)
	) {
		element = element.parentElement;
	}
	return element;
};

/**
 * Swap the current selection for a stretchable span.
 * @returns {{span: HTMLElement, original: string} | null}
 */
NS.stretchSelection = (selection, expandedText) => {
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	const original = range.toString();
	if (!original.trim()) return null;

	const span = document.createElement("span");
	span.className = "stretchtext-segment";
	span.dataset.stretchOriginal = original;
	span.textContent = expandedText;
	span.title = "Click to shrink back";
	span.setAttribute("role", "button");
	span.tabIndex = 0;

	range.deleteContents();
	range.insertNode(span);
	selection.removeAllRanges();
	return { span, original };
};

/** Put the original words back. */
NS.collapseSegment = (span) => {
	if (!span?.isConnected) return;
	const original = span.dataset.stretchOriginal ?? "";
	span.replaceWith(document.createTextNode(original));
};

NS.isStretchable = (node) => {
	const block = NS.closestBlock(node);
	if (!block) return false;
	if (block.closest("[contenteditable='true'], textarea, input")) return false;
	return Boolean(block.innerText && block.innerText.trim().length > 20);
};
