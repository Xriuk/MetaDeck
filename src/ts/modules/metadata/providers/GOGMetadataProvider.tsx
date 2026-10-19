import {ProviderCache, ProviderConfig} from "../../Provider";
import {MetadataProvider} from "../MetadataProvider";
import {MetadataData, StoreCategory} from "../../../Interfaces";
import {fetchNoCorsLegacyTimeout, getAppDetails} from "../../../util";
import {GamesDBResult} from "../../GamesDBResult";
import {getCurrentLanguage, t} from "../../../useTranslations";
import {
	getLaunchCommand,
	getShortcutCategories
} from "../../../shortcuts";
import { SteamMetadataProvider } from "./SteamMetadataProvider";
import { SiGogdotcom } from "react-icons/si";
import { separator } from "../resolvers/GOG/GOGMetadataProviderResolver";

export interface GOGMetadataProviderConfig extends ProviderConfig<'gog_nsl' | 'gog_junk' | 'gog_heroic'>{
	
}

export interface GOGMetadataProviderCache extends ProviderCache{

}

export class GOGMetadataProvider extends MetadataProvider<"gog">{
	identifier = "gog" as const;
	title = t("providerMetadataGOG");

	private _steamProvider?: SteamMetadataProvider;
	get steamProvider(): SteamMetadataProvider{
		if(!this._steamProvider){
			this._steamProvider = this.module.providers.find(p => p instanceof SteamMetadataProvider);
			if(!this._steamProvider)
				this._steamProvider = new SteamMetadataProvider(this.module);
		}

		return this._steamProvider;
	}

	provide(appId: number): Promise<MetadataData | undefined>{
		if(this.excludedApps.includes(appId))
			return Promise.resolve(undefined);

		return this.throttle(async () => {
			const details = await getAppDetails(appId);
			if (!details)
				return undefined;
			const resolved = await this.resolve(appId);
			if (!resolved)
				return undefined;
	
			const [platform, id] = resolved.toString().split(separator);

			let response = await fetchNoCorsLegacyTimeout(
				"https://gamesdb.gog.com/platforms/{0}/external_releases/{1}"
					.replace("{0}", platform)
					.replace("{1}", id));
			if (response.ok)
			{
				const result: GamesDBResult = await response.json();

				const cats = await getShortcutCategories(getLaunchCommand(details));

				// If we have a steam id we query that first to get more accurate results
				if(result.game.releases.some(r => r.platform_id === "steam") && this.steamProvider.enabled){
					let steam = await this.steamProvider.getAppMetadata(parseInt(result.game.releases.find(r => r.platform_id === "steam")?.external_id ?? '0', 10), true);
					if(steam){
						steam.release_date = Math.floor(new Date(result.game.first_release_date).getTime() / 1000);
						steam.store_categories = [
							...(steam.store_categories ?? []),
							...cats
						];

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
					matches_user_language: getCurrentLanguage() === "en",

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