import { call, callable, fetchNoCors, FileSelectionType, openFilePicker } from "@decky/api";
import { SteamAppTypeShortcut, type AchievementsData, type EntryData, type IDDictionary } from "../../../Interfaces";
import Logger from "../../../logger";
import { t, getLanguageTitle, type Language, getCurrentLanguage, getAutoLanguageOptions } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { AchievementsProvider } from "../AchievementsProvider";
import { FaXbox } from "react-icons/fa";
import { getLaunchCommand, romRegex } from "../../../shortcuts";
import { closestWithLimit, copyToClipboard, getAppDetails, getAppHeader, toasterToast } from "../../../util";
import { RAWGMetadataProvider } from "../../metadata/providers/RAWGMetadataProvider";
import { DialogControlsSection, Field, TextField, DialogButton, Toggle, Dropdown, SliderField, DialogControlsSectionHeader } from "@decky/ui";
import React, { useState } from "react";
import { Markdown } from "../../../markdown";
import { useMetaDeckState } from "../../../MetaDeckState";
import { cloneDeep } from "lodash-es";
import { removeAfterAndIncluding, removeBeforeAndIncluding } from "../../GamesDBResult";
import { IdOverrideComponent } from "../../IdOverrideComponent";
import { IdOverrideDlcComponent } from "../../IdOverrideDlcComponent";
import type { DBoxMarketplaceProductsResponse } from "../../resolvers/XeniaMarketplaceResolver";

const langMap: Partial<Record<Language, number>> = {
	'en': 1, // US
	'ja': 2,
	'de': 3,
	'fr': 4,
	'es': 5,

	'it': 6,
	'ko': 7,
	'zhTw': 8,
	'pt': 9,
	'zhCn': 10,
	
	'pl': 11,
	'ru': 12
};

const dlcPackedOffset = 2000;

// - DLC/Update achievements are stored inside /home/deck/Emulation/roms/xbox360/content/0000000000000000/<gameTitleId> (16 zeroes):
// /00000002/<dlcContentId>: folder which may contain "spa.bin" file which is like "default.xex". If "spa.bin" is not present,
// the DLC may still have achievemens through a title update
// /000B0000/<updateContentId>: folder which contains "default.xexp" file which needs to be patched onto "default.xex" with XexTool
// - /home/deck/Emulation/roms/xbox360/content/0000000000000000/<gameTitleId>/Headers:
// contains folders above, with files with NULL-terminated string of 2-bytes chars starting at offset 8 for the DLC/update title
// /00000002/<dlcContentId>.header
// /000B0000/<updateContentId>.header
type XeniaAchievement = {
	id: number;
	name: string;
	description_achieved: string;
	description_unachieved: string;
	icon_id: number;
	gamerscore: number;
	flags?: {
		type?: 'Completion' | 'Leveling' | 'Unlock' | 'Event' | 'Tournament' | 'Checkpoint' | 'Other';
		secret: boolean;
		earned_online: boolean;
		earned: boolean;
		edited: boolean;
	};

	unlock_time?: number; // Only in status call

	icon: string;
};

type XeniaGameContent = {
	list: {
		name: string;
		banner?: string;
	}[];
	achievements: Record<number, number>;
};

type XeniaGameAchievements = {
	achievements: XeniaAchievement[];
	dlcs?: XeniaGameContent;
	tus?: XeniaGameContent;
	rarity?: Record<number, number | null>;
};

type XeniaGameAchievementsStats = XeniaGameAchievements & {
	progress?: Record<number, XeniaAchievement>;
};

export interface XeniaAchievementsProviderConfig extends ProviderConfig<'xenia'>{
	// Like /home/deck/Emulation/roms/xbox360/content/<A010000011AA1111>/FFFE07D1/00010000/<A010000011AA1111>
	user_path: string | null;
	// https://github.com/xenia-project/xenia/blob/95a5c3ee250f80c3b9d139658649d9ffb6db3eec/src/xenia/xbox.h#L327-L346
	// https://github.com/XboxChef/XeXtractor/blob/5fb6d8b17e5d38a6100590ce43962fb0df07770b/XDBF.cs#L126
	language: number | null; // null will try to guess or fallback to english
	openxbl_api_key: string;

	gamerscore: boolean;
	description_locked: boolean | null; // null: show locked/unlocked, true: show locked, false: show unlocked

	achievement_types: boolean;
	dlcs: boolean;
	title_updates: boolean | null; // null: show as DLC, true/false: show/hide prefixes or create separate sets/add to base

	ta_fuzziness: number;
	ta_overrides: IDDictionary;

	dbox_fuzziness: number;
	dbox_overrides: IDDictionary; 	// Packed appId and TU index or DLC index + dlcPackedOffset (for offset)
									// (note, this is different from the indexes returned in AchievementData.dlcs):
									// marketplace product id guid

	dlc_ownership: boolean; // If true will check if the DLCs/TUs are owned/installed
	dlc_overrides: IDDictionary; // Packed appId and dlcId: ''
}

export interface XeniaAchievementsProviderCache extends ProviderCache{
	game_achievements: Record<number, XeniaGameAchievements | null>; // Cached without icons, or from RAWG
}

export class XeniaAchievementsProvider extends AchievementsProvider<"xenia">{
	identifier = "xenia" as const;
	title = t("providerCompatdataXenia");

	logger = new Logger(this.identifier);

	private xenia_get_all_achievements_game = callable<[string, string, number], string>("xenia_get_all_achievements_game");

	private _rawgProvider?: RAWGMetadataProvider;
	get rawgProvider(): RAWGMetadataProvider{
		if(!this._rawgProvider){
			this._rawgProvider = this.state.modules.metadata.providers.find(p => p instanceof RAWGMetadataProvider);
			if(!this._rawgProvider)
				this._rawgProvider = new RAWGMetadataProvider(this.state.modules.metadata);
		}

		return this._rawgProvider;
	}

	override get isValid(): boolean {
		return super.isValid && !!this.userPath;
	}

	get userPath(): string
	{
		return this.config.user_path ?? '';
	}

	set userPath(data: string)
	{
		this.config.user_path = data;
		void this.saveConfig();
	}

	// Retrieve selected language, try guessing, or default to english
	get language(): number{
		return this.config.language
			?? langMap[getCurrentLanguage()]
			?? langMap['en']!;
	}

	set language(language: number | null){
		let current = this.language;
		this.config.language = language;
		void this.saveConfig();

		if(current != this.language)
			void this.clearModuleCache();
	}

	get openXBLApiKey(): string{
		return this.config.openxbl_api_key;
	}

	set openXBLApiKey(data: string){
		this.config.openxbl_api_key = data;
		void this.saveConfig();
	}
	

	get gamerscore(): boolean
	{
		return this.config.gamerscore;
	}

	set gamerscore(data: boolean)
	{
		let current = this.gamerscore;
		this.config.gamerscore = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get descriptionLocked(): boolean | null
	{
		return this.config.description_locked;
	}

	set descriptionLocked(data: boolean | null)
	{
		let current = this.descriptionLocked;
		this.config.description_locked = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}


	get achievementTypes(): boolean
	{
		return this.config.achievement_types;
	}

	set achievementTypes(data: boolean)
	{
		let current = this.achievementTypes;
		this.config.achievement_types = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get dlcs(): boolean
	{
		return this.config.dlcs;
	}

	set dlcs(data: boolean)
	{
		let current = this.dlcs;
		this.config.dlcs = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get titleUpdates(): boolean | null
	{
		return this.config.title_updates;
	}

	set titleUpdates(data: boolean | null)
	{
		let current = this.titleUpdates;
		this.config.title_updates = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}


	get taFuzziness(): number{
		return this.config.ta_fuzziness;
	}

	set taFuzziness(fuzziness: number){
		this.config.ta_fuzziness = fuzziness;
		void this.saveConfig();
	}

	get taOverrides(): IDDictionary{
		return this.config.ta_overrides;
	}

	set taOverrides(data: IDDictionary){
		this.config.ta_overrides = data;
		void this.saveConfig();
	}


	get dboxFuzziness(): number{
		return this.config.dbox_fuzziness;
	}

	set dboxFuzziness(fuzziness: number){
		this.config.dbox_fuzziness = fuzziness;
		void this.saveConfig();
	}

	get dboxOverrides(): IDDictionary{
		return this.config.dbox_overrides;
	}

	set dboxOverrides(data: IDDictionary){
		this.config.dbox_overrides = data;
		void this.saveConfig();
	}


	get dlcOwnership(): boolean{
		return this.config.dlc_ownership;
	}

	set dlcOwnership(data: boolean){
		let current = this.dlcOwnership;
		this.config.dlc_ownership = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get dlcOverrides(): IDDictionary{
		return this.config.dlc_overrides;
	}

	set dlcOverrides(data: IDDictionary)
	{
		let current = this.dlcOverrides;
		this.config.dlc_overrides = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}


	get gameAchievements(): Record<number, XeniaGameAchievements | null>{
		return this.cache.game_achievements;
	}

	override async mount(): Promise<void> {
		// Try auto-detecting
		if(this.config.user_path == null)
			this.userPath = await call<[], string | null>("xenia_try_autodetect_user_path") ?? '';

		if(this.userPath){
			try{
				if(!await call<[string], boolean>("xenia_check_user_path", this.userPath))
					throw new Error("");
			}
			catch{
				toasterToast(t("xeniaPathError"), this);

				this.userPath = "";
			}
		}
	}

	protected async getAllTAForGame(appId: number): Promise<EntryData[]>{
		if(this.taOverrides[appId] === 0)
			return [];

		const details = await getAppDetails(appId);
		if(!details)
			return [];

		let response = await fetchNoCors('https://www.trueachievements.com/search-results?' + new URLSearchParams({
			cat: 'games',
			search: details.strDisplayName
		}).toString());
		if(!response.ok)
			return [];

		// Results
		let body = removeAfterAndIncluding(removeAfterAndIncluding(removeBeforeAndIncluding(removeBeforeAndIncluding(await response.text(), '<div class="section-hdr">'), '</div>'), '<div class="pagination bottomlinks">'), '</div>');

		const parser = new DOMParser();
		const doc = parser.parseFromString(body, "text/html");

		this.logger.debug('getAllTAForGame', appId, doc.body);

		let result: EntryData[] = [];
		for(let rowNode of doc.body.children){
			if(rowNode.nodeName !== 'A')
				continue;

			let name = '';
			for(let node of rowNode.children){
				if(!node.classList.contains('sst-game-info'))
					continue;

				for(let infoNode of node.children){
					if(infoNode.classList.contains('sst-game-name'))
						name = infoNode.textContent ?? '';
					else if(infoNode.classList.contains('sst-game-platforms') && name){
						for(let platformNode of infoNode.children){
							if(!platformNode.classList.contains('sst-platform-tag'))
								continue;

							if(platformNode.textContent === 'Xbox 360'){
								result.push({
									id: (rowNode as HTMLAnchorElement).getAttribute("href")!.split('/')[2],
									title: name
								});
							}
						}
					}
				}
				break;
			}
		}

		return result;
	}

	protected async pickDefaultTAEntry<Entry extends EntryData>(results: Entry[], appId: number): Promise<Entry[]>{
		const details = await getAppDetails(appId);
		if(!details)
			return [];

		const display_name = details.strDisplayName;
		const names = results.map(value => value.title);
		const closest_name = closestWithLimit(this.taFuzziness, display_name, names);

		return results.filter(value => value.title === closest_name);
	}

	// DLCs are product_type 8 and 15, we retrieve them all since we cannot filter by DLC name
	protected async getAllDBoxForGame(appId: number): Promise<EntryData[]>{
		if(this.dboxOverrides[appId] === 0)
			return [];

		const titleId = (await this.resolve(appId))?.toString();
		if(!titleId)
			return [];


		const retrieveCat = async (cat: number) => {
			let result: EntryData[] = [];

			let offset = 0;
			while(true){
				let response = await fetchNoCors('https://dbox.tools/api/marketplace/products/?' + new URLSearchParams({
					product_type: cat.toString(),
					title_id: titleId,
					limit: (100).toString(),
					offset: offset.toString()
				}).toString());
				if(!response.ok)
					break;

				let res: DBoxMarketplaceProductsResponse = await response.json();
				result.push(...res.items.map(i => ({
					title: i.default_title,
					id: i.product_id
				})));
				if(res.items.length < 100)
					break;

				offset += 100;
			}

			return result;
		}

		return [
			...(await retrieveCat(8)),
			...(await retrieveCat(15))
		].sort((a, b) => a.title.localeCompare(b.title));
	}

	protected async pickDefaultDBoxEntry<Entry extends EntryData>(results: Entry[], dlcName: string): Promise<Entry[]>{
		const names = results.map(value => value.title);
		const closest_name = closestWithLimit(this.taFuzziness, dlcName, names);

		return results.filter(value => value.title === closest_name);
	}

	// English name: achievement id
	protected async getAchievementsEnglishNames(
		achievements: XeniaGameAchievements,
		achievements_en: XeniaAchievement[] | undefined,
		rom: string,
		titleId: string): Promise<Record<string, number>>{

		let achievementsNames: Record<string, number> = {};
		if(this.language === langMap['en']){
			for(let achievement of achievements.achievements){
				achievementsNames[achievement.name] = achievement.id;
			}
		}
		else if(achievements_en?.length){
			for(let achievement of achievements_en){
				achievementsNames[achievement.name] = achievement.id;
			}
		}
		else{
			// DEV: should we try retrieving from DLCs? Maybe it's not worth it since this is just to retrieve the icons

			let result = await this.xenia_get_all_achievements_game(rom, titleId, langMap['en']!) ?? null;
			if(result){
				let englishAchievements = (JSON.parse(result ?? '[]') as XeniaAchievement[]);
				for(let achievement of englishAchievements){
					achievementsNames[achievement.name] = achievement.id;
				}
			}
		}

		return achievementsNames;
	}

	override async provide(appId: number): Promise<AchievementsData | undefined> {
		if(this.gameAchievements[appId] === null)
			return undefined;

		const titleId = (await this.resolve(appId))?.toString();
		if(!titleId){
			this.gameAchievements[appId] = null;
			return undefined;
		}

		const details = await getAppDetails(appId);
		if (!details){
			this.gameAchievements[appId] = null;
			return undefined;
		}
		
		const launchCommand = getLaunchCommand(details);
		const rom = launchCommand.match(romRegex)?.[0];
		if(!rom){
			this.gameAchievements[appId] = null;
			return undefined;
		}

		// Retrieve from cache first, since achievements data does not change
		let achievements: XeniaGameAchievementsStats;
		let achievements_en: XeniaAchievement[] | undefined;
		let achievementsNames: Record<string, number> | undefined; // English name: achievement id
		let source: 'dlcs_tus' | 'user' | 'game' | undefined;
		let progressRetrieved = false; // True if we retrieved progress
		if(this.gameAchievements[appId])
			achievements = cloneDeep(this.gameAchievements[appId]);
		else {
			achievements = { } as any;

			// Try retrieving the achievements from DLCs and title updates, we retrieve the longest set of achievements
			let result = await call<[string, string, string, number], string>("xenia_get_all_achievements_dlcs_title_updates", this.userPath, rom, titleId, this.language) ?? null;
			let dlcTu = JSON.parse(result ?? '{}') as {
				achievements: XeniaAchievement[],
				achievements_en: XeniaAchievement[],
				has_dlc: boolean,
				has_tu: boolean
			};
			achievements.achievements = dlcTu.achievements;
			achievements_en = dlcTu.achievements_en;
			if(achievements.achievements.length)
				source = 'dlcs_tus';
			else{
				// Retrieve progress, and maybe achievements from user
				result = await call<[string, string], string>("xenia_get_all_achievements_status", this.userPath, titleId) ?? null;
				achievements.progress = JSON.parse(result ?? '{}') as Record<number, XeniaAchievement>;
				progressRetrieved = true;

				// If we also have achievements (at least names) we populate them
				// DEV: we do this only if we have no DLCs or title updates, cause we don't know yet if they all get added or just when achieved
				achievements.achievements = Object.values(achievements.progress)
				if(achievements.achievements.every(a => a.name))
					source = 'user';
				else
					achievements.achievements = [];
			}

			// If we found nothing we search the game ROM
			if(!achievements.achievements.length){
				// Retrieve achievements info from the game rom
				result = await this.xenia_get_all_achievements_game(rom, titleId, this.language) ?? null;
				if(result)
					achievements.achievements = (JSON.parse(result ?? '[]') as XeniaAchievement[]);
				source = 'game';
			}

			// Retrieve achievements rarity, from Xbox Live or RAWG or compute it from Gamescore,
			// Also if we have RAWG we retrieve achievements icons to save on data size instead of using base 64
			if(this.openXBLApiKey){
				// Convert the title id from HEX to decimal
				let titleIdDec = Number("0x" + titleId);

				// Try XBL accounts with most Xbox 360 games/achievements in order
				// (https://www.trueachievements.com/leaderboard/gamer/achievementswon filtered by Xbox 360 platform),
				// since XBL API requires an account to see achievements rarity but we have no official user here...
				const xblAccounts = [
					'2681384242430661',
					'2745051201447500',
					'2533274806482793'
				];
				for(let accountId of xblAccounts){
					try{
						let response = await fetchNoCors(`https://api.xbl.io/v2/achievements/player/${accountId}/title/${titleIdDec}`, {
							headers: { 'X-Authorization': this.openXBLApiKey }
						});
						if(!response.ok){
							if(response.status === 403){
								toasterToast(t("apiKeyError"), this);

								this.logger.debug(`${appId} XBL key auth error`, await response.text());
								this.openXBLApiKey = '';
								break;
							}

							continue;
						}

						let result: {
							id: number;
							rarity?: {
								currentPercentage?: number;
							};
						}[] = [];
						while(true){
							let body: {
								content: {
									achievements: typeof result;
									pagingInfo?: {
										continuationToken: string | null
									};
								};
							} = await response.json();
							result.push(...body.content.achievements);
							
							if(!body.content.pagingInfo?.continuationToken)
								break;
							else{
								response = await fetchNoCors(`https://api.xbl.io/v2/achievements/player/${accountId}/title/${titleIdDec}/${body.content.pagingInfo.continuationToken}`, {
									headers: { 'X-Authorization': this.openXBLApiKey }
								});
								if(!response.ok){
									if(response.status === 403){
										toasterToast(t("apiKeyError"), this);

										this.logger.debug(`${appId} XBL key auth error`, await response.text());
										this.openXBLApiKey = '';
									}

									result = [];
									break;
								}
							}
						}

						if(result.length){
							achievements.rarity = {}
							for(let achievement of result){
								achievements.rarity[achievement.id] = achievement.rarity?.currentPercentage ?? null;
							}
							break;
						}

						if(!this.openXBLApiKey)
							break;
					}
					catch{ }
				}
			}
			if(this.rawgProvider.enabled && this.rawgProvider.apiKey){
				const rawgAchievements = await this.rawgProvider.getAchievementsForGame(appId);

				// If we have achievements we'll need to match them with local ones, but we need english titles
				if(rawgAchievements?.length){
					achievementsNames = await this.getAchievementsEnglishNames(achievements, achievements_en, rom, titleId);

					let setRarity = !achievements.rarity;

					if(Object.keys(achievementsNames).length){
						this.logger.debug("Matching RAWG achievements with names", rawgAchievements, achievementsNames);
						if(setRarity)
							achievements.rarity = {};
						for(let achievement of rawgAchievements){
							let achievementId = achievementsNames[achievement.name];
							if(!achievementId)
								continue;

							if(setRarity)
								achievements.rarity![achievementId] = achievement.percent ? parseFloat(achievement.percent) : null;

							achievements.achievements.find(a => a.id === achievementId)!.icon = achievement.image;
						}
						this.logger.debug("Achievements not matched:", achievements.achievements.filter(a => !a.icon));
					}
				}
			}
			if(!achievements.rarity){
				achievements.rarity = {};

				for(let achievement of achievements.achievements){
					// Default rarity to Gamerscore, make an estimate
					// https://github.com/justin-delano/PlayniteAchievements/blob/24b1bcab770277a645ef93f52795823739e0ae0e/source/Providers/Xenia/XeniaScanner.cs#L159
					let achievedPerc: number | null = null;
					if(achievement.gamerscore > 0){
						// Exponential decay model: P(GS) = 100 * e^(-0.023 * GS)
						achievedPerc = 100.0 * Math.exp(-0.023 * achievement.gamerscore);

						// Clamp output between 0.0% and 100.0%
						achievedPerc = Math.max(0.0, Math.min(100.0, achievedPerc));
					}

					achievements.rarity[achievement.id] = achievedPerc;
				}
			}

			if(achievements.achievements.length){
				let slug = this.taOverrides[appId];
				if(!slug){
					let results = await this.getAllTAForGame(appId);
					if(results.length){
						this.logger.debug("TrueAchievements results", results);

						let games = await this.pickDefaultTAEntry(results, appId);

						this.logger.debug(games[0]?.title ?? "", results.map(value => value.title));
						this.logger.debug("TrueAchievements games", games);

						slug = games[0]?.id!;
					}
				}

				if(slug){
					let response = await fetchNoCors(`https://www.trueachievements.com/game/${slug}/dlc`);
					if(response.ok){
						achievementsNames ??= await this.getAchievementsEnglishNames(achievements, achievements_en, rom, titleId);

						let body = removeAfterAndIncluding(removeBeforeAndIncluding(await response.text(), '</h1>'), '</main>'); // Page title -> End of body

						// Retrieve DLCs names and achievement names and match with achievementsNames below
						const parser = new DOMParser();
						const doc = parser.parseFromString(body, "text/html");

						let setName: string | undefined;
						let isTU = false;
						for(let node of doc.body.children){
							if(node.classList.contains('dlc')){
								setName = undefined;
								isTU = false;

								for(let childNode of node.children){
									if(!childNode.classList.contains('info'))
										continue;
									
									for(let infoNode of childNode.children){
										if(infoNode.classList.contains('img')){
											for(let imgNode of infoNode.children){
												if(imgNode.nodeName !== 'SPAN')
													continue;

												if((imgNode as HTMLSpanElement).textContent === 'Update')
													isTU = true;
											}
										}
										else if(infoNode.nodeName === 'H2'){
											let url = infoNode.firstElementChild;
											if(url?.nodeName === 'A')
												setName = (url as HTMLAnchorElement).text;
										}
									}

									if(setName){
										if(isTU){
											achievements.tus ??= {
												list: [],
												achievements: {}
											};
											achievements.tus.list.push({
												name: setName
											});
										}
										else{
											achievements.dlcs ??= {
												list: [],
												achievements: {}
											};
											achievements.dlcs.list.push({
												name: setName
											});
										}
									}

									break;
								}
							}
							else if(node.classList.contains('ach-panels') && setName){
								for(let childNode of node.children){
									if(childNode.nodeName !== 'LI')
										continue;
									
									for(let liNode of childNode.children){
										if(!liNode.classList.contains('title') || liNode.nodeName !== 'A')
											continue;

										let name = (liNode as HTMLAnchorElement).text;
										if(name && achievementsNames[name]){
											if(isTU){
												achievements.tus ??= {
													list: [],
													achievements: {}
												};
												achievements.tus.achievements[achievementsNames[name]] = achievements.tus.list.length - 1;
											}
											else{
												achievements.dlcs ??= {
													list: [],
													achievements: {}
												};
												achievements.dlcs.achievements[achievementsNames[name]] = achievements.dlcs.list.length - 1;
											}
										}
										break;
									}
								}

								setName = undefined;
								isTU = false;
							}
						}

						// Retrieve banners
						if(achievements.dlcs?.list.length){
							let dboxDlcOverrides = Object.keys(this.dboxOverrides)
								.map(id => this.module.unpackAppAndDlcIds(+id))
								.filter(([a, d]) => a === appId && d >= dlcPackedOffset);
							
							let isAllOverwritten = achievements.dlcs.list.every((_, i) => dboxDlcOverrides.some(([_, d]) => d - dlcPackedOffset === i));
							let results = !isAllOverwritten ? await this.getAllDBoxForGame(appId) : [];

							if(!isAllOverwritten)
								this.logger.debug("DBox results", results);

							for(let i = 0; i < achievements.dlcs.list.length; i++){
								let id = this.module.packAppAndDlcIds(appId, dlcPackedOffset + i);
								let product_id = this.dboxOverrides[id];
								if(!product_id){
									let dlcs = await this.pickDefaultDBoxEntry(results, achievements.dlcs.list[i].name);

									this.logger.debug(dlcs[0]?.title ?? "", results.map(value => value.title));
									this.logger.debug("DBox DLCs", dlcs);

									product_id = dlcs[0]?.id;
								}
								
								// Xbox 360 marketplace content is served over HTTP (not HTTPS) so we need to fetch through the backend
								if(product_id){
									try{
										achievements.dlcs.list[i].banner = await call<[string], string>("xenia_get_banner_icon", product_id.toString());
									}
									catch{}
								}
							}
						}
					}

					this.logger.debug(`${appId} DLCs: `, achievements.dlcs);
					this.logger.debug(`${appId} TUs: `, achievements.tus);
				}
				else
					this.logger.debug(`${appId} no DLCs/TUs info`);

				this.gameAchievements[appId] = cloneDeep(achievements);
				delete (this.gameAchievements[appId] as any).progress;
			}
			else
				this.gameAchievements[appId] = null;
		}

		if(!achievements.achievements.length)
			return undefined;

		// Retrieve achievements icons if needed
		for(let achievement of achievements.achievements){
			if(!achievement.icon){
				// Retrieve icon from user profile GPD first
				if(source === 'user')
					achievement.icon = await call<[string, string, number], string>("xenia_get_achievement_icon_user", this.userPath, titleId, achievement.icon_id) ?? '';
				
				// If not found retrieve from game ROM
				if(!achievement.icon)
					achievement.icon = await call<[string, string, number], string>("xenia_get_achievement_icon_game", rom, titleId, achievement.icon_id) ?? '';
			}
		}

		// Retrieve missing achievement icons from DLCs/TUs in bulk
		if(achievements.achievements.some(a => !a.icon)){
			// Cache all the icons in the backend
			await call<[string, string, string]>("xenia_cache_achievement_icons", this.userPath, rom, titleId);

			// Retrieve the cached icons
			for(let achievement of achievements.achievements){
				if(!achievement.icon)
					achievement.icon = await call<[string, number], string>("xenia_get_achievement_icon_cache", titleId, achievement.icon_id) ?? '';
			}

			// Clear the cache to save space
			await call<[string]>("xenia_clear_achievement_icons", titleId);
		}

		// Retrieve progress if using cached data (if the achivements were retrieved
		// from game it means we have no DLCs/TUs and no progress yet)
		if(!progressRetrieved && source !== 'game'){
			let result = await call<[string, string], string>("xenia_get_all_achievements_status", this.userPath, titleId) ?? null;
			achievements.progress = JSON.parse(result ?? '{}') as Record<number, XeniaAchievement>;
			this.logger.debug(`${appId} progress: `, achievements.progress);
		}
		else
			this.logger.debug(`${appId} no progress yet`);

		let result: AchievementsData = {
			title: details.strDisplayName,
			id: titleId,

			groups: []
		};

		let ownedDlcOverrides = Object.keys(this.dlcOverrides)
			.map(id => this.module.unpackAppAndDlcIds(+id))
			.filter(([a, _]) => a === appId)
			.map(([_, d]) => d);

		let multipleDLCs = (achievements.dlcs?.list.length && this.dlcs);
		let multipleTUs = (achievements.tus?.list.length && this.titleUpdates !== false);
		
		// Retrieve owned DLCs / TUs names
		let ownedDlcNames = await call<[string, string], string[]>("xenia_get_dlcs_owned_names", this.userPath, titleId);
		let ownedTuNames = await call<[string, string], string[]>("xenia_get_title_updates_owned_names", this.userPath, titleId);

		// Base game, title updates, DLCs
		for(let group of [{ name: '' } as NonNullable<typeof achievements.tus>['list'][number]].concat(achievements.tus?.list ?? []).concat(achievements.dlcs?.list ?? [])){
			let isBase = group.name === '';
			let isDlc = !isBase && achievements.dlcs?.list.includes(group);
			let multipleSets = (isDlc ? multipleDLCs : multipleTUs);

			// Add DLCs or TUs
			let dlcIndex: number | undefined;
			if(isDlc || (!isBase && this.titleUpdates === null)){
				let dlc = {
					name: group.name,
					image: group.banner
						?? getAppHeader(appId)
				} as NonNullable<AchievementsData['dlcs']>[number];

				result.dlcs ??= [];
				result.dlcs.push(dlc);
				dlcIndex = result.dlcs.length-1;

				// Check if the DLC/TU is owned
				dlc.owned = !this.dlcOwnership || ownedDlcOverrides.includes(dlcIndex) || !!closestWithLimit(5, group.name, (isDlc ? ownedDlcNames : ownedTuNames));

				// DEV: try retrieving game/dlc icon (id = 32768) if missing
				// https://github.com/XboxChef/XeXtractor/blob/807dd448c11d98e3dc8d428287cf0215c56244f2/XDBF.cs#L251
			}

			// Add groups
			if(isBase || multipleSets){
				// 1 + ... + 1 sets (achievementTypes=false)
				// 1 + 6 + ... + 1 + 6 sets (achievementTypes=true)
				result.groups.push({
					name: group.name,
					dlc: dlcIndex,
					achievements: []
				});
				if(this.achievementTypes){
					let baseName = (multipleSets ? `${(isBase ? t("defaultAchievementSet") : group.name)} - ` : "");
					result.groups.push(
						{
							name: baseName + t("xeniaAchievementTypeCompletion"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("xeniaAchievementTypeLeveling"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("xeniaAchievementTypeUnlock"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("xeniaAchievementTypeEvent"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("xeniaAchievementTypeTournament"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("xeniaAchievementTypeCheckpoint"),
							dlc: dlcIndex,
							achievements: []
						}
					);
				}
			}
		}

		for(let achievement of achievements.achievements){
			let tuIndex = achievements.tus?.achievements[achievement.id];
			let dlcIndex = achievements.dlcs?.achievements[achievement.id];
			let achievementGroupId = 0;
			if(tuIndex !== undefined){
				if(multipleTUs)
					achievementGroupId = 1 + tuIndex;
			}
			else if(dlcIndex !== undefined && multipleDLCs)
				achievementGroupId = 1 + (achievements.tus?.list.length ?? 0) + dlcIndex;

			let groupId = achievementGroupId * (this.achievementTypes ? 7 : 1);

			//this.logger.debug(`${appId} achievement group`, achievement.id, tuIndex, dlcIndex, achievementGroupId, groupId);

			let achieved = achievement.flags?.earned === true ||
				achievement.flags?.earned_online === true ||
				!!achievements.progress?.[achievement.id]?.unlock_time;

			let unlocked: number;
			if(achieved && achievements.progress?.[achievement.id]?.unlock_time){
				const fileTimeBigInt = BigInt(achievements.progress[achievement.id].unlock_time!);
	
				// 100-nanosecond intervals between Jan 1, 1601 and Jan 1, 1970
				const WINDOWS_TICK_OFFSET = 116444736000000000n;
				
				// Convert ticks to Unix epoch milliseconds
				unlocked = Number((fileTimeBigInt - WINDOWS_TICK_OFFSET) / 10000000n);
			}
			else
				unlocked = 0;

			let achievementType: string | undefined = undefined;
			if(this.achievementTypes){
				switch(achievement.flags?.type){
				case 'Completion':
					groupId += 1;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeCompletion");
					break;
				case 'Leveling':
					groupId += 2;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeLeveling");
					break;
				case 'Unlock':
					groupId += 3;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeUnlock");
					break;
				case 'Event':
					groupId += 4;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeEvent");
					break;
				case 'Tournament':
					groupId += 5;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeTournament");
					break;
				case 'Checkpoint':
					groupId += 6;
					if(!this.module.hasAchievementSetsSupport)
						achievementType = t("xeniaAchievementTypeCheckpoint");
					break;
				}
			}

			result.groups[groupId].achievements.push({
				bAchieved: achieved,
				bHidden: achievement.flags?.secret === true,
				flAchieved: achievements.rarity?.[achievement.id] ?? 0,
				rtUnlocked: unlocked,
				strDescription: [
					((this.gamerscore && achievement.gamerscore) ? `G ${achievement.gamerscore}` : undefined),
					achievementType,
					(((achieved && this.descriptionLocked == null) || this.descriptionLocked === false) ?
						achievement.description_achieved :
						achievement.description_unachieved)
				].filter(d => d).join(' - '),
				strID: achievement.id.toString(),
				strImage: achievement.icon,
				strName: achievement.name
			});
		}
		
		return result;
	}

	// Used for DLC overrides, backwards compatible
	protected override async onOverridesChange(oldOverrides: IDDictionary, newOverrides: IDDictionary): Promise<void> {
		// Retrieve changed ids: new values, values with changed ids and removed values,
		// and unpack the actual app ids
		let changedIds = Object.entries(newOverrides)
			.filter(([a, i]) => oldOverrides[a as any] !== i)
			.map(([a, _]) => a as unknown as number)
			.concat(Object.keys(oldOverrides).filter(a => !newOverrides[a as any]) as unknown as number[])
			.map(a => this.module.unpackAppAndDlcIds(+a)[0]);

		// Remove cache, not re-fetching because there might be a lot of entries, they will be fetched as needed
		await this.state.settings.runInDisabledSaveState(async () => {
			for(let changedId of changedIds){
				await this.module.removeCache(changedId);
			}
		});

		await this.saveCache();
	}

	override icon = <FaXbox/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [userPath, setUserPath] = useState(this.userPath ?? '');
		const [language, setLanguage] = useState(this.config.language);
		const [openXBLApiKey, setOpenXBLApiKey] = useState(this.openXBLApiKey);

		const [gamerscore, setGamerscore] = useState(this.gamerscore);
		const [descriptionLocked, setDescriptionLocked] = useState(this.descriptionLocked);

		const [achievementTypes, setAchievementTypes] = useState(this.achievementTypes);
		const [dlcs, setDlcs] = useState(this.dlcs);
		const [titleUpdates, setTitleUpdates] = useState(this.titleUpdates);

		const [taFuzziness, setTaFuzziness] = useState(this.taFuzziness);
		const [taOverrides, setTaOverrides] = useState(this.taOverrides);

		const [dboxFuzziness, setDboxFuzziness] = useState(this.dboxFuzziness);
		const [dboxOverrides, setDboxOverrides] = useState(this.dboxOverrides);

		const [dlcOwnership, setDlcOwnership] = useState(this.dlcOwnership);
		const [dlcOverrides, setDlcOverrides] = useState(this.dlcOverrides);


		const currentLanguage = getCurrentLanguage();
		const defaultLanguage = langMap[currentLanguage] ? currentLanguage : 'en';

		const authUrl = "https://xbl.io/login";
		const keysUrl = "https://xbl.io/dashboard/keys";

		const markdown = t("xeniaUserPathDesc")
			.replace("{xeniaPath}", "/home/deck/Emulation/roms/xbox360/content/<A010000011AA1111>/FFFE07D1/00010000/<A010000011AA1111>")
			.replace("{xeniaFile}", "Account") + "  \n" +
			t("xeniaUserPathInstructions") + "  \n" +
			"![Xenia Profile Menu](data:image/jpeg;base64,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)"
			;

		return (
			<>
				<DialogControlsSection>
					<DialogControlsSectionHeader>{t("settings")}</DialogControlsSectionHeader>
					<Field
						label={t("userPath")}
						description={
							<>
								<TextField
									value={userPath}
									disabled={loadingData.loading}
									onChange={(event) => {
										setUserPath(event.target.value);
										this.userPath = event.target.value;
									}}/>
								<Markdown>{markdown}</Markdown>
							</>
						}>
						<DialogButton
							disabled={loadingData.loading}
							onClick={async () => {
								let result = await openFilePicker(FileSelectionType.FOLDER, userPath || '/home', true, true, undefined, undefined, true, true);
								let resultPath = result.path ?? '';
								setUserPath(resultPath);
								this.userPath = resultPath;
							}}>
							{t("browse")}
						</DialogButton>
					</Field>
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

				<DialogControlsSection>
					<DialogControlsSectionHeader>{t("settingsDetails")}</DialogControlsSectionHeader>
					<Field
						label={t("xeniaGamerscore")}
						description={t("xeniaGamerscoreDesc")}>
						<Toggle
							value={gamerscore}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setGamerscore(checked);
								this.gamerscore = checked;
							}}/>
					</Field>
					<Field
						label={t('xeniaDescription')}
						description={t('xeniaDescriptionDesc')}
						childrenContainerWidth={'fixed'}>
						<Dropdown
							rgOptions={[
								{ data: null, label: t("xeniaDescriptionBoth") },
								{ data: true, label: t("xeniaDescriptionLocked") },
								{ data: false, label: t("xeniaDescriptionUnlocked") }
							]}
							selectedOption={descriptionLocked}
							disabled={loadingData.loading}
							onChange={(newVal) => {
								setDescriptionLocked(newVal.data);
								this.descriptionLocked = newVal.data;
							}} />
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<DialogControlsSectionHeader>{(this.module.hasAchievementSetsSupport ? t("settingsAchievementsSets") : t("settingsAchievementsPrefixes"))}</DialogControlsSectionHeader>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("xeniaAchievementTypesSets") : t("xeniaAchievementTypesPrefix"))}
						description={(this.module.hasAchievementSetsSupport ? t("xeniaAchievementTypesSetsDesc") : t("xeniaAchievementTypesPrefixDesc"))}>
						<Toggle
							value={achievementTypes}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setAchievementTypes(checked);
								this.achievementTypes = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("xeniaDlcsSets") : t("xeniaDlcsPrefix"))}
						description={(this.module.hasAchievementSetsSupport ? t("xeniaDlcsSetsDesc") : t("xeniaDlcsPrefixDesc"))}>
						<Toggle
							value={dlcs}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setDlcs(checked);
								this.dlcs = checked;
							}}/>
					</Field>
					{
						this.module.hasAchievementSetsSupport ?
							<Field
								label={t("xeniaTitleUpdatesSets")}
								description={t("xeniaTitleUpdatesSetsDesc")}
								childrenContainerWidth={'fixed'}>
								<Dropdown
									rgOptions={[
										{ data: true, label: t("settingsAchievementsCreateSetNormal") },
										{ data: null, label: t("settingsAchievementsCreateSetDlc") },
										{ data: false, label: t("settingsAchievementsCreateSetNone") }
									]}
									selectedOption={titleUpdates}
									disabled={loadingData.loading}
									onChange={(newVal) => {
										setTitleUpdates(newVal.data);
										this.titleUpdates = newVal.data;
									}} />
							</Field> :
							<Field
								label={t("xeniaTitleUpdatesPrefix")}
								description={t("xeniaTitleUpdatesPrefixDesc")}>
								<Toggle
									value={(titleUpdates ?? true)}
									disabled={loadingData.loading}
									onChange={(checked) => {
										setTitleUpdates(checked);
										this.titleUpdates = checked;
									}}/>
							</Field>
					}
				</DialogControlsSection>

				<DialogControlsSection>
					<DialogControlsSectionHeader>{t("xeniaTrueAchievements")}</DialogControlsSectionHeader>
					<Field
						label={t("fuzziness")}
						description={
							<SliderField
								value={taFuzziness}
								disabled={loadingData.loading}
								min={0}
								max={20}
								step={1}
								showValue={true}
								resetValue={5}
								editableValue={true}
								validValues={'steps'}
								onChange={(value) => {
									setTaFuzziness(value);
									this.taFuzziness = value;
								}}
							/>
						} />
					<IdOverrideComponent
						source={this}
						value={taOverrides}
						disabled={loadingData.loading}
						onChange={(value) => {
							let oldValue = this.taOverrides;
							setTaOverrides(value);
							this.taOverrides = value;
							void this.onOverridesChange(oldValue, value);
						}}
						resultsForApp={(appId) => this.throttle(() => this.getAllTAForGame(appId))}
						defaultResults={(results, appId) => this.pickDefaultTAEntry(results, appId)} />
				</DialogControlsSection>

				{ this.module.hasAchievementSetsSupport && <DialogControlsSection>
						<DialogControlsSectionHeader>{t("xeniaDBox")}</DialogControlsSectionHeader>
						<Field
							label={t("fuzziness")}
							description={
								<SliderField
									value={dboxFuzziness}
									disabled={loadingData.loading}
									min={0}
									max={20}
									step={1}
									showValue={true}
									resetValue={5}
									editableValue={true}
									validValues={'steps'}
									onChange={(value) => {
										setDboxFuzziness(value);
										this.dboxFuzziness = value;
									}}
								/>
							} />
						<IdOverrideDlcComponent
							source={this}
							value={dboxOverrides}
							disabled={loadingData.loading}
							onChange={(value) => {
								// Overrides' ids are already packed
								let oldValue = this.dboxOverrides;
								setDboxOverrides(value);
								this.dboxOverrides = value;
								void this.onOverridesChange(oldValue, value);
							}}
							resultsForApp={(appId) => Promise.resolve(
								(this.gameAchievements[appId]?.tus?.list ?? [])
									.map((t, i) => ({ id: i, title: t.name }))
									.concat((this.gameAchievements[appId]?.dlcs?.list ?? [])
										.map((d, i) => ({ id: dlcPackedOffset + i, title: d.name }))))}
							resultsForDlc={(appId, _) => this.throttle(() => this.getAllDBoxForGame(appId))}
							packAppAndDlc={(appId, dlc) => this.module.packAppAndDlcIds(appId, dlc)}
							unpackAppAndDlc={(id) => this.module.unpackAppAndDlcIds(id)}
							defaultResults={async (results, appId, dlc) => {
								let entries = dlc >= dlcPackedOffset ? this.gameAchievements[appId]?.dlcs?.list : this.gameAchievements[appId]?.tus?.list;
								if(dlc >= dlcPackedOffset)
									dlc -= dlcPackedOffset;
								if(!entries?.[dlc])
									return [];
								else
									return this.pickDefaultDBoxEntry(results, entries![dlc].name);
							}} />
					</DialogControlsSection>
				}

				<DialogControlsSection>
					<DialogControlsSectionHeader>{t("xeniaOpenXbl")}</DialogControlsSectionHeader>
					<Field
						label={t("xeniaOpenXblApiKey")}
						description={
							<TextField
								value={openXBLApiKey}
								disabled={loadingData.loading}
								onChange={(event) => {
									setOpenXBLApiKey(event.target.value);
									this.openXBLApiKey = event.target.value;
								}}/>
						} />
					<Field description={
						<Markdown>{t("xeniaOpenXBLApiKeyInstructions")
							.replace("{openXblUrl}", `[xbl.io](${authUrl})`)
							.replace("{keysUrl}", `[xbl.io/dashboard/keys](${keysUrl})`)
							.replace("{button}", "Create New Key")}</Markdown>
					}>
						<DialogButton
							onClick={() => void copyToClipboard(authUrl)}>
							{t("copyAuthUrl")}
						</DialogButton>
						<DialogButton
							onClick={() => void copyToClipboard(keysUrl)}>
							{t("copyKeyUrl")}
						</DialogButton>
					</Field>
				</DialogControlsSection>

				{
					this.module.hasAchievementSetsSupport && <DialogControlsSection>
						<DialogControlsSectionHeader>{t("settingsAchievementsDlcs")}</DialogControlsSectionHeader>
						<Field
							label={t("xeniaDlcOwnership")}
							description={t("xeniaDlcOwnershipDesc")}>
							<Toggle
								value={dlcOwnership}
								disabled={loadingData.loading}
								onChange={(checked) => {
									setDlcOwnership(checked);
									this.dlcOwnership = checked;
								}}/>
						</Field>
						{
							dlcOwnership && <IdOverrideComponent
								label={t("settingsDlcOverrides")}
								description={t("settingsDlcOverridesDesc")}
								source={this}
								value={dlcOverrides}
								disabled={loadingData.loading}
								onChange={(value) => {
									let oldValue = this.dlcOverrides;

									// Convert appId: dlc id to packed
									let newValue: IDDictionary = {};
									for(let appId in value){
										if(appStore.GetAppOverviewByAppID(+appId)?.app_type == SteamAppTypeShortcut)
											newValue[this.module.packAppAndDlcIds(+appId, +value[appId])] = '';
										else
											newValue[appId] = '';
									}

									setDlcOverrides(newValue);
									this.dlcOverrides = newValue;
									void this.onOverridesChange(oldValue, newValue);
								}}
								resultsForApp={async (appId) => {
									// Packed appId + dlcId comes from config,
									// just appId comes from dropdown options
									let [realAppId, _] = this.module.unpackAppAndDlcIds(appId);
									if(appStore.GetAppOverviewByAppID(realAppId)?.app_type == SteamAppTypeShortcut){
										return [{
											title: '',
											id: ''
										}];
									}
									else{
										let data = await this.provide(appId);
										return (data?.dlcs
											?.filter(d => d.name !== t("otherDlcsAchievementSet"))
											.map((d, i) => ({
												title: d.name,
												id: i
											})) ?? []);
									}
								}} />
						}
					</DialogControlsSection>
				}
			</>
		)
	}
}