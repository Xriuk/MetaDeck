import {runInAction} from "mobx";
import {SteamAppDetails, SteamAppOverview} from "./SteamTypes";
import {closest, distance} from "fastest-levenshtein";
import { SteamAppTypeShortcut } from "./Interfaces";
import type { fetchNoCors } from "@decky/api";

export function stateTransaction<T>(block: () => T) {
	// @ts-ignore
	const prev: boolean = window["__mobxGlobals"].allowStateChanges
	// @ts-ignore
	window["__mobxGlobals"].allowStateChanges = true
	const r = runInAction(block);
	// @ts-ignore
	window["__mobxGlobals"].allowStateChanges = prev
	return r;
}

export function getAllNonSteamAppIds(): number[]
{
	return getAllNonSteamAppOverviews().map(e => e.appid);
}

export function getAllNonSteamAppOverviews(): SteamAppOverview[]
{
	return appStore.allApps
		.filter(e => e.app_type === SteamAppTypeShortcut && e.visible_in_game_list);
}

export async function getAppDetails(appId: number): Promise<SteamAppDetails | null>
{
	return await new Promise((resolve) => {
		let timeoutId: NodeJS.Timeout | undefined = undefined;
		let unregister: undefined | (() => void) = undefined;
		try {
			let registration = SteamClient.Apps.RegisterForAppDetails(appId, details => {
				clearTimeout(timeoutId);
				unregister?.();
				resolve(details as unknown as SteamAppDetails);
			});
			unregister = registration.unregister;

			timeoutId = setTimeout(() => {
				unregister?.();
				resolve(null);
			}, 1000);
		} catch (error) {
			clearTimeout(timeoutId);
			unregister?.();
			console.error(error);
			resolve(null);
		}
	});
}

export function closestWithLimit(limit: number, str: string, arr: string[]): string | undefined
{
	const newArr = arr.filter(value => distance(str, value) < limit)
	return newArr.length > 0 ? closest(str, newArr) : undefined
}

export function distanceWithLimit(limit: number, str: string, arr: string[]): string[]
{
	return arr.filter(value => distance(str, value) < limit)
}

// Base64
export function grayScaleIcon(iconOrUrl: string): Promise<string>{
	return new Promise<string>((resolve) => {
		let img = new Image();
		img.crossOrigin = 'Anonymous';
		img.onload = () => {
			// 1. Create off-screen canvas and context
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d')!;
			
			canvas.width = img.width;
			canvas.height = img.height;

			// 2. Draw image onto canvas
			ctx.drawImage(img, 0, 0);

			// 3. Extract pixel data (RGBA array)
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			const data = imageData.data;

			// 4. Loop through pixels (step by 4: R, G, B, A)
			for (let i = 0; i < data.length; i += 4) {
				// Luminance formula for human perception weighting
				const avg = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
				
				data[i]     = avg; // Red
				data[i + 1] = avg; // Green
				data[i + 2] = avg; // Blue
			}

			// 5. Put grayscale pixel data back and return new base64 string
			ctx.putImageData(imageData, 0, 0);
			resolve(canvas.toDataURL('image/png'));
		};

		img.src = iconOrUrl;
	});
}

export function removeWhitespacesAndPuctuation(input: string): string{
	// any kind of punctuation character (including international e.g. Chinese and Spanish punctuation)
    // author: http://www.regular-expressions.info/unicode.html
    // source: https://github.com/slevithan/xregexp/blob/41f4cd3fc0a8540c3c71969a0f81d1f00e9056a9/src/addons/unicode/unicode-categories.js#L142
    // note: XRegExp unicode output taken from http://jsbin.com/uFiNeDOn/3/edit?js,console (see chrome console.log), then converted back to JS escaped unicode here http://rishida.net/tools/conversion/, then tested on http://regexpal.com/
    // suggested by: https://stackoverflow.com/a/7578937
    // added: extra characters like "$", "\uFFE5" [yen symbol], "^", "+", "=" which are not consider punctuation in the XRegExp regex (they are currency or mathmatical characters)
    // added: \u3000-\u303F Chinese Punctuation for good measure
    const regex_characters_to_remove = /[\$\uFFE5\^\+=`~<>{}\[\]|\u3000-\u303F!-#%-\x2A,-/:;\x3F@\x5B-\x5D_\x7B}\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u037E\u0387\u055A-\u055F\u0589\u058A\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4\u0609\u060A\u060C\u060D\u061B\u061E\u061F\u066A-\u066D\u06D4\u0700-\u070D\u07F7-\u07F9\u0830-\u083E\u085E\u0964\u0965\u0970\u0AF0\u0DF4\u0E4F\u0E5A\u0E5B\u0F04-\u0F12\u0F14\u0F3A-\u0F3D\u0F85\u0FD0-\u0FD4\u0FD9\u0FDA\u104A-\u104F\u10FB\u1360-\u1368\u1400\u166D\u166E\u169B\u169C\u16EB-\u16ED\u1735\u1736\u17D4-\u17D6\u17D8-\u17DA\u1800-\u180A\u1944\u1945\u1A1E\u1A1F\u1AA0-\u1AA6\u1AA8-\u1AAD\u1B5A-\u1B60\u1BFC-\u1BFF\u1C3B-\u1C3F\u1C7E\u1C7F\u1CC0-\u1CC7\u1CD3\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E\u207D\u207E\u208D\u208E\u2329\u232A\u2768-\u2775\u27C5\u27C6\u27E6-\u27EF\u2983-\u2998\u29D8-\u29DB\u29FC\u29FD\u2CF9-\u2CFC\u2CFE\u2CFF\u2D70\u2E00-\u2E2E\u2E30-\u2E3B\u3001-\u3003\u3008-\u3011\u3014-\u301F\u3030\u303D\u30A0\u30FB\uA4FE\uA4FF\uA60D-\uA60F\uA673\uA67E\uA6F2-\uA6F7\uA874-\uA877\uA8CE\uA8CF\uA8F8-\uA8FA\uA92E\uA92F\uA95F\uA9C1-\uA9CD\uA9DE\uA9DF\uAA5C-\uAA5F\uAADE\uAADF\uAAF0\uAAF1\uABEB\uFD3E\uFD3F\uFE10-\uFE19\uFE30-\uFE52\uFE54-\uFE61\uFE63\uFE68\uFE6A\uFE6B\uFF01-\uFF03\uFF05-\uFF0A\uFF0C-\uFF0F\uFF1A\uFF1B\uFF1F\uFF20\uFF3B-\uFF3D\uFF3F\uFF5B\uFF5D\uFF5F-\uFF65]+/g;

	return input.replace(regex_characters_to_remove, '')
		.replace(/\s/g, '');
}

// Timeout in seconds, to be used for multiple requests
// https://github.com/SteamDeckHomebrew/decky-loader/issues/974
export async function fetchNoCorsLegacyTimeout(url: string, method: string = 'GET', request: any = {}, timeout: number | null = 10): ReturnType<typeof fetchNoCors>{
	try{
		let response = await DeckyBackend.call<[string, string, any, number | null], { status: number; headers: { [key: string]: string }; body: string }>(
			"utilities/http_request",
			method, url, request, timeout);
		return Response.json(JSON.parse(response.body), {
			status: response.status ?? 500,
			headers: response.headers
		});
	}
	catch{
		return new Response(null, {
			status: 500
		});
	}
}