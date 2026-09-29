import {runInAction} from "mobx";
import {SteamAppDetails, SteamAppOverview} from "./SteamTypes";
import {closest, distance} from "fastest-levenshtein";
import { SteamAppTypeShortcut } from "./Interfaces";

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
	return appStore.allApps.filter(e => e.app_type == SteamAppTypeShortcut).map(e => e.appid);
}

export function getAllNonSteamAppOverviews(): SteamAppOverview[]
{
	return appStore.allApps.filter(e => e.app_type == SteamAppTypeShortcut)
}

export async function getAppDetails(appId: number): Promise<SteamAppDetails | null>
{
	return await new Promise((resolve) => {
		let timeoutId: NodeJS.Timeout | undefined = undefined;
		try {
			const { unregister } = SteamClient.Apps.RegisterForAppDetails(appId, (details: SteamAppDetails) => {
				clearTimeout(timeoutId);
				unregister();
				resolve(details);
			});

			timeoutId = setTimeout(() => {
				unregister();
				resolve(null);
			}, 1000);
		} catch (error) {
			clearTimeout(timeoutId);
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
export function grayScaleIcon(icon: string): Promise<string>{
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

		img.src = icon;
	});
}