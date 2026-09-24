import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isXeniaGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import type { ResolverConfig, ResolverCache } from "../../Resolver";
import { MultiIdXeniaResolver } from "../../resolvers/MultiId/MultiIdXeniaResolver";
import { CompatdataProvider } from "../CompatdataProvider";
import { type MultiIdResolverConfigs, type MultiIdResolverCaches, type MultiIdResolver, separator } from "../../resolvers/MultiId/MultiIdResolver";
import type { FC } from "react";

type XeniaCompatData = {
	title: string;
	status: "Playable" | "Gameplay" | "Loads" | "Unplayable";
	id: string;
};

export interface XeniaCompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'xenia'>, ResolverConfig>
{
	
}

export interface XeniaCCompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'xenia'>, ResolverCache>
{

}

export class XeniaCompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdXeniaResolver(this)
	];

	static identifier: string = "xenia";
	static title: string = t("providerCompatdataXenia");
	identifier: string = XeniaCompatdataProvider.identifier;
	title: string = XeniaCompatdataProvider.title;

	logger = new Logger(XeniaCompatdataProvider.identifier);

	private compatData: Record<string, XeniaCompatData> = {}; // Formatted id: compat

	async getCompatData(): Promise<void>
	{
		// Retrieve compat page source
		let response = await fetchNoCors("https://github.com/xenia-canary/game-compatibility/releases/download/game-compatibility/compatibility_data.json");
		if(!response.ok)
			return;

		let data: XeniaCompatData[] = await response.json();
		for(let entry of data){
			this.compatData[entry.id.toUpperCase()] = entry;
		}
	}

	override async mount(): Promise<void>
	{
		await super.mount();
		await this.getCompatData();
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isXeniaGame(getLaunchCommand(details));
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// Xbox 360 has a single title id per game
		const titleId = (await this.resolve(appId))?.toString().split(separator)[0]?.toUpperCase();
		if(!titleId || !this.compatData[titleId])
			return undefined;

		return {
			title: this.compatData[titleId].title,
			id: titleId,
			deck_compat_category:
				this.compatData[titleId].status === "Playable" ? SteamDeckCompatCategory.VERIFIED :
				this.compatData[titleId].status === "Gameplay" ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		};
	}

	settingsComponent: FC = () => undefined;
}