/**
 * Sign-in and small API helpers.
 *
 * Extensions cannot sit on the end of an OAuth redirect, so the account is
 * connected with the device flow: ask for a code, show it, poll until the
 * reader approves it in a normal tab.
 */

const APP_KEY = "pk_eiJdmWAWwoCFXign";
const KEY_STORAGE = "stretchtext:key";
const ACCOUNT_STORAGE = "stretchtext:account";
const DEVICE_ENDPOINT = "https://enter.pollinations.ai/api/device";
const POLL_INTERVAL_MS = 5000;

export async function getKey() {
	const stored = await chrome.storage.local.get(KEY_STORAGE);
	return stored?.[KEY_STORAGE] ?? null;
}

export async function getAccount() {
	const stored = await chrome.storage.local.get(ACCOUNT_STORAGE);
	return stored?.[ACCOUNT_STORAGE] ?? null;
}

export async function signOut() {
	await chrome.storage.local.remove([KEY_STORAGE, ACCOUNT_STORAGE]);
}

async function post(url, body) {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(
			payload?.error_description || payload?.error || response.statusText,
		);
		error.code = payload?.error;
		error.status = response.status;
		throw error;
	}
	return payload;
}

/**
 * Run the device flow and store the key.
 * @param {(state: {code: string, url: string}) => void} onCode
 */
export async function connect(onCode) {
	const start = await post(`${DEVICE_ENDPOINT}/code`, { client_id: APP_KEY });
	onCode({
		code: start.user_code,
		url: start.verification_uri_complete || start.verification_uri,
	});

	await chrome.tabs.create({
		url: start.verification_uri_complete || start.verification_uri,
	});

	const deadline = Date.now() + (start.expires_in ?? 1800) * 1000;
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		try {
			const token = await post(`${DEVICE_ENDPOINT}/token`, {
				device_code: start.device_code,
			});
			if (!token.access_token) continue;
			await chrome.storage.local.set({ [KEY_STORAGE]: token.access_token });
			const account = await fetchAccount(token.access_token);
			await chrome.storage.local.set({ [ACCOUNT_STORAGE]: account });
			return { key: token.access_token, account };
		} catch (error) {
			if (error.code === "authorization_pending" || error.code === "slow_down")
				continue;
			if (error.code === "expired_token" || error.code === "access_denied")
				throw error;
			throw error;
		}
	}
	throw new Error("The sign-in code expired. Try again.");
}

async function fetchAccount(key) {
	try {
		const response = await fetch(
			"https://gen.pollinations.ai/account/balance",
			{
				headers: { Authorization: `Bearer ${key}` },
			},
		);
		if (!response.ok) return null;
		const body = await response.json();
		return { balance: body?.balance ?? null };
	} catch {
		return null;
	}
}
