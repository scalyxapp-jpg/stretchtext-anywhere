import "./extension/src/core.js";

// core.js is a plain script on purpose (content scripts cannot be modules), so
// it publishes itself on globalThis and this page reads it from there.
const { buildPrompt, closestBlock, collapseSegment, stretchSelection } =
	globalThis.Stretchtext;

const MODEL = "z-ai/glm-5.3-flash";
const MAX_SELECTION = 1200;

const connect = document.querySelector("polli-connect");

// Local development hook: `?key=sk_...` on localhost only.
const devKey =
	/^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
	new URLSearchParams(location.search).get("key");
const stateLine = document.querySelector("#demo-state");
const article = document.querySelector("#demo-article");

let pill = null;
let pendingRange = null;
let downPoint = null;
let inFlight = false;

/** The demo runs the same prompt the extension sends. */
async function requestStretch({ apiKey, phrase, context }) {
	const response = await fetch(
		"https://gen.pollinations.ai/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: MODEL,
				reasoning_effort: "low",
				max_tokens: 900,
				messages: [
					{
						role: "system",
						content:
							"You are a stretchtext editor: you grow and shrink passages while keeping their voice exactly. You answer with prose only.",
					},
					{ role: "user", content: buildPrompt(phrase, context) },
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
}

function status(message, { error = false } = {}) {
	stateLine.textContent = message;
	stateLine.classList.toggle("error", error);
}

function mountPill() {
	if (pill) return pill;
	pill = document.createElement("button");
	pill.type = "button";
	pill.className = "stretch-pill";
	pill.textContent = "Stretch";
	pill.addEventListener("mousedown", (event) => event.preventDefault());
	pill.addEventListener("click", onStretch);
	document.body.append(pill);
	return pill;
}

function hidePill() {
	pill?.classList.remove("visible");
}

function showPill(rect) {
	mountPill();
	pill.style.top = `${Math.max(8, rect.bottom + window.scrollY + 8)}px`;
	pill.style.left = `${Math.min(
		window.innerWidth - 60,
		Math.max(60, rect.left + window.scrollX + rect.width / 2),
	)}px`;
	pill.classList.add("visible");
}

async function onStretch(event) {
	event.preventDefault();
	if (inFlight) return;
	const apiKey = connect?.apiKey || devKey;
	if (!apiKey) {
		status("Press Connect first — the demo spends your own Pollen.", {
			error: true,
		});
		return;
	}

	const range = pendingRange;
	if (!range || !range.toString().trim()) return;
	const phrase = range
		.toString()
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, MAX_SELECTION);
	const context =
		closestBlock(range.startContainer)
			?.innerText?.replace(/\s+/g, " ")
			.trim()
			.slice(0, 1600) ?? "";

	hidePill();
	inFlight = true;
	status("Growing…");

	try {
		const expanded = await requestStretch({
			apiKey,
			phrase,
			context,
		});
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		const applied = stretchSelection(selection, expanded);
		if (!applied) throw new Error("Select a passage inside the article first.");
		status("Click the underlined passage to shrink it back.");
	} catch (error) {
		status(error.message, { error: true });
	} finally {
		inFlight = false;
		pendingRange = null;
	}
}

document.addEventListener("pointerdown", (event) => {
	downPoint = { x: event.clientX, y: event.clientY };
});

document.addEventListener("pointerup", (event) => {
	if (event.target === pill) return;
	const moved =
		!downPoint ||
		Math.abs(event.clientX - downPoint.x) > 4 ||
		Math.abs(event.clientY - downPoint.y) > 4;
	if (!moved) return;

	setTimeout(() => {
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return hidePill();
		if (!article.contains(selection.anchorNode)) return hidePill();
		if (selection.toString().trim().length < 3) return hidePill();
		pendingRange = selection.getRangeAt(0).cloneRange();
		showPill(selection.getRangeAt(0).getBoundingClientRect());
	}, 10);
});

document.addEventListener("scroll", hidePill, { passive: true });
document.addEventListener("keydown", (event) => {
	if (event.key === "Escape") hidePill();
});

article.addEventListener("click", (event) => {
	const segment = event.target.closest(".stretchtext-segment");
	if (!segment) return;
	collapseSegment(segment);
	status("Shrunk back. Select another passage to try again.");
});
