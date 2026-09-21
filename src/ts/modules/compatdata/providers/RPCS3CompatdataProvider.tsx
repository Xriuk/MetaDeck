import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isRPCS3Game
} from "../../../shortcuts";
import Logger from "../../../logger";
import { FuzzySearchCompatdataProvider, type FuzzySearchCompatdataProviderCache, type FuzzySearchCompatdataProviderConfig } from "./FuzzySearchCompatdataProvider";

type RPCS3CompatData = {
	title: string;
	status: "Playable" | "Ingame" | "Intro" | "Loadable" | "Nothing";
	id?: string;
};

export interface RPCS3CompatdataProviderConfig extends FuzzySearchCompatdataProviderConfig
{
	
}

export interface RPCS3CCompatdataProviderCache extends FuzzySearchCompatdataProviderCache
{

}

export class RPCS3CompatdataProvider extends FuzzySearchCompatdataProvider
{
	static identifier: string = "rpcs3";
	static title: string = t("providerCompatdataRPCS3");
	identifier: string = RPCS3CompatdataProvider.identifier;
	title: string = RPCS3CompatdataProvider.title;

	logger = new Logger(RPCS3CompatdataProvider.identifier);

	protected async search(title: string): Promise<CompatdataData[]>{
		const response = await fetchNoCors("https://rpcs3.net/compatibility?" + new URLSearchParams({
			api: 'v1',
			g: title
		}).toString());
		if(!response.ok)
			return [];

		let data: {
			results?: Record<string, RPCS3CompatData>;
		} = await response.json();

		// Group by name
		let dict: Record<string, RPCS3CompatData[]> = {};
		for(let result of Object.entries(data?.results ?? {})){
			if(!dict[result[1].title])
				dict[result[1].title] = [];
			result[1].id = result[0];
			dict[result[1].title].push(result[1]);
		}

		return Object.entries(dict).map(([name, res]) => ({
			title: name,
			id: res.map(r => r.id).join(' '),
			deck_compat_category:
				res.some(r => r.status === "Playable") ? SteamDeckCompatCategory.VERIFIED :
				res.some(r => r.status === "Ingame") ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		}));
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isRPCS3Game(getLaunchCommand(details));
	}
}