import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isRPCS3Game
} from "../../../shortcuts";
import Logger from "../../../logger";
import { CompatdataProvider } from "../CompatdataProvider";
import { MultiIdRPCS3Resolver } from "../../resolvers/MultiId/MultiIdRPCS3Resolver";
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import type { FC } from "react";

type RPCS3CompatData = {
	title: string;
	status: "Playable" | "Ingame" | "Intro" | "Loadable" | "Nothing";
	id?: string;
};

export interface RPCS3CompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'rpcs3'>, ResolverConfig>
{
	
}

export interface RPCS3CompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'rpcs3'>, ResolverCache>
{

}

export class RPCS3CompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdRPCS3Resolver(this)
	];

	static identifier: string = "rpcs3";
	static title: string = t("providerCompatdataRPCS3");
	identifier: string = RPCS3CompatdataProvider.identifier;
	title: string = RPCS3CompatdataProvider.title;

	logger = new Logger(RPCS3CompatdataProvider.identifier);

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isRPCS3Game(getLaunchCommand(details));
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// RPCS3 groups the title id for different regions
		const titleId = (await this.resolve(appId))?.toString().split(separator)[0];
		if(!titleId)
			return undefined;

		this.logger.debug("Title id", appId, titleId);

		const response = await fetchNoCors("https://rpcs3.net/compatibility?" + new URLSearchParams({
			api: 'v1',
			g: titleId
		}).toString());
		if(!response.ok)
			return undefined;

		let data: {
			results?: Record<string, RPCS3CompatData>;
		} = await response.json();
		if(!data.results?.[titleId])
			return undefined;

		this.logger.debug("Compat data", appId, data.results[titleId]);

		return {
			title: data.results[titleId].title,
			id: titleId,
			deck_compat_category:
				data.results[titleId].status === "Playable" ? SteamDeckCompatCategory.VERIFIED :
				data.results[titleId].status === "Ingame" ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		};
	}

	settingsComponent: FC = () => undefined;
}