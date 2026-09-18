import {ProviderCache, ProviderConfig} from "../../../Provider";
import {MetadataProvider} from "../../MetadataProvider";
import {MetadataData, StoreCategory} from "../../../../Interfaces";
import {getAppDetails} from "../../../../util";
import {GamesDBResult} from "../GamesDBResult";
import {FC, Fragment, useState} from "react";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../../useTranslations";
import {
	getLaunchCommand,
	getShortcutCategories,
	isEpicGame,
	isGOGGame,
	isUbisoftGame
} from "../../../../shortcuts";
import {ResolverCache, ResolverConfig} from "../../../Resolver";
import {
	GOGMetadataProviderJunkStoreResolver,
	GOGMetadataProviderJunkStoreResolverCache,
	GOGMetadataProviderJunkStoreResolverConfig
} from "./resolvers/GOGMetadataProviderJunkStoreResolver";
import {GOGMetadataProviderResolver, separator} from "./GOGMetadataProviderResolver";
import {
	GOGMetadataProviderNSLResolver,
	GOGMetadataProviderNSLResolverCache,
	GOGMetadataProviderNSLResolverConfig
} from "./resolvers/GOGMetadataProviderNSLResolver";
import {
	GOGMetadataProviderHeroicResolver,
	GOGMetadataProviderHeroicResolverCache,
	GOGMetadataProviderHeroicResolverConfig
} from "./resolvers/GOGMetadataProviderHeroicResolver";
import {MetadataProviderConfigs} from "../../MetadataModule";
import type { AppDetailsResponse } from "type-steamapi";
import { PanelSectionRow, TextField } from "@decky/ui";

export interface GOGMetadataProviderConfig extends ProviderConfig<GOGMetadataProviderResolverConfigs, GOGMetadataProviderResolverConfig>
{
	language: string
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

	get language(): string
	{
		return this.module.config.providers.gog.language;
	}

	set language(language: string)
	{
		this.module.config.providers.gog.language = language;
		void this.module.saveData();
	}

	async provide(appId: number): Promise<MetadataData | undefined>
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
					response = await fetchNoCors(
						"https://store.steampowered.com/api/appdetails?appids={0}&l={1}"
							.replace("{0}", result.game.releases.find(r => r.platform_id === "steam")?.external_id ?? '')
							.replace("{1}", this.language));
					if (response.ok){
						const result2: Record<string, AppDetailsResponse> = await response.json();
						if(result2 && Object.values(result2).length === 1){
							let game = Object.values(result2)[0];
							if(game.success){
								cats.push(...game.data.categories
									.filter(c => StoreCategory[c.id])
									.map(c => StoreCategory[StoreCategory[c.id] as any] as unknown as StoreCategory));

								return {
									id: game.data.steam_appid,
									title: game.data.name,
									description: game.data.short_description || t("noDescription"),
									rating: game.data.metacritic.score,
									release_date: Math.floor(new Date(result.game.first_release_date).getTime() / 1000),
									developers: game.data.developers.map(d => ({name: d, url: ""})),
									publishers: game.data.publishers.map(p => ({name: p, url: ""})),
									store_categories: cats
								};
							}
						}
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

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		const launchCommand = getLaunchCommand(details);
		return isGOGGame(launchCommand) || isEpicGame(launchCommand) || isUbisoftGame(launchCommand);
	}

	settingsComponent(): FC
		{
			const [language, setLanguage] = useState(this.language);
			return () => (
				   <Fragment>
					   <PanelSectionRow>
						   <TextField
								 label={"Language"}
								 description={"English language name (eg: english, italian, french, ...)"}
								 value={language}
								 onChange={(value) => {
									 setLanguage(value.target.value);
									 this.language = value.target.value;
								 }}
						   />
					   </PanelSectionRow>
				   </Fragment>
			)
		}
}