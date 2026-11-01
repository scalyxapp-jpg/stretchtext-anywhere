/**
 * Page side of Stretchtext Anywhere.
 *
 * Nothing runs until the reader selects something. The pill is a closed shadow
 * root, so no page stylesheet can reach it and no page script can read it.
 */

(() => {
	const NS = window.Stretchtext;
	if (!NS || window.__stretchtextLoaded) return;
	window.__stretchtextLoaded = true;

	const STORAGE_KEY = "stretchtext:key";
	const DRAG_THRESHOLD = 4;

	let pillHost = null;
	let pill = null;
	let shadowRoot = null;
	let pendingRange = null;
	let downPoint = null;
	let inFlight = false;

	function mountUi() {
		if (pillHost) return;
		pillHost = document.createElement("div");
		pillHost.style.cssText =
			"all:initial;position:fixed;inset:0 auto auto 0;z-index:2147483647;pointer-events:none;";
		shadowRoot = pillHost.attachShadow({ mode: "closed" });
		pill = document.createElement("button");
		pill.type = "button";
		pill.textContent = "Stretch";
		pill.style.cssText = [
			"all:initial",
			"position:fixed",
			"display:none",
			"pointer-events:auto",
			"cursor:pointer",
			"font:600 12px/1 system-ui,-apple-system,Segoe UI,sans-serif",
			"letter-spacing:0.02em",
			"padding:7px 11px",
			"border-radius:999px",
			"color:#10120a",
			"background:#d8ff5c",
			"border:1px solid #b6e03a",
			"box-shadow:0 6px 18px rgba(0,0,0,.28)",
			"transform:translate(-50%,0)",
			"transition:opacity .12s ease",
			"opacity:0",
		].join(";");
		shadowRoot.append(pill);
		document.documentElement.append(pillHost);
		pill.addEventListener("mousedown", (event) => event.preventDefault());
		pill.addEventListener("click", onStretch);
	}

	function hidePill() {
		if (!pill) return;
		pill.style.display = "none";
		pill.style.opacity = "0";
	}

	function showPill(rect) {
		mountUi();
		const top = Math.max(8, rect.bottom + 8);
		const left = Math.min(
			Math.max(rect.left + rect.width / 2, 56),
			window.innerWidth - 56,
		);
		pill.style.top = `${top}px`;
		pill.style.left = `${left}px`;
		pill.style.display = "block";
		requestAnimationFrame(() => {
			pill.style.opacity = "1";
		});
	}

	function toast(message, { error = false, near } = {}) {
		mountUi();
		let box = shadowRoot.querySelector(".stretchtext-toast");
		if (!box) {
			box = document.createElement("div");
			box.className = "stretchtext-toast";
			shadowRoot.append(box);
		}
		box.textContent = message;
		box.style.cssText = [
			"all:initial",
			"position:fixed",
			"pointer-events:none",
			"max-width:320px",
			`font:500 12px/1.4 system-ui,-apple-system,Segoe UI,sans-serif`,
			"padding:8px 11px",
			"border-radius:10px",
			"color:" + (error ? "#ffd9d2" : "#f4f1ea"),
			"background:" + (error ? "#3a1512" : "#14141a"),
			"border:1px solid " + (error ? "#7a2a22" : "#2a2a36"),
			"box-shadow:0 8px 22px rgba(0,0,0,.35)",
			"transition:opacity .2s ease",
			"opacity:1",
		].join(";");
		const anchor = near ?? pill;
		const rect = anchor.getBoundingClientRect();
		box.style.top = `${Math.min(window.innerHeight - 60, rect.bottom + 8)}px`;
		box.style.left = `${Math.min(window.innerWidth - 340, Math.max(8, rect.left))}px`;
		clearTimeout(box.__timer);
		box.__timer = setTimeout(
			() => {
				box.style.opacity = "0";
			},
			error ? 5200 : 2600,
		);
	}

	function readKey() {
		return new Promise((resolve) => {
			try {
				chrome.storage.local.get(STORAGE_KEY, (result) => {
					resolve(result?.[STORAGE_KEY] ?? null);
				});
			} catch {
				resolve(null);
			}
		});
	}

	async function onStretch(event) {
		event.preventDefault();
		if (inFlight) return;
		const selection = window.getSelection();
		const range =
			pendingRange ?? (selection?.rangeCount ? selection.getRangeAt(0) : null);
		if (!range || !range.toString().trim()) {
			toast("Select the passage you want to grow.", { error: true });
			return;
		}

		const phrase = range
			.toString()
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, NS.MAX_SELECTION);
		const block = NS.closestBlock(range.startContainer);
		const context =
			block?.innerText?.replace(/\s+/g, " ").trim().slice(0, 1600) ?? "";

		const apiKey = await readKey();
		if (!apiKey) {
			toast(
				"Connect first: open the Stretchtext button in the toolbar and sign in.",
				{
					error: true,
				},
			);
			return;
		}

		const anchorRect = range.getBoundingClientRect();
		hidePill();
		inFlight = true;
		toast("Growing…", { near: { getBoundingClientRect: () => anchorRect } });

		try {
			const expanded = await NS.requestStretch({ apiKey, phrase, context });
			// Re-resolve the live range: the page may have re-rendered while we waited.
			const live = selection?.rangeCount ? selection.getRangeAt(0) : range;
			const liveText = live.toString().trim();
			const target = liveText === phrase.trim() ? live : range;
			const applied = NS.stretchSelection(selectionFor(target), expanded);
			if (!applied)
				throw new Error("The page changed while the text was growing.");
			toast("Click the grown text to shrink it back.", { near: applied.span });
		} catch (error) {
			toast(error.message || "Stretching failed.", { error: true });
		} finally {
			inFlight = false;
			pendingRange = null;
		}
	}

	function selectionFor(range) {
		const selection = window.getSelection();
		selection.removeAllRanges();
		selection.addRange(range);
		return selection;
	}

	document.addEventListener(
		"pointerdown",
		(event) => {
			downPoint = { x: event.clientX, y: event.clientY };
		},
		true,
	);

	document.addEventListener(
		"pointerup",
		(event) => {
			if (event.target === pill) return;
			const moved =
				!downPoint ||
				Math.abs(event.clientX - downPoint.x) > DRAG_THRESHOLD ||
				Math.abs(event.clientY - downPoint.y) > DRAG_THRESHOLD;
			if (!moved) return;

			setTimeout(() => {
				const selection = window.getSelection();
				if (!selection || selection.isCollapsed) {
					hidePill();
					return;
				}
				const text = selection.toString().trim();
				if (text.length < 3) {
					hidePill();
					return;
				}
				const range = selection.getRangeAt(0);
				if (!NS.isStretchable(range.startContainer)) {
					hidePill();
					return;
				}
				pendingRange = range.cloneRange();
				showPill(range.getBoundingClientRect());
			}, 10);
		},
		true,
	);

	document.addEventListener("scroll", hidePill, { passive: true });
	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") hidePill();
	});

	// Click a grown passage to shrink it back.
	document.addEventListener(
		"click",
		(event) => {
			const segment = event.target.closest?.(".stretchtext-segment");
			if (!segment) return;
			event.preventDefault();
			event.stopPropagation();
			NS.collapseSegment(segment);
		},
		true,
	);

	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key !== "Enter" && event.key !== " ") return;
			const segment = event.target.closest?.(".stretchtext-segment");
			if (!segment) return;
			event.preventDefault();
			NS.collapseSegment(segment);
		},
		true,
	);

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes[STORAGE_KEY]) {
			hidePill();
		}
	});
})();
