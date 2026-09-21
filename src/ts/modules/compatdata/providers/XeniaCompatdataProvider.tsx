import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {distanceWithLimit, getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isXeniaGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import { FuzzySearchCompatdataProvider, type FuzzySearchCompatdataProviderCache, type FuzzySearchCompatdataProviderConfig } from "./FuzzySearchCompatdataProvider";

type XeniaCompatData = {
	title: string;
	status: "Playable" | "Gameplay" | "Loads" | "Unplayable";
	id: string;
};

export interface XeniaCompatdataProviderConfig extends FuzzySearchCompatdataProviderConfig
{
	
}

export interface XeniaCCompatdataProviderCache extends FuzzySearchCompatdataProviderCache
{

}

export class XeniaCompatdataProvider extends FuzzySearchCompatdataProvider
{
	static identifier: string = "xenia";
	static title: string = t("providerCompatdataXenia");
	identifier: string = XeniaCompatdataProvider.identifier;
	title: string = XeniaCompatdataProvider.title;

	logger = new Logger(XeniaCompatdataProvider.identifier);

	private compatData: Record<string, XeniaCompatData> = {};

	async getCompatData(): Promise<void>
	{
		// Retrieve compat page source
		let response = await fetchNoCors("https://github.com/xenia-canary/game-compatibility/releases/download/game-compatibility/compatibility_data.json");
		if(!response.ok)
			return;

		let data: XeniaCompatData[] = await response.json();
		for(let entry of data){
			this.compatData[entry.title] = entry;
		}
	}

	override async mount(): Promise<void>
	{
		await super.mount();
		await this.getCompatData();
	}

	protected async search(title: string): Promise<CompatdataData[]>{
		// Search with double the fuzziness to retrieve them all, they will be filtered later
		const closest_names = distanceWithLimit(this.fuzziness * 2, title, Object.keys(this.compatData));
		// Take max 10 results (since we might have different regions)
		let results = closest_names
			.map(n => this.compatData[n])
			.slice(0, 10);

		// Group by name
		let dict: Record<string, XeniaCompatData[]> = {};
		for(let result of results){
			if(!dict[result.title])
				dict[result.title] = [];
			dict[result.title].push(result);
		}

		return Object.entries(dict).map(([name, res]) => ({
			title: name,
			id: res.map(r => r.id).join(' '),
			deck_compat_category:
				res.some(r => r.status === "Playable") ? SteamDeckCompatCategory.VERIFIED :
				res.some(r => r.status === "Gameplay") ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		}));
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isXeniaGame(getLaunchCommand(details));
	}
}