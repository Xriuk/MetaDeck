import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isDolphinGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import { CompatdataProvider } from "../CompatdataProvider";
import { MultiIdDolphinResolver } from "../../resolvers/MultiId/MultiIdDolphinResolver";
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import type { FC } from "react";
import { removeBeforeAndIncluding } from "../../metadata/providers/GamesDBResult";

export interface DolphinCompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'dolphin'>, ResolverConfig>
{
	
}

export interface DolphinCompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'dolphin'>, ResolverCache>
{

}

export class DolphinCompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdDolphinResolver(this)
	];

	static identifier: string = "dolphin";
	static title: string = t("providerCompatdataDolphin");
	identifier: string = DolphinCompatdataProvider.identifier;
	title: string = DolphinCompatdataProvider.title;

	logger = new Logger(DolphinCompatdataProvider.identifier);

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isDolphinGame(getLaunchCommand(details));
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// Dolphin groups the title id for different regions
		const id6 = (await this.resolve(appId))?.toString().split(separator)[0];
		if(!id6)
			return undefined;

		this.logger.debug("Title ID6", appId, id6);

		// Retrieve the wiki entry
		let response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=${id6}&action=raw`);
		if(!response.ok)
			return undefined;

		let title = removeBeforeAndIncluding(await response.text(), "#REDIRECT [[");
		title = title.substring(0, title.length-2); // Remove ending ]]

		// Retrieve the wiki page
		response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=Template:Ratings/${encodeURIComponent(title)}&action=raw`);
		if(!response.ok)
			return undefined;

		let rating = parseInt(await response.text(), 10);

		this.logger.debug("Compat rating", appId, rating);

		return {
			title: title,
			id: id6,
			deck_compat_category:
				rating >= 4 ? SteamDeckCompatCategory.VERIFIED :
				rating >= 3 ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		};
	}

	settingsComponent: FC = () => undefined;
}