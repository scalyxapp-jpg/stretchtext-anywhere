import { connect, getAccount, getKey, signOut } from "./auth.js";

const PORT_NAME = "stretchtext-auth";

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== PORT_NAME) return;

	port.onMessage.addListener(async (message) => {
		switch (message?.type) {
			case "status": {
				const [key, account] = await Promise.all([getKey(), getAccount()]);
				port.postMessage({ type: "status", connected: Boolean(key), account });
				break;
			}
			case "connect": {
				try {
					const result = await connect(({ code, url }) => {
						port.postMessage({ type: "code", code, url });
					});
					port.postMessage({ type: "connected", account: result.account });
				} catch (error) {
					port.postMessage({
						type: "error",
						message: error?.message ?? "Sign-in failed.",
					});
				}
				break;
			}
			case "signout": {
				await signOut();
				port.postMessage({ type: "signed-out" });
				break;
			}
			default:
				port.postMessage({ type: "error", message: "Unknown request." });
		}
	});
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.storage.local.get("stretchtext:installed", (result) => {
		if (result?.["stretchtext:installed"]) return;
		chrome.storage.local.set({ "stretchtext:installed": Date.now() });
	});
});
