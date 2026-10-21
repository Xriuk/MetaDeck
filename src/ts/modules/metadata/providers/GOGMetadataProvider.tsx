import {ProviderCache, ProviderConfig} from "../../Provider";
import {MetadataProvider} from "../MetadataProvider";
import {MetadataData, StoreCategory} from "../../../Interfaces";
import {fetchNoCorsLegacyTimeout, getAppDetails, stripHtml} from "../../../util";
import {GamesDBResult} from "../../GamesDBResult";
import {getAutoLanguageOptions, getCurrentLanguage, getLanguageTitle, t, type Language} from "../../../useTranslations";
import {
	getLaunchCommand,
	getShortcutCategories
} from "../../../shortcuts";
import { SteamMetadataProvider } from "./SteamMetadataProvider";
import { SiGogdotcom } from "react-icons/si";
import { separator } from "../../resolvers/GOG/GOGMetadataProviderResolver";
import { DialogControlsSection, Field, Dropdown } from "@decky/ui";
import { useState } from "react";
import { useMetaDeckState } from "../../../MetaDeckState";

const langMap: Partial<Record<Language, string>> = {
	'en': 'en-US',
	'de': 'de-DE',
	'fr': 'fr-FR',
	'pl': 'pl-PL',
	'ru': 'ru-RU',

	'zhCn': 'zh-Hans',
	'es': 'es-ES'
};

type GOGStoreAPIEntity = {
	name: string;
}

type GOGStoreAPIEntry = {
	description?: string;
	overview?: string;
	_embedded?: {
		product: {
			title: string;
			globalReleaseDate?: string;
		};
		publishers?: GOGStoreAPIEntity[];
		developers?: GOGStoreAPIEntity[];
		features?: {
			id: string;
		}[];
	};
}

export interface GOGMetadataProviderConfig extends ProviderConfig<'gog_nsl' | 'gog_junk' | 'gog_heroic'>{
	// https://www.gog.com
	language: string | null;
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

	// Retrieve selected language, try guessing, or default to english
	get language(): string{
		return this.config.language
			?? langMap[getCurrentLanguage()]
			?? langMap['en']!;
	}

	set language(language: string | null){
		let current = this.language;
		this.config.language = language;
		void this.saveConfig();

		if(current != this.language)
			void this.clearModuleCache();
	}

	provide(appId: number): Promise<MetadataData | undefined>{
		if(this.excludedApps.includes(appId))
			return Promise.resolve(undefined);

		return this.throttle<MetadataData | undefined>(async () => {
			const details = await getAppDetails(appId);
			if (!details)
				return undefined;
			const resolved = await this.resolve(appId);
			if (!resolved)
				return undefined;
	
			const [platform, id] = resolved.toString().split(separator);
			if(platform !== "gog"){
				let response = await fetchNoCorsLegacyTimeout(
					"https://gamesdb.gog.com/platforms/{0}/external_releases/{1}"
						.replace("{0}", platform)
						.replace("{1}", id));
				if (response.ok){
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

					if (result.game_modes.some(m => m.slug === "single-player"))
						cats.push(StoreCategory.SinglePlayer);
					if (result.game_modes.some(m => m.slug === "multiplayer"))
						cats.push(StoreCategory.MultiPlayer);
					if (result.game_modes.some(m => m.slug === "co-operative"))
						cats.push(StoreCategory.CoOp);

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
			}
			else{
				let response = await fetchNoCorsLegacyTimeout(
					("https://api.gog.com/v2/games/{0}?locale=" + this.language)
						.replace("{0}", id));
				if (response.ok){
					const result: GOGStoreAPIEntry = await response.json();

					const cats = await getShortcutCategories(getLaunchCommand(details));

					if (result._embedded?.features?.some(f => f.id === "multi"))
						cats.push(StoreCategory.MultiPlayer);
					if (result._embedded?.features?.some(f => f.id === "single"))
						cats.push(StoreCategory.SinglePlayer);
					if (result._embedded?.features?.some(f => f.id === "coop"))
						cats.push(StoreCategory.CoOp);
					if (result._embedded?.features?.some(f => f.id === "controller_support"))
						cats.push(StoreCategory.FullController);

					return {
						id: id,
						title: result._embedded?.product.title ?? '',

						description: result.description ? stripHtml(result.description) : t("noDescription"),
						snippet: result.overview ? stripHtml(result.overview) : undefined,
						matches_user_language: true,
						
						release_date: result._embedded?.product.globalReleaseDate ?
							Math.floor(new Date(result._embedded.product.globalReleaseDate).getTime() / 1000) :
							undefined,
						developers: result._embedded?.developers?.map((dev) => ({name: dev.name, url: ""})),
						publishers: result._embedded?.publishers?.map((pub) => ({name: pub.name, url: ""})),
						store_categories: cats
					};
				}
			}

			return undefined;
		});
	}

	override icon = <SiGogdotcom/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [language, setLanguage] = useState(this.config.language);

		const currentLanguage = getCurrentLanguage();
		const defaultLanguage = langMap[currentLanguage] ? currentLanguage : 'en';

		return (
			<DialogControlsSection>
				<Field
					label={t("language")}
					childrenContainerWidth={'fixed'}>
					<Dropdown
						rgOptions={getAutoLanguageOptions(getLanguageTitle(defaultLanguage))
							.concat(Object.entries(langMap)
								.map(([lang, id]) => ({ data: id, label: getLanguageTitle(lang as Language) }))
								.sort((a, b) => a.label.localeCompare(b.label)))}
						selectedOption={language}
						disabled={loadingData.loading}
						onChange={(newVal) => {
							setLanguage(newVal.data);
							this.language = newVal.data;
						}} />
				</Field>
			</DialogControlsSection>
		);
	}
}