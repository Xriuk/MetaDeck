import {ProviderCache, ProviderConfig} from "../../Provider";
import {MetadataProvider} from "../MetadataProvider";
import {MetadataData, StoreCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {GamesDBResult} from "../../GamesDBResult";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand,
	getShortcutCategories,
	isEpicGame,
	isGOGGame,
	isUbisoftGame
} from "../../../shortcuts";
import {ResolverCache, ResolverConfig} from "../../Resolver";
import {
	GOGMetadataProviderJunkStoreResolver,
	GOGMetadataProviderJunkStoreResolverCache,
	GOGMetadataProviderJunkStoreResolverConfig
} from "../resolvers/GOG/GOGMetadataProviderJunkStoreResolver";
import {GOGMetadataProviderResolver, separator} from "../resolvers/GOG/GOGMetadataProviderResolver";
import {
	GOGMetadataProviderNSLResolver,
	GOGMetadataProviderNSLResolverCache,
	GOGMetadataProviderNSLResolverConfig
} from "../resolvers/GOG/GOGMetadataProviderNSLResolver";
import {
	GOGMetadataProviderHeroicResolver,
	GOGMetadataProviderHeroicResolverCache,
	GOGMetadataProviderHeroicResolverConfig
} from "../resolvers/GOG/GOGMetadataProviderHeroicResolver";
import {MetadataProviderConfigs} from "../MetadataModule";
import { SteamMetadataProvider } from "./SteamMetadataProvider";
import { SiGogdotcom } from "react-icons/si";

export interface GOGMetadataProviderConfig extends ProviderConfig<GOGMetadataProviderResolverConfigs, GOGMetadataProviderResolverConfig>
{
	
}

export interface GOGMetadataProviderCache extends ProviderCache<GOGMetadataProviderResolverCaches, GOGMetadataProviderResolverCache>
{

}

export interface GOGMetadataProviderResolverConfigs
{
	junk: GOGMetadataProviderJunkStoreResolverConfig,
	nsl: GOGMetadataProviderNSLResolverConfig,
	heroic: GOGMetadataProviderHeroicResolverConfig
}

export interface GOGMetadataProviderResolverCaches
{
	junk: GOGMetadataProviderJunkStoreResolverCache,
	nsl: GOGMetadataProviderNSLResolverCache,
	heroic: GOGMetadataProviderHeroicResolverCache
}

export interface GOGMetadataProviderResolverConfig extends ResolverConfig
{
}

export interface GOGMetadataProviderResolverCache extends ResolverCache
{
}

export class GOGMetadataProvider extends MetadataProvider<GOGMetadataProviderResolver>
{

	static identifier: keyof MetadataProviderConfigs = "gog";
	static title: string = t("providerMetadataGOG");
	identifier: keyof MetadataProviderConfigs = GOGMetadataProvider.identifier;
	title: string = GOGMetadataProvider.title;

	resolvers: GOGMetadataProviderResolver[] = [
		new GOGMetadataProviderJunkStoreResolver(this),
		new GOGMetadataProviderNSLResolver(this),
		new GOGMetadataProviderHeroicResolver(this)
	]

	private _steamProvider?: SteamMetadataProvider;
	get steamProvider(): SteamMetadataProvider
	{
		if(!this._steamProvider){
			this._steamProvider = this.module.providers.find(p => p instanceof SteamMetadataProvider);
			if(!this._steamProvider)
				this._steamProvider = new SteamMetadataProvider(this.module);
		}

		return this._steamProvider;
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		const launchCommand = getLaunchCommand(details);
		return isGOGGame(launchCommand) || isEpicGame(launchCommand) || isUbisoftGame(launchCommand);
	}

	provide(appId: number): Promise<MetadataData | undefined>
	{
		return this.throttle(async () => {
			const details = await getAppDetails(appId);
			if (!details)
				return undefined;
			const resolved = await this.resolve(appId);
			if (!resolved)
				return undefined;
	
			const [platform, id] = resolved.toString().split(separator);

			let response = await fetchNoCors(
				"https://gamesdb.gog.com/platforms/{0}/external_releases/{1}"
					.replace("{0}", platform)
					.replace("{1}", id));
			if (response.ok)
			{
				const result: GamesDBResult = await response.json();

				const cats = await getShortcutCategories(getLaunchCommand(details));

				// If we have a steam id we query that first to get more accurate results
				if(result.game.releases.some(r => r.platform_id === "steam")){
					let steam = await this.steamProvider.getAppMetadata(result.game.releases.find(r => r.platform_id === "steam")?.external_id ?? '');
					if(steam){
						steam.release_date = Math.floor(new Date(result.game.first_release_date).getTime() / 1000);
						steam.store_categories.push(...cats);

						return steam;
					}
				}

				if (result.game_modes.some(m => m.slug === "multiplayer"))
					cats.push(StoreCategory.MultiPlayer)
				if (result.game_modes.some(m => m.slug === "co-operative"))
					cats.push(StoreCategory.CoOp)
				if (result.game_modes.some(m => m.slug === "single-player"))
					cats.push(StoreCategory.SinglePlayer)

				return {
					id: result.id,
					title: result.title["en-US"],
					description: result.summary["en-US"] || t("noDescription"),
					rating: result.game.aggregated_rating,
					release_date: Math.floor(new Date(result.game.first_release_date).getTime() / 1000),
					developers: result.game.developers.map((dev) => ({name: dev.name, url: ""})),
					publishers: result.game.publishers.map((pub) => ({name: pub.name, url: ""})),
					store_categories: cats
				};
			}

			return undefined;
		});
	}

	override icon = <SiGogdotcom/>;
}