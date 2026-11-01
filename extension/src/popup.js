const ui = {
	state: document.querySelector("#state"),
	connect: document.querySelector("#connect"),
	signout: document.querySelector("#signout"),
	device: document.querySelector("#device"),
	code: document.querySelector("#code"),
	error: document.querySelector("#error"),
};

const port = chrome.runtime.connect({ name: "stretchtext-auth" });

function setState(text) {
	ui.state.textContent = text;
}

function showError(message) {
	ui.error.textContent = message;
	ui.error.classList.remove("hidden");
}

function renderConnected(account) {
	const balance = account?.balance;
	ui.device.classList.add("hidden");
	ui.connect.hidden = true;
	ui.signout.hidden = false;
	ui.error.classList.add("hidden");
	setState(
		balance == null
			? "Connected. Every stretch is paid from your own Pollen."
			: `Connected. ${Number(balance).toFixed(2)} Pollen available.`,
	);
}

port.onMessage.addListener((message) => {
	switch (message.type) {
		case "status":
			if (message.connected) renderConnected(message.account);
			else {
				setState("Not connected yet.");
				ui.connect.hidden = false;
				ui.signout.hidden = true;
			}
			break;
		case "code":
			ui.device.classList.remove("hidden");
			ui.code.textContent = message.code;
			setState(
				"Waiting for you to approve the code in the tab that just opened…",
			);
			break;
		case "connected":
			renderConnected(message.account);
			break;
		case "signed-out":
			ui.connect.hidden = false;
			ui.signout.hidden = true;
			ui.device.classList.add("hidden");
			setState("Not connected yet.");
			break;
		case "error":
			showError(message.message);
			ui.connect.disabled = false;
			break;
		default:
			break;
	}
});

ui.connect.addEventListener("click", () => {
	ui.connect.disabled = true;
	ui.error.classList.add("hidden");
	setState("Requesting a sign-in code…");
	port.postMessage({ type: "connect" });
});

ui.signout.addEventListener("click", () => {
	port.postMessage({ type: "signout" });
});

port.postMessage({ type: "status" });
