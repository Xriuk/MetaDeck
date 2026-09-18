// https://blog.hloth.dev/moreofme/#reverse-engineering-steams-secret-apis

import { PanelSectionRow, SliderField, TextField } from "@decky/ui";
import { FC, useState, Fragment } from "react";
import { StoreCategory, type MetadataData } from "../../../../Interfaces";
import Logger from "../../../../logger";
import { t } from "../../../../useTranslations";
import { IdOverrideComponent, type Entry } from "../../../IdOverrideComponent";
import type { MetadataProviderConfigs } from "../../MetadataModule";
import { FuzzySearchMetadataProvider, type FuzzySearchMetadataProviderCache, type FuzzySearchMetadataProviderConfig } from "../FuzzySearchMetadataProvider";

export interface SteamMetadataProviderConfig extends FuzzySearchMetadataProviderConfig
{
	language: string
}

export interface SteamMetadataProviderCache extends FuzzySearchMetadataProviderCache
{
}

export class SteamMetadataProvider extends FuzzySearchMetadataProvider
{

	static identifier: keyof MetadataProviderConfigs = "steam";
	static title: string = t("providerMetadataSteam");
	identifier: keyof MetadataProviderConfigs = SteamMetadataProvider.identifier;
	title: string = SteamMetadataProvider.title;

	logger: Logger = new Logger(SteamMetadataProvider.identifier)

	get language(): string
	{
		return this.module.config.providers.steam.language;
	}

	set language(language: string)
	{
		this.module.config.providers.steam.language = language;
		void this.module.saveData();
	}
	

	protected async search(title: string): Promise<MetadataData[]>
	{
		// Basic fetchNoCors is buggy AF and the encoded JSON doesn't play well
		// (it throws when we have titles containing HTTP not encoded chars),
		// so we use legacy here...
		const response = (await DeckyPluginLoader.legacyFetchNoCors("https://api.steampowered.com/IStoreQueryService/SearchSuggestions/v1/?input_json=" +
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
			})), {
				method: 'GET'
			}));
		if (response.success && typeof response.result !== 'string')
		{
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
			} = JSON.parse(response.result?.body ?? "{}");
			if(!games.response?.store_items?.length)
				return [];

			return games.response.store_items.map(i => ({
				id: i.id,
				title: i.name,
				description: i.basic_info?.short_description || t("noDescription"),
				rating: undefined, // DEV: maybe retrieve from full page in getMetadataForGame?
				release_date: i.release?.original_release_date || i.release?.steam_release_date || undefined,
				developers: i.basic_info?.developers?.map(d => ({ name: d.name, url: '' })),
				publishers: i.basic_info?.publishers?.map(p => ({ name: p.name, url: '' })),
				store_categories: (i.categories?.supported_player_categoryids ?? [])
					.concat(i.categories?.feature_categoryids ?? [])
					.concat(i.categories?.controller_categoryids ?? [])
					.filter(c => StoreCategory[c])
					.map(c => StoreCategory[StoreCategory[c] as any] as unknown as StoreCategory)
			}));
		} else if (typeof response.result !== 'string' && response.result?.status === 429)
		{
			return this.throttle(() => this.search(title));
		} else if (typeof response.result !== 'string' && response.result?.status && response.result.status >= 500) return[]
		else throw Error(`Could not find metadata for "${title}": \n${(typeof response.result === 'string' ? response.result : response.result?.body)}`);
	}

	settingsComponent(): FC
	{
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);
		const [language, setLanguage] = useState(this.language);
		return () => (
			<Fragment>
				<PanelSectionRow>
					<SliderField
							label={"Search Fuzziness"}
							value={fuzziness}
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
				</PanelSectionRow>
				<PanelSectionRow>
					<IdOverrideComponent
							value={overrides}
							onChange={(value) => {
								setOverrides(value)
								this.overrides = value
							}}
							resultsForApp={async (appId) => {
								const ret: Record<number, Entry<number>> = {}
								for (const [id, value] of Object.entries(await this.throttle(() => this.getAllMetadataForGame(appId)) ?? []))
								{
									ret[+id] = {
										label: appStore.GetAppOverviewByAppID(appId).display_name,
										title: value.title,
										id: +id,
										appId: appId
									}
								}
								return ret;
							}}
					/>
				</PanelSectionRow>
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