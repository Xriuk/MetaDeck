import { FaClipboardCheck } from "react-icons/fa";
import { SteamAppTypeShortcut, StoreCategory, type AchievementsData } from "../../Interfaces";
import Logger from "../../logger";
import type { Mounts } from "../../System";
import { t } from "../../useTranslations";
import { Module, type ModuleCache, type ModuleConfig } from "../Module";
import type { AchievementsProvider } from "./AchievementsProvider";
import { afterPatch, beforePatch, callOriginal, DialogControlsSection, Field, findModuleExport, replacePatch, Toggle, type Patch } from "@decky/ui";
import type { AllAchievements, AppData, GlobalAchievements, Hook, SteamAppOverview } from "../../SteamTypes";
import { grayScaleIcon, stateTransaction } from "../../util";
import { useMetaDeckState } from "../../MetaDeckState";
import { useState } from "react";
import React from "react";
import { RetroAchievementsAchievementsProvider, type RetroAchievementsAchievementsProviderCache, type RetroAchievementsAchievementsProviderConfig } from "./providers/RetroAchievementsAchievementsProvider";
import { RPCS3AchievementsProvider, type RPCS3AchievementsProviderCache, type RPCS3AchievementsProviderConfig } from "./providers/RPCS3AchievementsProvider";
import { XeniaAchievementsProvider, type XeniaAchievementsProviderCache, type XeniaAchievementsProviderConfig } from "./providers/XeniaAchievementsProvider";
import { GOGAchievementsProvider, type GOGAchievementsProviderCache, type GOGAchievementsProviderConfig } from "./providers/GOGAchievementsProvider";

type CacheEvent = {
	type: "added" | "removed" | "updated";
	query: {
		queryKey: any[];
		state: any;
	};
};

// DEV: figure out what is bypassCounter in MetadataModule and if we can use that too (maybe it's to avoid multiple requests or ripples?)

export interface AchievementsConfig extends ModuleConfig<AchievementsProviderConfigs>{
	category: boolean,
	app_details: boolean,
	overlay_menu: boolean
}

export interface AchievementsCache extends ModuleCache<AchievementsProviderCaches, AchievementsData>{

}

export interface AchievementsProviderConfigs{
	ra: RetroAchievementsAchievementsProviderConfig;
	rpcs3: RPCS3AchievementsProviderConfig;
	xenia: XeniaAchievementsProviderConfig;
	gog: GOGAchievementsProviderConfig;
}

export interface AchievementsProviderCaches{
	ra: RetroAchievementsAchievementsProviderCache;
	rpcs3: RPCS3AchievementsProviderCache;
	xenia: XeniaAchievementsProviderCache;
	gog: GOGAchievementsProviderCache;
}

export class AchievementsModule extends Module<"achievements", AchievementsProvider<any>>{
	identifier = "achievements" as const;
	title = t("moduleAchievements");

	logger: Logger = new Logger(this.identifier);

	public hasAchievementSetsSupport!: boolean; // Assigned in addMounts, not assigning because overrides addMounts otherwise
	private queryCache?: {
		getQueryCache(): {
			subscribe(callback: (event: CacheEvent) => void): () => void; // Returns function to call to unsubscribe
			notify(event: CacheEvent): void;
		};
		invalidateQueries(params: {
			queryKey: any[];
			exact?: boolean;
		}): any;
	}

	providers: AchievementsProvider<any>[] = [
		new RetroAchievementsAchievementsProvider(this),
		new RPCS3AchievementsProvider(this),
		new XeniaAchievementsProvider(this),
		new GOGAchievementsProvider(this)
	];

	override async removeCache(appId: number, onlyProgress = false): Promise<void> {
		await super.removeCache(appId);

		if(!onlyProgress && this.hasAchievementSetsSupport && this.queryCache){
			this.queryCache.invalidateQueries({
				queryKey: ["achievements", appId]
			});
		}

		let appData = appDetailsStore.GetAppData(appId);
		if (!appData?.details)
			return;

		stateTransaction(() => {
			appData.details!.achievements = {
				nAchieved: 0,
				nTotal: 0,
				vecAchievedHidden: [],
				vecHighlight: [],
				vecUnachieved: []
			};

			appDetailsCache.SetCachedDataForApp(appId, "achievements", 2, appData.details!.achievements);
		});
	}

	addMounts(mounts: Mounts): void {
		const module = this;

		async function replaceImages(achievements: AchievementsData['groups'][0]['achievements']){
			for(let achievement of achievements){
				achievement.strImage = achievement.strImageLocked
					?? (achievement.strImage ? await grayScaleIcon(achievement.strImage) : achievement.strImage);
			}
		}

		// DEV: What is this?
		// Maybe use SteamClient.Apps.GetMyAchievementsForApp?
		mounts.addPatchMount({
			patch(): Patch{
				const Achievements = findModuleExport(mProp => mProp?.m_mapMyAchievements);
				module.logger.debug("Achievements", Achievements);

				return replacePatch(
					Achievements.__proto__,
					"LoadMyAchievements",
					args => {
						if(!module.isValid || module.excludedApps.includes(args[0]))
							return callOriginal;

						if (appStore.GetAppOverviewByAppID(args[0])?.app_type === SteamAppTypeShortcut &&
							!Achievements.m_mapGlobalAchievements.has(args[0])){

							module.logger.debug("LoadMyAchievements");
								
							const data = module.fetchData(args[0]);
							if(data){
								let user: AllAchievements['data'] = {
									achieved: {},
									hidden: {},
									unachieved: {}
								};
								let global: GlobalAchievements['data'] = {};
								for(let group of data.groups){
									for(let achievement of group.achievements){
										if(achievement.bAchieved)
											user.achieved[achievement.strID] = achievement;
										else{
											// Replace the image with the locked one (we copy properties to avoid changing them),
											// we'll run them in another promise below
											achievement = { ...achievement };

											if(achievement.bHidden)
												user.hidden[achievement.strID] = achievement;
											else
												user.unachieved[achievement.strID] = achievement;
										}

										global[achievement.strID] = achievement.flAchieved;
									}
								}
								// Replace images with locked ones
								let hiddenOrUnachieved = Object.values(user.hidden)
									.concat(Object.values(user.unachieved));
								if(hiddenOrUnachieved.length)
									void replaceImages(hiddenOrUnachieved);

								Achievements.m_mapMyAchievements.set(args[0], {
									loading: false,
									data: user
								} as AllAchievements);
								Achievements.m_mapGlobalAchievements.set(args[0], {
									loading: false,
									data: global
								} as GlobalAchievements);
							}
							
							return;
						}

						return callOriginal;
					}
				);
			}
		});

		// Adds games to Library filter where achievements are supported
		mounts.addPatchMount({
			patch(): Patch
			{
				return replacePatch(
					// @ts-ignore
					appStore.allApps[0].__proto__,
					"BHasStoreCategory",
					function (args)
					{
						// @ts-ignore
						if (!module.isValid || !module.category || module.excludedApps.includes((this as SteamAppOverview).appid))
							return callOriginal;

						// @ts-ignore
						if ((this as SteamAppOverview).app_type == SteamAppTypeShortcut &&
							args[0] === StoreCategory.Achievements){

							// @ts-ignore
							const data = module.fetchData((this as SteamAppOverview).appid);
							if (data?.groups.some(g => g.achievements.length))
								return true;
						}

						return callOriginal;
					}
				);
			}
		});

		// Patching appDetailsStore.GetAchievements retrieves them only on app details,
		// while patching appDetailsStore.GetAppData retrieves them also on overlay
		function achievementsAppData(appId: number, appData: AppData){
			if(!appData.details || appData.details.achievements?.nTotal ||
				(appData.bLoadingAchievments && !module.hasCachedData(appId))){

				return;
			}

			// Start loading achievements and wait for them to finish
			appData.bLoadingAchievments = true;
			const data = module.fetchData(appId);
			if(!module.hasCachedData(appId))
				return;

			let achievements = data?.groups.flatMap(g => g.achievements);
			let achieved = achievements?.filter(a => a.bAchieved);
			const nAchieved = achieved?.length ?? 0;
			const nTotal = achievements?.length ?? 0;
			const vecHighlight = (achieved?.filter(a => !a.bHidden) ?? [])
				.slice(0, 12); // We limit highlighted achievements to 12
			const vecAchievedHidden = achievements
				?.filter(a => a.bAchieved && a.bHidden === true)
				?? [];
			// Replace the image with the locked one (we copy properties to avoid changing them),
			// we'll run them in another promise below
			const vecUnachieved = achievements
				?.filter(a => !a.bAchieved)
				.map(a => ({ ...a }))
				?? [];
			// Replace images with locked ones
			if(vecUnachieved.length)
				void replaceImages(vecUnachieved);

			stateTransaction(() => {
				appData.details!.achievements = {
					nAchieved,
					nTotal,
					vecAchievedHidden,
					vecHighlight,
					vecUnachieved
				};

				appDetailsCache.SetCachedDataForApp(appId, "achievements", 2, appData.details!.achievements);
			});
			appData.bLoadingAchievments = false;
		}
		// DEV: deprecated for future versions?
		mounts.addPatchMount({
			patch(): Patch{
				return beforePatch(
					appDetailsStore.__proto__,
					"GetAchievements",
					args => {
						if(!module.isValid || module.overlayMenu || module.excludedApps.includes(args[0]) ||
							appStore.GetAppOverviewByAppID(args[0]).app_type != SteamAppTypeShortcut){

							return;
						}

						module.logger.debug("GetAchievements");

						let appData = appDetailsStore.GetAppData(args[0]);
						achievementsAppData(args[0], appData);
					}
				);
			}
		});
		mounts.addPatchMount({
			patch(): Patch{
				return afterPatch(
					appDetailsStore.__proto__,
					"GetAppData",
					(args, appData: AppData) =>{
						if(!module.isValid || !module.overlayMenu || module.excludedApps.includes(args[0]) || !appData.details)
							return appData;

						const overview = appStore.GetAppOverviewByAppID(args[0]);
						if(overview.app_type != SteamAppTypeShortcut)
							return appData;

						achievementsAppData(args[0], appData);

						return appData;
					}
				);
			}
		});

		// Achievements section on app details page
		mounts.addPatchMount({
			patch(): Patch{
				const AppDetailsSections = findModuleExport((mProp) => (
					typeof mProp === 'function' && // class
					typeof mProp.prototype?.GetSections === 'function'
				));
				module.logger.debug("AppDetailsSections", AppDetailsSections);

				return afterPatch(AppDetailsSections.prototype, 'GetSections', function(this: any, _: Record<string, unknown>[], ret: Set<string>){
					const overview: SteamAppOverview = this?.props?.overview;
					if (module.isValid && overview?.app_type === SteamAppTypeShortcut && !module.excludedApps.includes(overview.appid)){
						if (module.appDetails)
							ret.add("achievements");
						else
							ret.delete("achievements");
					}

					return ret;
				});
			}
		});

		// Refresh achievements progress on overlay opened and app close,
		// clear cache and refetch
		let appCloseLifetimeHook: Hook;
		let overlayOpenLifetimeHook: Hook;
		async function clearProgressCache(appId: number){
			await module.removeCache(appId, true);

			if(module.hasAchievementSetsSupport && module.queryCache){
				module.queryCache.invalidateQueries({
					queryKey: ["achievements", appId, "user_achievements"],
					exact: true
				});
			}

			await module.fetchDataAsync(appId);
		}
		mounts.addMount({
			mount(){
				overlayOpenLifetimeHook = SteamClient.Overlay.RegisterForOverlayActivated((_, appId, active) => {
					if (!module.isValid || module.excludedApps.includes(appId))
						return;

					if(active && appStore.GetAppOverviewByAppID(appId).app_type == SteamAppTypeShortcut){
						setTimeout(() => void clearProgressCache(appId)); // Clear at the end of frame to avoid hiding the Achievements button
					}
				});
				appCloseLifetimeHook = SteamClient.GameSessions.RegisterForAppLifetimeNotifications(update =>{
					if (!module.isValid || module.excludedApps.includes(update.unAppID))
						return;

					if (!update.bRunning && appStore.GetAppOverviewByAppID(update.unAppID).app_type == SteamAppTypeShortcut)
						void clearProgressCache(update.unAppID);
				});
			},
			dismount(){
				overlayOpenLifetimeHook?.unregister();
				appCloseLifetimeHook?.unregister();
			}
		});

		// Support for achievement sets (now in beta)
		// DEV: need to reset Steam query cache in resetCache
		module.queryCache = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.getQueryCache === 'function'
		));
		(window as any).queryCache = module.queryCache;
		console.log("Cache", module.queryCache);
		const PlayerModule = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.GetGameAchievements === 'function'
		));
		console.log("PlayerModule", PlayerModule);
		const AppInfo = findModuleExport((mProp) => (
			typeof mProp === 'object' &&
			typeof mProp.LoadAppInfoBatchFromLocalCache === 'function'
		));
		console.log("AppInfo", AppInfo, AppInfo.__proto__);
		if(PlayerModule && module.queryCache && PlayerModule.GetGameAchievements &&
			PlayerModule.GetGlobalAchievementPercentages &&
			PlayerModule.GetUserAchievements && AppInfo){

			module.hasAchievementSetsSupport = true;

			// Retrieve achievements
			type GetGameAchievementsType = {
				achievements: {
					internal_name: string; // Unique per game (not set)
					localized_name: string;
					localized_desc: string;
					icon: string;
					icon_gray: string;
					hidden: boolean;
					player_percent_unlocked: string; // ???
					internal_key: number; // Unique per game (not set)
					min_progress_int?: number;
					max_progress_int?: number;
					groupid?: number; // 0/undefined for base
					archived: boolean; // Should be false for events/timed achievements(?)
					progress_type: number; // Enum ???
					min_progress_float?: number;
					max_progress_float?: number;
				}[];
				schema_version: number; // Can be 0(?)
				groups: {
					groupid: number; // 0 is reserved for base game
					localized_name: string; // Localized name of group, should be "Base Game" for group id 0
					dlcappid: number; // 0 for none
					archived: boolean; // Should be false
					developeronly: boolean; // Should be false
					order: number; // 0-based, base game should be 0, and others can be sorted
					ispublic: boolean; // Should be true
					total_achievements: number;
					completion_achievements: number;
				}[];
				schema_hash: number; // Can be 0(?)
			};
			async function fetchGameAchievements(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetGameAchievements data", data);

				let i = 0;
				let j = 0;
				let result: GetGameAchievementsType = {
					achievements: [],
					schema_version: 0,
					groups: [],
					schema_hash: 0
				};

				if(data?.groups){
					for(let group of data.groups){
						let groupId = i++;

						if(groupId !== 0){
							result.groups.push({
								groupid: groupId,
								localized_name: group.name,
								dlcappid: 0,
								archived: false,
								developeronly: false,
								order: groupId,
								ispublic: true,
								total_achievements: group.achievements.length,
								completion_achievements: group.achievements.length
							});
						}

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_name: achievement.strID,
								localized_name: achievement.strName,
								localized_desc: achievement.strDescription,
								icon: achievement.strImage,
								icon_gray: achievement.strImageLocked
									?? (achievement.strImage ? await grayScaleIcon(achievement.strImage) : achievement.strImage),
								hidden: achievement.bHidden,
								player_percent_unlocked: achievement.flAchieved.toString(),
								internal_key: j++,
								max_progress_int: achievement.flMaxProgress,
								min_progress_int: achievement.flMinProgress,
								groupid: groupId === 0 ? undefined : groupId,
								archived: false,
								progress_type: 0, // ???
								max_progress_float: achievement.flMaxProgress,
								min_progress_float: achievement.flMinProgress
							});
						}
					}
				}

				module.logger.debug("GetGameAchievements result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetGameAchievements", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;
						
						if(!module.isValid || !appId || module.excludedApps.includes(appId))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(appId);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;


						return fetchGameAchievements(appId, ret);
					});
				}
			});

			// Retrieve rarity
			type GetGlobalAchievementPercentagesType = {
				achievements: {
					internal_key: number;
					player_percent_unlocked: number; // flAchieved Percentage of players who achieved (0-100), min should be 0.1 by default
				}[];
				groups: {
					groupid: number;
					player_percent_completed: number; // Min of flAchieved of achievements in group
				}[];
			};
			async function fetchAchievementPercentages(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetGlobalAchievementPercentages data", data);

				let i = 0;
				let j = 0;
				let result: GetGlobalAchievementPercentagesType = {
					achievements: [],
					groups: []
				};
				if(data){
					for(let group of data.groups){
						result.groups.push({
							groupid: i++,
							player_percent_completed: group.achievements.length ? Math.min(...group.achievements.map(a => a.flAchieved || 0.1)) : 0
						});

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_key: j++,
								player_percent_unlocked: achievement.flAchieved || 0.1
							});
						}
					}
				}

				module.logger.debug("GetGlobalAchievementPercentages result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetGlobalAchievementPercentages", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;

						if(!module.isValid || !appId || module.excludedApps.includes(args[1]))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(args[1]);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;

						return fetchAchievementPercentages(appId, ret);
					});
				}
			});

			// Retrieve progress
			type GetUserAchievementsType = {
				achievements: {
					internal_key: number;
					unlocked: boolean;
					unlock_time: number;
					progress_int?: number;
					progress_float?: number;
				}[];
				schema_version: number;
				schema_hash: number;
				groups: {
					groupid: number,
					is_achievable: boolean, // Should be true
					completed_achievements: number,
					is_completed: boolean, // Should be true if all completed
					time_completed: number; // Should be max unlock_time of all achievements in group
				}[];
			};
			async function fetchUserAchievements(appId: number, ret: Promise<any>): Promise<any>{
				let data = await module.fetchDataAsync(appId);

				module.logger.debug("GetUserAchievements data", data);

				let i = 0;
				let j = 0;
				let result: GetUserAchievementsType = {
					achievements: [],
					schema_version: 0,
					schema_hash: 0,
					groups: []
				};
				if(data){
					for(let group of data.groups){
						let completedAchievements = group.achievements.filter(a => a.bAchieved === true).length;
						result.groups.push({
							groupid: i++,
							is_achievable: true,
							completed_achievements: completedAchievements,
							is_completed: completedAchievements === group.achievements.length,
							time_completed: completedAchievements === group.achievements.length ?
								Math.max(...group.achievements.map(a => a.rtUnlocked)) :
								0
						});

						for(let achievement of group.achievements){
							result.achievements.push({
								internal_key: j++,
								unlocked: achievement.bAchieved,
								unlock_time: achievement.rtUnlocked,
								progress_int: achievement.flCurrentProgress,
								progress_float: achievement.flCurrentProgress
							});
						}
					}
				}

				module.logger.debug("GetUserAchievements result", result);

				// Await promise to retrieve message class and message type, and re-create it with a new body
				let response = await ret;
				let newResponse = response.__proto__.constructor.InitFromObject(response.Body().__proto__.constructor, result);
				newResponse.Hdr().set_eresult(1);

				return newResponse;
			}
			mounts.addPatchMount({
				patch(): Patch{
					return afterPatch(PlayerModule, "GetUserAchievements", function(args: any[], ret: Promise<any>){
						let appId = args[1]?.appid;

						if(!module.isValid || !appId || module.excludedApps.includes(appId))
							return ret;

						const overview = appStore.GetAppOverviewByAppID(appId);
						if(overview.app_type != SteamAppTypeShortcut)
							return ret;

						return fetchUserAchievements(appId, ret);
					});
				}
			});

			// Fix achievement icons urls
			type AchievementsSchemaType = {
				appid: number;
				groups: {
					achievements: {
						icon_achieved: string;
						icon_unachieved: string;
					}[];
				}[];
			};
			let cacheFixSubscription: () => void;
			const imageUrlRegex = /((?:https?:\/\/|data:image\/).+?)(?=https?:\/\/|data:image\/|$)/g;
			function isUnpatched(url: string): boolean{
				let match = url.match(imageUrlRegex);
				return !!match?.length && match.length > 1;
			}
			function patch(url: string): string{
				return url.match(imageUrlRegex)![1];
			}
			mounts.addMount({
				mount(){
					cacheFixSubscription = module.queryCache!.getQueryCache().subscribe(event => {
						if((event.type !== 'added' && event.type !== 'updated') ||
							event.query.queryKey.length < 3 || event.query.queryKey[0] !== "achievements" ||
								event.query.queryKey[2] !== "schema" ||
							!event.query.state.data ||
							appStore.GetAppOverviewByAppID((event.query.state.data as AchievementsSchemaType).appid).app_type != SteamAppTypeShortcut ||
							!(event.query.state.data as AchievementsSchemaType).groups
								.some(g => g.achievements.some(a => isUnpatched(a.icon_achieved) || isUnpatched(a.icon_unachieved)))){

							return;
						}

						// Patch the urls
						for(let group of (event.query.state.data as AchievementsSchemaType).groups){
							for(let achievement of group.achievements){
								if(isUnpatched(achievement.icon_achieved))
									achievement.icon_achieved = patch(achievement.icon_achieved);
								if(isUnpatched(achievement.icon_unachieved))
									achievement.icon_unachieved = patch(achievement.icon_unachieved);
							}
						}

						// Send an update event, in case someone else is subscribed
						setTimeout(() => module.queryCache!.getQueryCache().notify(event));
					});
				},
				dismount() {
					cacheFixSubscription();
				}
			});

			// Prevent retrieving info about shortcuts, since their appid might break serialization
			// jspb.BinaryConstants.TWO_TO_3
			mounts.addPatchMount({
				patch(): Patch{
					return replacePatch(AppInfo.__proto__, "LoadAppInfoBatchFromLocalCache", function(args: any[]){
						if(args.length && Array.isArray(args[0]) && args[0].some(a => a >= 2147483648))
							return Promise.resolve([]);
						else
							return callOriginal;
					});
				}
			});
		}
		else
			module.hasAchievementSetsSupport = false;
	}

	progressDescription(data?: AchievementsData): string{
		if(data?.groups.length && data.groups.length > 1){
			return t("foundAchievementsSets")
				.replace("{num1}", data.groups.flatMap(g => g.achievements).length.toString())
				.replace("{num2}", data.groups.length.toString());
		}
		else
			return t("foundAchievements").replace("{num}", (data?.groups.flatMap(g => g.achievements).length ?? 0).toString());
	}

	isEmpty(data: AchievementsData): boolean {
		return !data.groups.some(g => g.achievements.length);
	}
	
	protected override cacheData(appId: number, data: AchievementsData | null): void {
		// Achievements are never cached since they are already cached inside providers to be merged with progress
		this.notCachedData[appId] = data;
	}

	get category(): boolean
	{
		return this.config.category;
	}

	set category(category: boolean)
	{
		this.config.category = category;
		void this.saveConfig();
	}

	get appDetails(): boolean
	{
		return this.config.app_details;
	}

	set appDetails(app_details: boolean)
	{
		this.config.app_details = app_details;
		void this.saveConfig();
	}

	get overlayMenu(): boolean
	{
		return this.config.overlay_menu;
	}

	set overlayMenu(overlay_menu: boolean)
	{
		this.config.overlay_menu = overlay_menu;
		void this.saveConfig();
	}

	override icon = <FaClipboardCheck/>; // In honor of Emuchievements

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [category, setCategory] = useState(this.category);
		const [appDetails, setAppdetails] = useState(this.appDetails);
		const [overlayMenu, setOverlayMenu] = useState(this.appDetails);

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("achievementsSettingsCategory")}
						description={t("achievementsSettingsCategoryDesc")}>
						<Toggle
							value={category}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setCategory(checked);
								this.category = checked;
							}}/>
					</Field>
					<Field
						label={t("achievementsSettingsAppDetails")}
						description={t("achievementsSettingsAppDetailsDesc")}>
						<Toggle
							value={appDetails}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setAppdetails(checked);
								this.appDetails = checked;
							}}/>
					</Field>
					<Field
						label={t("achievementsSettingsOverlay")}
						description={t("achievementsSettingsOverlayDesc")}>
						<Toggle
							value={overlayMenu}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setOverlayMenu(checked);
								this.overlayMenu = checked;
							}}/>
					</Field>
				</DialogControlsSection>
			</>
		);
	};

	public removeAchievementsSchema(appId: number){
		this.queryCache?.invalidateQueries({
			queryKey: ["achievements", appId, "schema"],
			exact: true
		});
	}
	public clearAchievementsSchema(){
		if(!this.queryCache)
			return;

		for (let appId of this.state.apps){
			this.removeAchievementsSchema(+appId);
		}
	}

	// applyOverview and applyDetails not used apparently...
}