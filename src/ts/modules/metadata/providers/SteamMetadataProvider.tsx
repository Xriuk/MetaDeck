// https://blog.hloth.dev/moreofme/#reverse-engineering-steams-secret-apis

import { DialogControlsSection, Dropdown, Field, SliderField } from "@decky/ui";
import { useState } from "react";
import { StoreCategory, type MetadataData } from "../../../Interfaces";
import Logger from "../../../logger";
import { getCurrentLanguage, getLanguageTitle, t, type Language } from "../../../useTranslations";
import React from "react";
import { useMetaDeckState } from "../../../MetaDeckState";
import { IdOverrideComponent } from "../../IdOverrideComponent";
import { type FuzzySearchMetadataProviderConfig, type FuzzySearchMetadataProviderCache, FuzzySearchMetadataProvider } from "./FuzzySearchMetadataProvider";
import type { AppDetailsResponse } from "type-steamapi";
import { FaSteam } from "react-icons/fa";
import { fetchNoCorsLegacyTimeout } from "../../../util";

const langMap: Partial<Record<Language, string>> = {
	'ar': 'arabic',
	'bg': 'bulgarian',
	'zhCn': 'schinese',
	'zhTw': 'tchinese',
	'cs': 'czech',

	'da': 'danish',
	'nl': 'dutch',
	'en': 'english', // US
	'fi': 'finnish',
	'fr': 'french',

	'de': 'german',
	'el': 'greek',
	'hu': 'hungarian',
	'id': 'indonesian',
	'it': 'italian',

	'ja': 'japanese',
	'ko': 'koreana',
	'ms': 'malese',
	'no': 'norwegian',
	'pl': 'polish',

	'pt': 'portuguese',
	'ptBr': 'brazilian',
	'ro': 'romanian',
	'ru': 'russian',
	'es': 'spanish',

	'es419': 'latam',
	'sv': 'swedish',
	'th': 'thai',
	'tr': 'turkish',
	'uk': 'ukrainian',

	'vi': 'vietnamese'
};

export interface SteamMetadataProviderConfig extends FuzzySearchMetadataProviderConfig{
	// https://partner.steamgames.com/doc/store/localization/languages (API language code)
	language: string | null; // null will try to guess or fallback to english
}

export interface SteamMetadataProviderCache extends FuzzySearchMetadataProviderCache{
	
}

export class SteamMetadataProvider extends FuzzySearchMetadataProvider<"steam">{
	identifier = "steam" as const;
	title = t("providerMetadataSteam");

	logger: Logger = new Logger(this.identifier);

	// Retrieve selected language, try guessing, or default to english
	get language(): string{
		return this.config.language
			?? langMap[getCurrentLanguage()]
			?? langMap['en']!;
	}

	set language(language: string){
		this.config.language = language;
		void this.saveConfig();
	}

	protected async search(title: string): Promise<MetadataData[]>{
		// Basic fetchNoCors is buggy AF and the encoded JSON doesn't play well
		// (it throws when we have titles containing HTTP not encoded chars),
		// so we use legacy here...
		const response = (await fetchNoCorsLegacyTimeout("https://api.steampowered.com/IStoreQueryService/SearchSuggestions/v1/?input_json=" +
			encodeURIComponent(JSON.stringify({
				search_term: title,
				max_results: 5, // Will filter them by distance
				context:{
					"language": this.language,
					"country_code": "US", // Should not be needed
					"steam_realm": "1"
				},
				filters:{
					type_filters: { include_games: true }
				},
				data_request:{
					include_basic_info: true,
					include_release: true
				}
			}))));
		if (response.ok){
			let games: {
				response?: {
					store_items?: {
						id: number;
						name: string;
						categories?: {
							supported_player_categoryids?: number[];
							feature_categoryids?: number[];
							controller_categoryids?: number[];
						};
						basic_info?: {
							short_description?: string;
							publishers?: {
								name: string;
							}[];
							developers?: {
								name: string;
							}[];
						};
						release?: {
							steam_release_date?: number;
							original_release_date?: number; // May be 0
						};
					}[];
				};
			} = await response.json();
			if(!games.response?.store_items?.length)
				return [];

			return games.response.store_items.map(i => ({
				id: i.id,
				title: i.name,
				description: i.basic_info?.short_description || t("noDescription"),
				rating: undefined, // DEV: maybe retrieve from full page in enrich?
				release_date: i.release?.original_release_date || i.release?.steam_release_date || undefined,
				developers: i.basic_info?.developers?.map(d => ({ name: d.name, url: '' })),
				publishers: i.basic_info?.publishers?.map(p => ({ name: p.name, url: '' })),
				store_categories: (i.categories?.supported_player_categoryids ?? [])
					.concat(i.categories?.feature_categoryids ?? [])
					.concat(i.categories?.controller_categoryids ?? [])
					.filter(c => StoreCategory[c])
					.map(c => StoreCategory[StoreCategory[c] as any] as unknown as StoreCategory)
			}));
		}
		else if (response.status === 429)
			return this.throttle(() => this.search(title));
		else if (response.status >= 500)
			return[]
		else
			throw Error(`Could not find metadata for "${title}": \n${(await response.text())}`);
	}

	override icon = <FaSteam/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [language, setLanguage] = useState(this.language);
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("language")}
						childrenContainerWidth={'fixed'}>
						<Dropdown
							rgOptions={Object.entries(langMap)
								.map(([lang, id]) => ({ data: id, label: getLanguageTitle(lang as Language) }))
								.sort((a, b) => a.label.localeCompare(b.label))}
							selectedOption={language}
							disabled={loadingData.loading}
							onChange={(newVal) => {
								setLanguage(newVal.data);
								this.language = newVal.data;
							}} />
					</Field>
					<Field
						label={t("fuzziness")}
						description={
							<SliderField
								value={fuzziness}
								disabled={loadingData.loading}
								min={0}
								max={20}
								step={1}
								showValue={true}
								resetValue={5}
								editableValue={true}
								validValues={'steps'}
								onChange={(value) => {
									setFuzziness(value);
									this.fuzziness = value;
								}}
							/>
						} />
				</DialogControlsSection>

				<DialogControlsSection>
					<IdOverrideComponent
						source={this}
						value={overrides}
						disabled={loadingData.loading}
						onChange={async (value) => {
							let oldValue = this.overrides;
							setOverrides(value);
							this.overrides = value;
							await this.onOverridesChange(oldValue, value);
						}}
						resultsForApp={(appId) => this.throttle(() => this.getAllMetadataForGame(appId))}
						defaultResults={(results, appId) => this.pickDefaultEntry(results, appId)} />
				</DialogControlsSection>
			</>
		)
	}

	// Missing release_date
	public async getAppMetadata(appId: number, external = false): Promise<MetadataData | undefined>{
		if(!external && this.excludedApps.includes(appId))
			return undefined;

		// Currency code is required otherwise some entries are not returned successfully for some languages...
		let response = await fetchNoCorsLegacyTimeout(
			"https://store.steampowered.com/api/appdetails?appids={0}&l={1}&cc=EUR"
				.replace("{0}", appId.toString())
				.replace("{1}", this.language));
		if (!response.ok)
			return undefined;

		const result: Record<string, AppDetailsResponse> = await response.json();
		if(!result || Object.values(result).length !== 1)
			return undefined;
		
		let game = Object.values(result)[0];
		if(!game.success)
			return undefined;
		
		return {
			id: game.data.steam_appid,
			title: game.data.name,
			description: game.data.short_description || t("noDescription"),
			rating: game.data.metacritic?.score,
			release_date: undefined, // Cannot parse
			developers: game.data.developers.map(d => ({name: d, url: ""})),
			publishers: game.data.publishers.map(p => ({name: p, url: ""})),
			store_categories: game.data.categories
				.filter(c => StoreCategory[c.id])
				.map(c => StoreCategory[StoreCategory[c.id] as any] as unknown as StoreCategory)
		};
	}
}