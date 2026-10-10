import { DialogControlsSection, Field, SliderField, TextField } from "@decky/ui";
import { useState } from "react";
import { StoreCategory, type ID, type MetadataData } from "../../../Interfaces";
import Logger from "../../../logger";
import {
	getShortcutCategories, isXeniaGame, isRPCS3Game, isXemuGame,
	isShadPS4Game, isPCSX2Game, isDuckstationGame, isDolphinGame, isCemuGame, isMelonDSGame, isMGBAGame,
	isPPSSPPGame, isRosaliesMupenGUIGame, isVita3KGame, isNSLGame, isJunkStoreGame,
	isHeroicGame, isFlycastGame,
	getLaunchCommand,
	isRyujinxGame
} from "../../../shortcuts";
import { t } from "../../../useTranslations";
import { distanceWithLimit, closestWithLimit, getAppDetails, fetchNoCorsLegacyTimeout, toasterToast } from "../../../util";
import { Markdown } from "../../../markdown";
import { useMetaDeckState } from "../../../MetaDeckState";
import React from "react";
import { IdOverrideComponent, type OverrideEntry } from "../../IdOverrideComponent";
import type { MetadataProviderConfigs } from "../MetadataModule";
import { type FuzzySearchMetadataProviderConfig, type FuzzySearchMetadataProviderCache, FuzzySearchMetadataProvider } from "./FuzzySearchMetadataProvider";
import { FaR } from "react-icons/fa6";

type RAWGAchievement = {
	name: string;
	image: string;
	percent: string;
};

export interface RAWGMetadataProviderConfig extends FuzzySearchMetadataProviderConfig
{
	api_key: string
}

export interface RAWGMetadataProviderCache extends FuzzySearchMetadataProviderCache
{
	
}

export class RAWGMetadataProvider extends FuzzySearchMetadataProvider
{
	static identifier: keyof MetadataProviderConfigs = "rawg";
	static title: string = t("providerMetadataRAWG");
	identifier: keyof MetadataProviderConfigs = RAWGMetadataProvider.identifier;
	title: string = RAWGMetadataProvider.title;

	logger: Logger = new Logger(RAWGMetadataProvider.identifier)

	get apiKey(): string
	{
		return this.module.config.providers.rawg.api_key;
	}

	set apiKey(api_key: string)
	{
		this.module.config.providers.rawg.api_key = api_key;
		void this.module.saveConfig();
	}

	private async getPlatformIds(appId: number): Promise<string | undefined>{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		if(isNSLGame(launchCommand) || isJunkStoreGame(launchCommand) || isHeroicGame(launchCommand))
			return '4,5,6'; // PC / macOS / Linux

		else if(isXemuGame(launchCommand))
			return '80'; // Xbox
		else if(isXeniaGame(launchCommand))
			return '14'; // Xbox 360

		else if(isDuckstationGame(launchCommand))
			return '27'; // PlayStation
		else if(isPCSX2Game(launchCommand))
			return '15'; // PlayStation 2
		else if(isRPCS3Game(launchCommand))
			return '16'; // PlayStation 3
		else if(isShadPS4Game(launchCommand))
			return '18'; // PlayStation 4
		else if(isPPSSPPGame(launchCommand))
			return '17'; // PSP
		else if(isVita3KGame(launchCommand))
			return '19'; // PS Vita

		else if(isDolphinGame(launchCommand))
			return '11,105'; // Wii / GameCube
		else if(isCemuGame(launchCommand))
			return '10'; // WiiU
		else if(isMelonDSGame(launchCommand))
			return '9,13,8'; // Nintendo DS / Nintendo DSi / Nintendo 3DS
		else if(isMGBAGame(launchCommand))
			return '26,43,24'; // Game Boy / Game Boy Color / Game Boy Advance
		else if(isRosaliesMupenGUIGame(launchCommand))
			return '83'; // Nintendo 64
		else if(isRyujinxGame(launchCommand))
			return '7'; // Switch

		else if(isFlycastGame(launchCommand))
			return '106'; // Dreamcast
		
		else
			return undefined; // Unknown (match all)
	}

	override async test(appId: number): Promise<boolean>
	{
		if(!this.apiKey || this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return false;

		const details = await getAppDetails(appId);
		if(!details)
			return false;

		const display_name = details.strDisplayName;
		const platform_ids = await this.getPlatformIds(appId);
		const results = await this.throttle(() => this.search(display_name, platform_ids));

		const names = results.map(value => value.title);
		const closest_names = distanceWithLimit(this.fuzziness, display_name, names);
		return closest_names.length > 0;
	}

	// RAWG API sometimes returns 502 randomly, so we retry
	private async fetchNoCorsWithRetry(url: string, times = 0): Promise<Response>{
		let response = await fetchNoCorsLegacyTimeout(url);
		if(!response.ok && (response.status === 429 || response.status === 502) && times < 5)
			return this.throttle(() => this.fetchNoCorsWithRetry(url, times + 1));
		else
			return response;
	}

	protected async search(title: string, platformIds?: string | undefined): Promise<MetadataData[]>
	{
		if(!this.apiKey)
			return [];

		let params: Record<string, string> = {
			key: this.apiKey,
			search: title,
			page_size: '10' // Will filter them by distance
		};
		if(platformIds)
			params.platforms = platformIds;
		const response = await this.fetchNoCorsWithRetry("https://api.rawg.io/api/games?" + new URLSearchParams(params).toString());
		if (response.ok)
		{
			let games: {
				results?: {
					name: string;
					released?: string; // yyyy-MM-dd
					metacritic?: number;
					id: number;
					tags?: {
						slug: string;
						language: string; // eng
					}[];
				}[];
			} = await response.json();
			if(!games.results?.length)
				return [];

			const tagsMatching: Record<string, StoreCategory> = {
				'singleplayer': StoreCategory.SinglePlayer,
				'multiplayer': StoreCategory.MultiPlayer,
				'co-op': StoreCategory.CoOp,
				'demo': StoreCategory.Demo,
				'hdr-available': StoreCategory.HDRSupported, // DEV: or HdrRendering?
				'captions-available': StoreCategory.CaptionsAvailable,
				'partial-controller-support': StoreCategory.PartialController,
					'controller': StoreCategory.PartialController, // DEV: maybe full?
					'controller-support': StoreCategory.PartialController, // DEV: maybe full?
				'mmo': StoreCategory.MMO,
					'mmorpg': StoreCategory.MMO,
				'split-screen': StoreCategory.SplitScreen,
				'cross-platform-multiplayer': StoreCategory.CrossPlatformMultiPlayer,
				'full-controller-support': StoreCategory.FullController,
				'vr': StoreCategory.VRSupport, // DEV: or VRSupported?
				'online': StoreCategory.OnlineMultiPlayer,
					'online-multiplayer': StoreCategory.OnlineMultiPlayer,
				'4-player-local': StoreCategory.LocalMultiPlayer,
					'local-multiplayer': StoreCategory.LocalMultiPlayer,
				'online-co-op': StoreCategory.OnlineCoOp,
				'local-co-op': StoreCategory.LocalCoOp,
				'pvp': StoreCategory.PVP,
				'great-soundtrack': StoreCategory.HighQualitySoundtrackAudio
			};

			return games.results.map(i => ({
				id: i.id,
				title: i.name,

				description: '', // Will enrich later
				rating: i.metacritic,
				release_date: i.released ? Math.floor(new Date(i.released).getTime() / 1000) : undefined,
				store_categories: i.tags
					?.map(t => tagsMatching[t.slug])
					.filter(t => t)
						?? []
			}));
		}
		else if (response.status === 429)
			return this.throttle(() => this.search(title, platformIds));
		else if (response.status >= 500)
			return[]
		else{
			// Clear to avoid errors
			if(response.status == 403){
				toasterToast(t("apiKeyError"), this);

				this.apiKey = '';
			}
			
			throw Error(`Could not find metadata for "${title}": \n${await response.text()}`);
		}
	}

	protected override async enrichMetadataForGame(appId: number, game: MetadataData): Promise<void> {
		if(game.description)
			return;

		if(!this.apiKey){
			game.description = t("noDescription"); // To not enrich again
			return;
		}

		const details = (await getAppDetails(appId))!;
		game.store_categories = game.store_categories.concat(await getShortcutCategories(getLaunchCommand(details)));

		const response = await this.fetchNoCorsWithRetry(`https://api.rawg.io/api/games/${game.id}?key=${this.apiKey}`);
		if(!response.ok){
			game.description = t("noDescription"); // To not enrich again
			return;
		}

		let gameR: {
			description_raw?: string;
			developers?: {
				name: string;
			}[];
			publishers?: {
				name: string;
			}[];
		} = await response.json();
		
		game.description = gameR.description_raw || t("noDescription");
		game.developers = gameR.developers?.map(d => ({ name: d.name, url: '' }));
		game.publishers = gameR.publishers?.map(p => ({ name: p.name, url: '' }));
	}

	protected override async getMetadataForGame(appId: number, external = false): Promise<MetadataData | undefined>
	{
		if((!external && this.excludedApps.includes(appId)) || this.overrides[appId] === 0)
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching metadata for game ${appId}`)

		const display_name = details.strDisplayName;
		const platform_ids = await this.getPlatformIds(appId);
		const results = await this.search(display_name, platform_ids);
		if (!results.length)
			return undefined;

		this.logger.debug("Results", results);

		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);

		let games: MetadataData[];
		if (data_id === undefined)
		{
			const names = results.map(value => value.title);
			const closest_name = closestWithLimit(this.fuzziness, display_name, names);
			this.logger.debug(closest_name, names);

			games = results.filter(value => value.title === closest_name);
			this.logger.debug("Games: ", games);
		}
		else
			games = results.filter(value => value.id === data_id);

		const game = games.reverse().pop();
		if (game)
		{
			game.store_categories = game.store_categories.concat(await getShortcutCategories(getLaunchCommand(details)));

			await this.enrichMetadataForGame(appId, game);
		}
		this.logger.debug(game);
		return game;
	}

	protected override async getAllMetadataForGame(appId: number): Promise<Record<ID, Pick<MetadataData, 'title' | 'id'>> | undefined>
	{
		if(this.excludedApps.includes(appId))
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		const display_name = details.strDisplayName;
		const platform_ids = await this.getPlatformIds(appId);
		const results = await this.search(display_name, platform_ids);

		// We add all results without limiting them for overrides
		if (!results.length)
			return undefined;

		let ret: Record<ID, MetadataData> = {};
		for (let game of results){
			ret[game.id] = game;
		}
		return ret;
	}

	override icon = <FaR/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [apiKey, setApiKey] = useState(this.apiKey);
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);
		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("apiKey")}
						description={
							<TextField
								value={apiKey}
								disabled={loadingData.loading}
								onChange={(event) => {
									setApiKey(event.target.value);
									this.apiKey = event.target.value;
								}}/>
						} />
					<Field description={
						<Markdown>
							{t("rawgApiKeyInstructionsMD")}
						</Markdown>
					} />
				</DialogControlsSection>

				<DialogControlsSection>
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
						provider={this}
						value={overrides}
						disabled={loadingData.loading}
						onChange={async (value) => {
							let oldValue = this.overrides;
							setOverrides(value);
							this.overrides = value;
							await this.onOverridesChange(oldValue, value);
						}}
						resultsForApp={async (appId) => {
							const ret: Record<ID, OverrideEntry<ID>> = {}
							for (const [id, value] of Object.entries(await this.throttle(() => this.getAllMetadataForGame(appId)) ?? []))
							{
								ret[id] = {
									label: appStore.GetAppOverviewByAppID(appId).display_name,
									title: value.title,
									id: id,
									appId: appId
								}
							}
							return ret;
						}} />
				</DialogControlsSection>
			</>
		)
	}


	public async getAchievementsForGame(appId: number): Promise<RAWGAchievement[] | undefined>{
		const metadata = await this.getMetadataForGame(appId, true);
		if(!metadata)
			return undefined;

		let totalAchievements: {
			name: string;
			image: string;
			percent: string;
		}[] = [];
		let achievements: {
			next: string | null;
			results: typeof totalAchievements;
		} = {
			next: `https://api.rawg.io/api/games/${metadata.id}/?` + new URLSearchParams({
				key: this.apiKey
			}).toString(),
			results: []
		};
		let response: Response;
		do{
			response = await this.fetchNoCorsWithRetry(achievements.next!);
			if(response.ok){
				achievements = await response.json();
				totalAchievements.push(...(achievements.results ?? []));
			}
		}
		while(response.ok && achievements.next);

		return totalAchievements;
	}
}