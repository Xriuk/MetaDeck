import { call, callable, fetchNoCors, FileSelectionType, openFilePicker } from "@decky/api";
import Logger from "../../../logger";
import { t, getLanguageTitle, getCurrentLanguage, type Language, getAutoLanguageOptions } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { AchievementsProvider } from "../AchievementsProvider";
import { SteamAppTypeShortcut, type AchievementsData, type IDDictionary } from "../../../Interfaces";
import { getUserTrophiesEarnedForTitle, type AuthTokensResponse, type UserThinTrophy } from "psn-api";
import { copyToClipboard, fetchNoCorsLegacyTimeout, getAppDetails, getAppHeader, toasterToast } from "../../../util";
import { getLaunchCommand, romRegex } from "../../../shortcuts";
import { rpcs3RomPathRegex, type MultiIdRPCS3Resolver } from "../../resolvers/MultiId/MultiIdRPCS3Resolver";
import { SiPlaystation3 } from "react-icons/si";
import { useState } from "react";
import { useMetaDeckState } from "../../../MetaDeckState";
import { DialogButton, DialogControlsSection, DialogControlsSectionHeader, Dropdown, Field, TextField, Toggle } from "@decky/ui";
import React from "react";
import { Markdown } from "../../../markdown";
import { RAWGMetadataProvider } from "../../metadata/providers/RAWGMetadataProvider";
import { cloneDeep } from "lodash-es";
import { separator } from "../../resolvers/MultiId/MultiIdResolver";
import { closest, distance } from "fastest-levenshtein";
import { IdOverrideComponent } from "../../IdOverrideComponent";

const psnHeaders = {
	"Content-Type": "application/x-www-form-urlencoded",
	Authorization: "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A="
};

type SerialStationStoreProducts = {
	items: {
		id: string;
		localization?: {
			name?: string;
			release_date?: string; // ISO timestamp
		};
	}[];
};

const langMap: Partial<Record<Language, string>> = {
	'ja': '00',
	'en': '01', // US
	'fr': '02',
	'es': '03',
	'de': '04',

	'it': '05',
	'nl': '06',
	'pt': '07',
	'ptBr': '17',
	'ru': '08',

	'ko': '09',
	'zhCn': '11',
	'zhTw': '10',
	'fi': '12',
	'sv': '13',
									
	'da': '14',
	'no': '15',
	'pl': '16',
	// '18' is en UK
	'tr': '19'
};

// Hierarchy: set > group (gid)/pid (000 + N + -1) > trophies
// ICON0.PNG - Base game icon
// GR001.PNG - Group icon
// TROP000.PNG - Trophy icon
type RPCS3GameTrophies = {
	game?: {
		name?: string;
		detail?: string;
	};
	groups?: {
		id: string;
		name?: string;
		detail?: string;
		content_ids?: string[]; // RAP files to check for ownership/installation of DLC
	}[];
	trophies: {
		id: string;
		pid: string; // If gid is not null pid is ignored, if gid is null and pid is not "000" (except Platinum, id = "000"), then it is assumed to be a generic dlc
		gid?: string; // If non null is named dlc
		hidden?: boolean;
		type: 'P' | 'G' | 'S' | 'B';
		name: string;
		detail?: string;

		icon: string;
	}[];
	rarity?: Pick<UserThinTrophy, 'trophyId' | 'trophyEarnedRate'>[];
};

type RPCS3TrophyStatus = {
	unlocked?: boolean;
	unlock_time_utc?: number; // UNIX timestamp
};

type RPCS3GameTrophiesStats = RPCS3GameTrophies & {
	progress?: Record<string, RPCS3TrophyStatus>
};

export interface RPCS3AchievementsProviderConfig extends ProviderConfig<'rpcs3_npwr'>{
	// Like /home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001
	user_path: string;
	// https://github.com/justin-delano/PlayniteAchievements/blob/24b1bcab770277a645ef93f52795823739e0ae0e/source/Providers/RPCS3/Rpcs3TrophyParser.cs#L789
	// https://www.psdevwiki.com/ps3/Languages
	language: string | null; // null will try to guess or fallback to english
	psn_npsso: string; // 64-chars token to access PSN API

	trophy_categories: boolean;
	trophy_sets: boolean; // Multiple trophy sets
	trophy_groups: boolean; // Multiple groups inside one trophy set (Main (000) + ... + Default (-1))

	dlc_ownership: boolean; // If true will check if the DLCs in trophy groups are owned/installed
	dlc_overrides: IDDictionary; // Packed appId and dlcId: ''
}

export interface RPCS3AchievementsProviderCache extends ProviderCache{
	game_trophies: Record<number, Record<string, RPCS3GameTrophies> | null>; // Cached without icons, or from RAWG, for each trophy id
}

/**
 * Retrieves trophies from RPCS3 for installed games and folders, even not yet installed trophies
 * (for games which have not been run yet), and optionally retrieves trophies rarity from PSN
 */
export class RPCS3AchievementsProvider extends AchievementsProvider<'rpcs3'>{
	identifier = "rpcs3" as const;
	title = t("providerCompatdataRPCS3");

	logger = new Logger(this.identifier);

	private rpcs3_check_user_path = callable<[string], string | null>("rpcs3_check_user_path");
	private rpcs3_get_all_trophies_game = callable<[string, string], string>("rpcs3_get_all_trophies_game");
	private rpcs3_get_all_trophies_user = callable<[string, string], string>("rpcs3_get_all_trophies_user");
	private rpcs3_get_trophy_icon_game = callable<[string, string], string>("rpcs3_get_trophy_icon_game");
	private rpcs3_get_group_icon_game = callable<[string, string], string>("rpcs3_get_group_icon_game");

	private _username?: string;
	private _psnTokens?: AuthTokensResponse;
	private _psnTokensExpiration?: Date;

	private _rawgProvider?: RAWGMetadataProvider;
	get rawgProvider(): RAWGMetadataProvider{
		if(!this._rawgProvider){
			this._rawgProvider = this.state.modules.metadata.providers.find(p => p instanceof RAWGMetadataProvider);
			if(!this._rawgProvider)
				this._rawgProvider = new RAWGMetadataProvider(this.state.modules.metadata);
		}

		return this._rawgProvider;
	}

	get rpcs3Resolver(): MultiIdRPCS3Resolver{
		return this.state.resolvers.rpcs3;
	}

	override get isValid(): boolean {
		return super.isValid && !!this.userPath && !!this.resolvers[0].hddPath;
	}


	get userPath(): string{
		return this.config.user_path;
	}

	set userPath(data: string){
		this.config.user_path = data;
		void this.saveConfig();
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

	get PSNNPSSO(): string
	{
		return this.config.psn_npsso;
	}

	set PSNNPSSO(data: string)
	{
		this.config.psn_npsso = data;
		void this.saveConfig();
	}


	get trophyCategories(): boolean{
		return this.config.trophy_categories;
	}

	set trophyCategories(data: boolean){
		let current = this.trophyCategories;
		this.config.trophy_categories = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get trophySets(): boolean{
		return this.config.trophy_sets;
	}

	set trophySets(data: boolean){
		let current = this.trophySets;
		this.config.trophy_sets = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get trophyGroups(): boolean{
		return this.config.trophy_groups;
	}

	set trophyGroups(data: boolean){
		let current = this.trophyGroups;
		this.config.trophy_groups = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
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


	get gameTrophies(): Record<number, Record<string, RPCS3GameTrophies> | null>{
		return this.cache.game_trophies;
	}

	private async checkUserPath(silent = false){
		if(!this.userPath)
			return;

		
		try{
			this._username = await this.rpcs3_check_user_path(this.userPath) ?? undefined;
			if(!this._username)
				throw new Error("");

			if(!this.resolvers[0].hddPath)
				this.resolvers[0].hddPath = this.userPath.split('/dev_hdd0/home/')[0] + '/dev_hdd0/';
		}
		catch{
			if(!silent){
				toasterToast(t("rpcs3PathError"), this);

				this.userPath = "";
				if(this.resolvers[0].hddPath)
					this.resolvers[0].hddPath = "";
			}
		}
	}

	override async mount(): Promise<void> {
		await this.checkUserPath();

		if(this.PSNNPSSO){
			try{
				// DEV: https://github.com/SteamDeckHomebrew/decky-loader/issues/960
				const accessCodeResponse = await DeckyPluginLoader.legacyFetchNoCors(
					'https://ca.account.sony.com/api/authz/v3/oauth/authorize?' + new URLSearchParams({
						access_type: "offline",
						client_id: "09515159-7237-4370-9b40-3806e67c0891",
						redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
						response_type: "code",
						scope: "psn:mobile.v2.core psn:clientapp"
					}).toString(),
					{
						method: 'GET',
						headers: {
							Cookie: `npsso=${this.PSNNPSSO}`
						},
						allow_redirects: false
					});
				if(!accessCodeResponse.success || typeof accessCodeResponse.result === 'string' || !accessCodeResponse.result?.headers["Location"]?.includes("?code=")){
					toasterToast(t("apiKeyError"), this);

					this.PSNNPSSO = "";
				}
				else{
					const accessCode = new URLSearchParams(accessCodeResponse.result.headers["Location"]!.split("redirect/")[1]).get('code')!;
					/*const accessCodeResponse = await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth/authorize?' + new URLSearchParams({
							access_type: "offline",
							client_id: "09515159-7237-4370-9b40-3806e67c0891",
							redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
							response_type: "code",
							scope: "psn:mobile.v2.core psn:clientapp"
						}).toString(), {
						headers: {
							Cookie: `npsso=${this.state.settings.rpcs3.npsso}`
						},
						redirect: 'manual'
					});
					if(!accessCodeResponse.headers.get("location")?.includes("?code=")){
						throw new Error(`
							There was a problem retrieving your PSN access code. Is your NPSSO code valid?
							To get a new NPSSO code, visit https://ca.account.sony.com/api/v1/ssocookie.`);
					}
					const accessCode = new URLSearchParams(accessCodeResponse.headers.get("location")!.split("redirect/")[1]).get('code')!;*/

					const psnTokens = await (await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth/token', {
						method: 'POST',
						headers: psnHeaders,
						body: new URLSearchParams({
							code: accessCode,
							redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
							grant_type: "authorization_code",
							token_format: "jwt"
						}).toString()
					})).json();
					this._psnTokens = {
						accessToken: psnTokens.access_token,
						expiresIn: psnTokens.expires_in,
						idToken: psnTokens.id_token,
						refreshToken: psnTokens.refresh_token,
						refreshTokenExpiresIn: psnTokens.refresh_token_expires_in,
						scope: psnTokens.scope,
						tokenType: psnTokens.token_type
					};
					this._psnTokensExpiration = new Date();
					this._psnTokensExpiration.setSeconds(this._psnTokensExpiration.getSeconds() + this._psnTokens.expiresIn - 10);
				}
			}
			catch{
				toasterToast(t("apiKeyError"), this);

				this.PSNNPSSO = "";
			}
		}
	}

	override async provide(appId: number): Promise<AchievementsData | undefined> {
		if(this.gameTrophies[appId] === null)
			return undefined;
		
		const trophyIds = (await this.resolve(appId))?.toString().split(separator);
		if(!trophyIds?.length){
			this.gameTrophies[appId] = null;
			return undefined;
		}

		const details = await getAppDetails(appId);
		if (!details){
			this.gameTrophies[appId] = null;
			return undefined;
		}
		
		const launchCommand = getLaunchCommand(details);
		const rom = launchCommand.match(romRegex)?.[0];
		if(!rom){
			this.gameTrophies[appId] = null;
			return undefined;
		}

		let romFolder = rom.match(new RegExp(rpcs3RomPathRegex))?.[1];
		// Resolved id is multi, the first one is the actual title id of the installed game
		let titleIds = (await this.rpcs3Resolver.resolve(appId))?.toString().split(separator);
		let titleId = titleIds?.[0];
		
		// Retrieve from cache first, since trophies data does not change
		let trophies: Record<string, RPCS3GameTrophiesStats> = {}; // Trophies for each id
		let fromGameFolder: Record<string, boolean> = {}; // True if retrieved from game folder (0 achieved)
		let notCached: string[] = []; // List of not previously cached trophy ids
		for(let trophyId of trophyIds){
			if(this.gameTrophies[appId]?.[trophyId])
				trophies[trophyId] = cloneDeep(this.gameTrophies[appId][trophyId]);
			else {
				// Try retrieving the trophies from the user directory first
				let result = await this.rpcs3_get_all_trophies_user(this.userPath, trophyId) ?? null;
				trophies[trophyId] = JSON.parse(result ?? '{}') as RPCS3GameTrophies;

				// If we found nothing we search the game folder
				if(!trophies[trophyId].trophies?.length){
					if(romFolder)
						result = await this.rpcs3_get_all_trophies_game(romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", this.language) ?? null;
					else{
						if(titleId)
							result = await this.rpcs3_get_all_trophies_game(this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", this.language) ?? null;
						else
							result = '';
					}

					if(result){
						trophies[trophyId] = JSON.parse(result ?? '{}') as RPCS3GameTrophies;
						fromGameFolder[trophyId] = true;
					}
				}

				if(trophies[trophyId].trophies?.length)				
					notCached.push(trophyId);
			}
		}

		// Retrieve trophies rarity, from PSN or RAWG,
		// Also if we have RAWG we retrieve trophies icons to save on data size instead of using base 64,
		// Also retrieve DLCs to map to RAP files
		if(notCached.length){
			if(!this.gameTrophies[appId])
				this.gameTrophies[appId] = {};

			if(this._psnTokens){
				// Refresh the token if needed
				if(this._psnTokensExpiration && new Date() >= this._psnTokensExpiration){
					try{
						const psnTokens = await (await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth', {
							method: 'POST',
							headers: psnHeaders,
							body: new URLSearchParams({
								refresh_token: this._psnTokens.refreshToken,
								grant_type: "refresh_token",
								token_format: "jwt",
								scope: "psn:mobile.v2.core psn:clientapp"
							}).toString()
						})).json();
						this._psnTokens = {
							accessToken: psnTokens.access_token,
							expiresIn: psnTokens.expires_in,
							idToken: psnTokens.id_token,
							refreshToken: psnTokens.refresh_token,
							refreshTokenExpiresIn: psnTokens.refresh_token_expires_in,
							scope: psnTokens.scope,
							tokenType: psnTokens.token_type
						};
						this._psnTokensExpiration = new Date();
						this._psnTokensExpiration.setSeconds(this._psnTokensExpiration.getSeconds() + this._psnTokens.expiresIn - 10);
					}
					catch(e){
						toasterToast(t("apiKeyError"), this);

						this.logger.debug(`${appId} PSN token refresh error`, e);
						this._psnTokens = undefined;
						this._psnTokensExpiration = undefined;
					}
				}

				if(this._psnTokens){
					// Try PSN accounts with most PS3 games/trophies in order (https://psnprofiles.com/leaderboard/ps3),
					// since PSN API requires an account to see trophies rarity but the we have no official user here...
					const psnAccounts = [
						'69542030923328854',
						'8477639012129454573',
						'7390413838940571081'
					];
					for(let trophyId of notCached){
						for(let accountId of psnAccounts){
							try{
								// npServiceName=trophy: PS3 trophies
								let rarity: Awaited<ReturnType<typeof getUserTrophiesEarnedForTitle>> = await (await fetchNoCorsLegacyTimeout(
									`https://m.np.playstation.com/api/trophy/v1/users/${accountId}/npCommunicationIds/${trophyId}/trophyGroups/all/trophies?npServiceName=trophy`,
									'GET',
									{
										headers: {
											Authorization: `Bearer ${this._psnTokens.accessToken}`,
											"Content-Type": "application/json",
										}
									})).json();
								if(rarity.trophies.length){
									trophies[trophyId].rarity = rarity.trophies;
									this.logger.debug(`${appId} rarity: `, trophies[trophyId].rarity);
									break;
								}
							}
							catch{ }
						}
					}
				}
			}
			if(this.rawgProvider.enabled && this.rawgProvider.apiKey){
				const rawgAchievements = await this.rawgProvider.getAchievementsForGame(appId);

				// If we have trophies we'll need to match them with local ones, but we need english titles
				if(rawgAchievements?.length){
					let trophiesNames: Record<string, Record<string, string>> = {}; // trophyId: { English name: trophy id ("001", "002") }
					if(this.language === langMap['en']){
						for(let trophyId of notCached){
							trophiesNames[trophyId] = {};

							for(let trophy of trophies[trophyId].trophies){
								trophiesNames[trophyId][trophy.name] = trophy.id;
							}
						}
					}
					else{
						for(let trophyId of notCached){
							let result: string;
							if(romFolder)
								result = await call<[string, string], string>("rpcs3_get_all_trophies_game", romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", langMap['en']!) ?? null;
							else{
								if(titleId)
									result = await call<[string, string], string>("rpcs3_get_all_trophies_game", this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", langMap['en']!) ?? null;
								else
									result = '';
							}

							if(result){
								trophiesNames[trophyId] = {};

								let englishTrophies = JSON.parse(result ?? '{}') as RPCS3GameTrophies;
								for(let trophy of englishTrophies.trophies){
									trophiesNames[trophyId][trophy.name] = trophy.id;
								}
							}
						}
					}

					if(Object.keys(trophiesNames).length){
						this.logger.debug("Matching RAWG achievements with names", rawgAchievements, trophiesNames);
						for(let trophyId of notCached){
							let setTrophies = !trophies[trophyId].rarity;
							if(setTrophies)
								trophies[trophyId].rarity = [];
							for(let achievement of rawgAchievements){
								let trophyTrophyId = trophiesNames[trophyId][achievement.name];

								if(!trophyTrophyId)
									continue;

								if(setTrophies){
									trophies[trophyId].rarity!.push({
										trophyId: parseInt(trophyTrophyId, 10),
										trophyEarnedRate: achievement.percent
									});
								}

								trophies[trophyId].trophies.find(t => t.id === trophyTrophyId)!.icon = achievement.image;
							}
						}
						this.logger.debug("Achievements not matched:", Object.entries(trophies).filter(t => t[1].trophies.some(t => !t.icon)));
					}
				}
			}

			// Retrieve the list of DLCs for the game
			// DEV: maybe retrieve one for each trophyId?
			let dlcs = notCached.reduce((acc, t) => acc + (trophies[t].groups?.length ?? 0), 0);
			let titleIdProducts: Record<string, SerialStationStoreProducts['items']> = {};
			if(dlcs && titleIds?.length){
				for(let titleId of titleIds){
					let products: SerialStationStoreProducts['items'] = [];
					let offset = 0;
					while(true){
						let response = await fetchNoCors('https://api.serialstation.com/v1/store/products?' + new URLSearchParams({
							top_category: 'ADD_ON',
							title_id_search: titleId,
							limit: '100',
							offset: offset.toString()
						}).toString());
						if(!response.ok)
							break;

						let body: SerialStationStoreProducts = await response.json();
						products.push(...body.items);

						if(body.items.length < 100)
							break;
						else
							offset += 100;
					}

					if(products.length >= dlcs)
						titleIdProducts[titleId] = products;
				}

				this.logger.debug(`${appId} DLCs: `, titleIdProducts);
			}

			for(let trophyId of notCached){
				if(trophies[trophyId].groups?.length){
					for(let group of trophies[trophyId].groups){
						let name = ((group.name ?? '') + (group.detail ?? '')).toLowerCase(); // Lowercase for efficiency

						// Retrieve the closest DLCs by name
						try{
							group.content_ids = Object.values(titleIdProducts)
								.flatMap(products => {
									let productsWithNames = products
										.filter(p => !!p.localization?.name!);
									let closestName = closest(name, productsWithNames.map(p => p.localization!.name!.toLowerCase()));
									// If the distance is the same as the length then it is completely unrelated (eg: a different alphabet)
									return closestName && distance(name, closestName) < name.length ?
										productsWithNames
											.filter(p => p.localization?.name?.toLowerCase() === closestName)
											.map(p => p.id) :
										[];
								});
						}
						catch{
							continue;
						}
					}
				}

				if(trophies[trophyId].trophies.length)
					this.gameTrophies[appId][trophyId] = cloneDeep(trophies[trophyId]);
			}

			if(!Object.keys(this.gameTrophies[appId]).length)
				this.gameTrophies[appId] = null;
		}

		if(!Object.keys(trophies).length){
			if(!notCached.length)
				this.gameTrophies[appId] = null;
			
			return undefined;
		}

		// Retrieve trophies icons if needed
		for(let trophyId of trophyIds){
			for(let trophy of trophies[trophyId].trophies){
				if(!trophy.icon){
					// Retrieve from user folder first, then default to game
					if(!fromGameFolder[trophyId])
						trophy.icon = await call<[string, string, string], string>("rpcs3_get_trophy_icon_user", this.userPath, trophyId, trophy.id) ?? '';
					
					if(!trophy.icon){
						if(romFolder)
							trophy.icon = await this.rpcs3_get_trophy_icon_game(romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", trophy.id) ?? '';
						else if(titleId)
							trophy.icon = await this.rpcs3_get_trophy_icon_game(this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", trophy.id) ?? '';
					}
				}
			}
		}

		// Retrieve progress for non-game trophies (actually played)
		for(let trophyId of trophyIds){
			if(!fromGameFolder[trophyId] && trophies[trophyId]){
				let result = await call<[string, string], string>("rpcs3_get_all_trophies_status", this.userPath, trophyId) ?? null;
				trophies[trophyId].progress = JSON.parse(result ?? '{}') as Record<string, RPCS3TrophyStatus>;
				this.logger.debug(`${appId} (${trophyId}) progress: `, trophies.progress);
			}
			else
				this.logger.debug(`${appId} (${trophyId}) no progress yet`);
		}

		let result: AchievementsData = {
			title: details.strDisplayName,
			id: trophyIds.join(', '),

			groups: []
		};

		let ownedDlcOverrides = Object.keys(this.dlcOverrides)
			.map(id => this.module.unpackAppAndDlcIds(+id))
			.filter(([a, _]) => a === appId)
			.map(([_, d]) => d);

		// (Base game, DLCs, generic DLCs) x N
		let multipleSets = (trophyIds.length > 1 && this.trophySets);
		let multipleGroups = Object.values(trophies).some(t => t.groups?.length ||
			t.trophies.some(tt => tt.gid != null || (!tt.gid && tt.pid !== '000' && tt.id !== '000'))) && this.trophyGroups;
		let genericDlcIndex = -1;
		let i = 0;
		let baseGame = -1;
		let dlcs = -1;
		let dlcsAchievements: AchievementsData['groups'][number]['achievements'][] =
			this.trophyCategories ? [[], [], [], [], []] : [[]];
		for(let trophyId of trophyIds){
			let isBaseSet = trophyId === trophyIds[0];

			// Prepare groups and retrieve absolute indexes
			let groups: NonNullable<(typeof trophies)[number]['groups']> = [];
			// Base game
			if(isBaseSet || multipleSets){
				groups.push({
					id: null!,
					name: ''
				});
				if(baseGame === -1)
					baseGame = i;
			}
			// DLCs
			if(multipleGroups){
				if(trophies[trophyId].groups)
					groups.push(...trophies[trophyId].groups);
				if(multipleSets || trophyId === trophyIds[trophyIds.length-1]){
					groups.push({
						id: '-1', // Generic DLCs
						name: t("otherDlcsAchievementSet")
					});
					dlcs = i + groups.length - 1;
				}
			}

			let trophySetName = (trophies[trophyId].game?.name ?? trophyId);

			// If multipleSets is false but multipleGroups is true we use the "base game" set (0) and "generic dcls" group of the first
			for(let group of groups){
				let isBaseGroup = group.id == null;

				// Trophy Set 1 - DLCs
				// Trophy Set 1 - Group 1
				// ...
				let groupNameOrId = (group?.name ?? ((!multipleSets ? trophyId + '_' : '') + group.id));
				let groupName = (multipleSets ? (trophySetName + (!isBaseGroup ? ' - ' : '')) : '') +
					groupNameOrId;

				// Add DLCs
				let dlcIndex: number | undefined;
				if(!isBaseGroup){
					if(group.id === '-1'){
						if(genericDlcIndex === -1){
							result.dlcs ??= [];
							result.dlcs.push({
								name: groupNameOrId,
								owned: true, // Generic DLCs are always "owned", since we don't know which DLC(s) we are referring to...
								image: getAppHeader(appId)
							});
							genericDlcIndex = result.dlcs.length-1;
						}
						dlcIndex = genericDlcIndex;
					}
					else{
						let dlc = {
							name: groupNameOrId
						} as NonNullable<AchievementsData['dlcs']>[number];

						result.dlcs ??= [];
						result.dlcs.push(dlc);
						dlcIndex = result.dlcs.length-1;
						
						// Check if the DLC is owned, if we have no content ids we cannot verify so we consider it owned
						let isOwned = !this.dlcOwnership || !group.content_ids?.length || ownedDlcOverrides.includes(dlcIndex);
						if(!isOwned){
							for(let content_id of group.content_ids!){
								isOwned = await call<[string, string], boolean>("rpcs3_check_rap_file", this.userPath, content_id);
								if(isOwned)
									break;
							}
						}
						dlc.owned = isOwned;

						if(!fromGameFolder[trophyId])
							dlc.image = await call<[string, string, string], string>("rpcs3_get_group_icon_user", this.userPath, trophyId, group.id) ?? '';

						if(!dlc.image){
							if(romFolder)
								dlc.image = await this.rpcs3_get_group_icon_game(romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", group.id) ?? '';
							else if(titleId)
								dlc.image = await this.rpcs3_get_group_icon_game(this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", group.id) ?? '';
						}

						if(!dlc.image)
							dlc.image = getAppHeader(appId);
					}
				}
				
				// Add groups
				// 1 + ... + 1 sets (trophyCategories=false)
				// 1 + 4 + ... + 1 + 4 sets (trophyCategories=true)
				result.groups.push({
					name: groupName,
					dlc: dlcIndex,
					achievements: []
				});
				if(this.trophyCategories){
					if(!multipleSets && multipleGroups && isBaseGroup)
						groupName = t("defaultAchievementSet");
					let baseName = (multipleSets || multipleGroups ? `${groupName} - ` : '');
					result.groups.push(
						{
							name: baseName + t("rpcs3TrophiesSetBronze"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("rpcs3TrophiesSetSilver"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("rpcs3TrophiesSetGold"),
							dlc: dlcIndex,
							achievements: []
						},
						{
							name: baseName + t("rpcs3TrophiesSetPlatinum"),
							dlc: dlcIndex,
							achievements: []
						}
					);
				}
			}

			// Add trophies
			for(let trophy of trophies[trophyId].trophies){
				// Check in which group the trophy would fall in,
				// >= 0 the offset is local (multipleSets and multipleGroups),
				// < 0 the offset is absolute (negated) - 1 (multipleGroups),
				// Number.NEGATIVE_INFINITY is dlcs (added at the end)
				let trophyGroupId = 0;
				let groupName: string | undefined;
				if(multipleGroups){
					// DLC
					// Generic DLC
					// Global base game
					// https://github.com/justin-delano/PlayniteAchievements/blob/8d0b23da5f3c9abf20134e2724175ddcbaadc75d/source/Providers/RPCS3/Rpcs3Scanner.cs#L2811-L2824
					if(trophy.gid != null && trophy.gid !== '0' && trophy.gid !== '000' && trophy.gid !== 'default' && trophy.gid !== 'base'){
						trophyGroupId = groups.findIndex(g => g.id === trophy.gid);
						let dlc = result.groups[i + trophyGroupId]?.dlc;
						groupName = (dlc !== undefined ? result.dlcs?.[dlc]?.name : undefined);
					}
					else if(trophy.pid !== '000' && trophy.id !== '000'){
						trophyGroupId = (multipleSets ? groups.findIndex(g => g.id === '-1') : Number.NEGATIVE_INFINITY);
						groupName = (multipleSets ? trophySetName + ' - ' : '') + t("otherDlcsAchievementSet");
					}
					else if(!multipleSets && baseGame !== -1)
						trophyGroupId = -(baseGame + 1);
				}

				let groupId: number;
				if(trophyGroupId === Number.NEGATIVE_INFINITY)
					groupId = 0;
				else{
					groupId = (trophyGroupId >= 0 ?
							(multipleSets || multipleGroups ? i : 0) + trophyGroupId :
							(-trophyGroupId - 1)) *
						(this.trophyCategories ? 5 : 1);
				}

				//this.logger.debug(`${appId} trophy group`, trophy.id, trophy.gid, trophyGroupId, groupId);
				
				let achieved = trophies[trophyId].progress?.[trophy.id]?.unlocked === true;

				let trophyIdInt = parseInt(trophy.id, 10);
				let rate = trophies[trophyId].rarity?.find(t => t.trophyId === trophyIdInt)?.trophyEarnedRate;

				let trophyCategory: string | undefined = undefined;
				if(this.trophyCategories){
					switch(trophy.type){
					case 'B':
						groupId += 1;
						if(!this.module.hasAchievementSetsSupport)
							trophyCategory = "🟧";
						break;
					case 'S':
						groupId += 2;
						if(!this.module.hasAchievementSetsSupport)
							trophyCategory = "⬜";
						break;
					case 'G':
						groupId += 3;
						if(!this.module.hasAchievementSetsSupport)
							trophyCategory = "🟨";
						break;
					case 'P':
						groupId += 4;
						if(!this.module.hasAchievementSetsSupport)
							trophyCategory = "💎";
						break;
					}
				}

				(trophyGroupId === Number.NEGATIVE_INFINITY ?
					dlcsAchievements[groupId] :
					result.groups[groupId].achievements)
				.push({
					bAchieved: achieved,
					bHidden: trophy.hidden === true,
					flAchieved: rate ? parseFloat(rate) : 0,
					rtUnlocked:
						(achieved && trophies[trophyId].progress?.[trophy.id]?.unlock_time_utc) ?
							trophies[trophyId].progress[trophy.id].unlock_time_utc! :
							0,
					strDescription: [
						(!this.module.hasAchievementSetsSupport ? groupName : undefined),
						trophyCategory,
						trophy.detail
					].filter(d => d).join(' - '),
					strID: trophyId + "_" + trophy.id,
					strImage: trophy.icon,
					strName: trophy.name
				});
			}

			i += groups.length;
		}

		// Add DLCs achievements
		if(dlcs === -1)
			dlcs = 0;

		//this.logger.debug(`${appId} DLCs`, dlcs, dlcsAchievements);

		for(let i = 0; i < dlcsAchievements.length; i++){
			result.groups[(dlcs * dlcsAchievements.length) + i].achievements.push(...dlcsAchievements[i]);
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

	override icon = <SiPlaystation3/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [userPath, setUserPath] = useState(this.userPath);
		const [username, setUsername] = useState(this._username);
		const [language, setLanguage] = useState(this.config.language);
		const [PSNNPSSO, setPSNNPSSO] = useState(this.PSNNPSSO);

		const [trophyCategories, setTrophyCategories] = useState(this.trophyCategories);
		const [trophySets, setTrophySets] = useState(this.trophySets);
		const [trophyGroups, setTrophyGroups] = useState(this.trophyGroups);

		const [dlcOwnership, setDlcOwnership] = useState(this.dlcOwnership);
		const [dlcOverrides, setDlcOverrides] = useState(this.dlcOverrides);


		const currentLanguage = getCurrentLanguage();
		const defaultLanguage = langMap[currentLanguage] ? currentLanguage : 'en';

		const authUrl = "https://www.playstation.com";
		const tokenUrl = "https://ca.account.sony.com/api/v1/ssocookie";

		const markdown = t("rpcs3UserPathDesc")
				.replace("{rpcs3Path}", '/home/deck/Emulation/storage/rpcs3/dev_hdd0/home/<00000001>')
				.replace("{rpcs3File}", 'localusername') + "  \n" + 
			t("rpcs3UserPathInstructions") + "  \n" + 
			"![RPCS3 User Accounts](data:image/jpeg;base64,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)"
			;

		const check = async () => {
			await this.checkUserPath(true);
			if(this._username !== username)
				setUsername(this._username);
		};
		void check();

		const setUserAndHddPath = (user: string) => {
			if(user && user.endsWith('/'))
				user = user.substring(0, user.length-1);
			setUserPath(user);
			this.userPath = user;
			this.resolvers[0].hddPath = user ? user.split('/dev_hdd0/home/', 1)[0] + '/dev_hdd0/' : '';

			if(user && user.length >= 'rpcs3/dev_hdd0/home/00000001'.length)
				void check();
		};

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
									onChange={(event) => setUserAndHddPath(event.target.value)}/>
								{
									(!!username) && <Field
										label={t("detectedUser")}
										description={username}/>
								}
								<Markdown>{markdown}</Markdown>
							</>
						}>
						<DialogButton
							disabled={loadingData.loading}
							onClick={async () => {
								let result = await openFilePicker(FileSelectionType.FOLDER, userPath && userPath != '/home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001' ? userPath : '/home', true, true, undefined, undefined, true, true);
								setUserAndHddPath(result.path ?? '');
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
					<DialogControlsSectionHeader>{(this.module.hasAchievementSetsSupport ? t("settingsAchievementsSets") : t("settingsAchievementsPrefixes"))}</DialogControlsSectionHeader>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesCatSets") : t("rpcs3TrophiesCatPrefixes"))}
						description={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesCatSetsDesc") : t("rpcs3TrophiesCatPrefixesDesc"))}>
						<Toggle
							value={trophyCategories}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setTrophyCategories(checked);
								this.trophyCategories = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesSetSets") : t("rpcs3TrophiesSetPrefixes"))}
						description={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesSetSetsDesc") : t("rpcs3TrophiesSetPrefixesDesc"))}>
						<Toggle
							value={trophySets}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setTrophySets(checked);
								this.trophySets = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesGroupSets") : t("rpcs3TrophiesGroupPrefixes"))}
						description={(this.module.hasAchievementSetsSupport ? t("rpcs3TrophiesGroupSetsDesc") : t("rpcs3TrophiesGroupPrefixesDesc"))}>
						<Toggle
							value={trophyGroups}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setTrophyGroups(checked);
								this.trophyGroups = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<DialogControlsSectionHeader>{t("rpcs3Psn")}</DialogControlsSectionHeader>
					<Field
						label={t("rpcs3PsnApiKey")}
						description={
							<TextField
								value={PSNNPSSO}
								disabled={loadingData.loading}
								onChange={(event) => {
									setPSNNPSSO(event.target.value);
									this.PSNNPSSO = event.target.value;
								}}/>
						} />
					<Field description={
						<Markdown>{t("rpcs3PsnApiKeyInstructions")
							.replace("{playstationUrl}", `[www.playstation.com](${authUrl})`)
							.replace("{cookieUrl}", `[ca.account.sony.com/api/v1/ssocookie](${tokenUrl})`)
							.replace("{response}", "`{ \"npsso\": \"<" + t("rpcs3PsnApiKeyInstructionsResponse") + ">\", ... }`")}</Markdown>
					}>
						<DialogButton
							onClick={() => void copyToClipboard(authUrl)}>
							{t("copyAuthUrl")}
						</DialogButton>
						<DialogButton
							onClick={() => void copyToClipboard(tokenUrl)}>
							{t("copyTokenUrl")}
						</DialogButton>
					</Field>
				</DialogControlsSection>

				{
					this.module.hasAchievementSetsSupport && <DialogControlsSection>
						<DialogControlsSectionHeader>{t("settingsAchievementsDlcs")}</DialogControlsSectionHeader>
						<Field
							label={t("rpcs3DlcOwnership")}
							description={t("rpcs3DlcOwnershipDesc")}>
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