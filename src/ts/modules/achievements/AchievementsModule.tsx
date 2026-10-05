import { FaClipboardCheck } from "react-icons/fa";
import { SteamAppTypeShortcut, StoreCategory, type AchievementsData } from "../../Interfaces";
import Logger from "../../logger";
import type { Mounts } from "../../System";
import { format, t } from "../../useTranslations";
import { Module, type ModuleCache, type ModuleConfig } from "../Module";
import type { AchievementsProvider } from "./AchievementsProvider";
import { afterPatch, beforePatch, callOriginal, DialogControlsSection, Field, findModuleExport, replacePatch, Toggle, type Patch } from "@decky/ui";
import type { AllAchievements, AppData, GlobalAchievements, Hook, SteamAppOverview } from "../../SteamTypes";
import { stateTransaction } from "../../util";
import { useMetaDeckState } from "../../MetaDeckState";
import { useState } from "react";
import React from "react";
import { RetroAchievementsAchievementsProvider, type RetroAchievementsAchievementsProviderCache, type RetroAchievementsAchievementsProviderConfig } from "./providers/RetroAchievementsAchievementsProvider";
import { RPCS3AchievementsProvider, type RPCS3AchievementsProviderCache, type RPCS3AchievementsProviderConfig } from "./providers/RPCS3AchievementsProvider";
import { XeniaAchievementsProvider, type XeniaAchievementsProviderCache, type XeniaAchievementsProviderConfig } from "./providers/XeniaAchievementsProvider";

// DEV: figure out what is bypassCounter in MetadataModule and if we can use that too (maybe it's to avoid multiple requests or ripples?)

// DEV: check how to re-implement loading check

export interface AchievementsConfig extends ModuleConfig<AchievementsProviderConfigs, AchievementsProviderConfigTypes>
{
	category: boolean,
	app_details: boolean,
	overlay_menu: boolean
}

export interface AchievementsCache extends ModuleCache<AchievementsProviderCaches, AchievementsProviderCacheTypes, AchievementsData>
{

}

export interface AchievementsProviderConfigs
{
	ra: RetroAchievementsAchievementsProviderConfig;
	rpcs3: RPCS3AchievementsProviderConfig;
	xenia: XeniaAchievementsProviderConfig;
}

export interface AchievementsProviderCaches
{
	ra: RetroAchievementsAchievementsProviderCache;
	rpcs3: RPCS3AchievementsProviderCache;
	xenia: XeniaAchievementsProviderCache;
}

export interface AchievementsProviderResolverConfigs
{
	ra: RetroAchievementsAchievementsProviderConfig['resolvers'];
	rpcs3: RPCS3AchievementsProviderConfig['resolvers'];
	xenia: XeniaAchievementsProviderConfig['resolvers'];
}

export interface AchievementsProviderResolverCaches
{
	ra: RetroAchievementsAchievementsProviderCache['resolvers'];
	rpcs3: RPCS3AchievementsProviderCache['resolvers'];
	xenia: XeniaAchievementsProviderCache['resolvers'];
}

export type AchievementsProviderConfigTypes = AchievementsProviderConfigs[keyof AchievementsProviderConfigs];

export type AchievementsProviderCacheTypes = AchievementsProviderCaches[keyof AchievementsProviderCaches];

export class AchievementsModule extends Module<
	   AchievementsModule,
	   AchievementsProvider<any>,
	   AchievementsConfig,
	   AchievementsProviderConfigs,
	   AchievementsProviderConfigTypes,
	   AchievementsProviderResolverConfigs,
	   AchievementsCache,
	   AchievementsProviderCaches,
	   AchievementsProviderCacheTypes,
	   AchievementsProviderResolverCaches,
	   AchievementsData
>{

	static identifier: string = "achievements";
	static title: string = t("moduleAchievements");
	identifier: string = AchievementsModule.identifier;
	title: string = AchievementsModule.title;
	logger: Logger = new Logger(AchievementsModule.identifier)

	providers: AchievementsProvider<any>[] = [
		new RetroAchievementsAchievementsProvider(this),
		new RPCS3AchievementsProvider(this),
		new XeniaAchievementsProvider(this)
	];

	override get enabled(){
		return false;
	}

	public override async removeCache(appId: number): Promise<void> {
		await super.removeCache(appId);

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

		// DEV: What is this?
		// Maybe use SteamClient.Apps.GetMyAchievementsForApp?
		mounts.addPatchMount({
			patch(): Patch
			{
				const Achievements = findModuleExport(mProp => mProp?.m_mapMyAchievements);
				module.logger.debug("Achievements", Achievements);

				return replacePatch(
					Achievements.__proto__,
					"LoadMyAchievements",
					args =>
					{
						if(!module.isValid || module.excludedApps.indexOf(args[0]) !== -1)
							return callOriginal;

						module.logger.debug("LoadMyAchievements");
						//console.log(args, appStore.GetAppOverviewByAppID(args[0]), appDetailsStore.GetAppDetails(args[0]));

						if (appStore.GetAppOverviewByAppID(args[0])?.app_type === SteamAppTypeShortcut && !Achievements.m_mapGlobalAchievements.has(args[0])){
							const data = module.fetchData(args[0]);
							if(data){
								let user: AllAchievements['data'] = {
									achieved: {},
									hidden: {},
									unachieved: {}
								};
								let global: GlobalAchievements['data'] = {};
								for(let achievement of data.achievements){
									if(achievement.bAchieved)
										user.achieved[achievement.strID] = achievement;
									else if(achievement.bHidden)
										user.hidden[achievement.strID] = achievement;
									else
										user.unachieved[achievement.strID] = achievement;

									global[achievement.strID] = achievement.flAchieved;
								}

								Achievements.m_mapMyAchievements.set(args[0], {
									loading: false,
									data: user
								} as AllAchievements);
								Achievements.m_mapGlobalAchievements.set(args[0], {
									loading: false,
									data: global
								} as GlobalAchievements);

								module.logger.debug(user);
								module.logger.debug(global);
							}
							else
								module.logger.debug("No achievements");
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
						if (!module.isValid || !module.category || module.excludedApps.indexOf((this as SteamAppOverview).appid) !== -1)
							return callOriginal;

						// @ts-ignore
						module.logger.debug("BHasStoreCategory", this, args);

						// @ts-ignore
						if ((this as SteamAppOverview).app_type == SteamAppTypeShortcut &&
							args[0] === StoreCategory.Achievements){

							// @ts-ignore
							const data = module.fetchData((this as SteamAppOverview).appid);
							if (data?.achievements.length)
								return true;
						}

						return callOriginal;
					}
				);
			}
		});

		// Patching appDetailsStore.GetAchievements retrieves them only on app details,
		// while patching appDetailsStore.GetAppData retrieves them also on overlay
		mounts.addPatchMount({
			patch(): Patch
			{
				return beforePatch(
					appDetailsStore.__proto__,
					"GetAchievements",
					args =>
					{
						if(!module.isValid || module.overlayMenu || module.excludedApps.indexOf(args[0]) !== -1)
							return;

						const overview = appStore.GetAppOverviewByAppID(args[0]);
						if(overview.app_type != SteamAppTypeShortcut)
							return;

						let appData = appDetailsStore.GetAppData(args[0]);
						if(!appData.details)
							return;

						const data = module.fetchData(args[0]);
						let achieved = data?.achievements.filter(a => a.bAchieved);
						const nAchieved = achieved?.length ?? 0;
						const nTotal = data?.achievements.length ?? 0;
						const vecHighlight = achieved?.filter(a => a.bHidden !== true) ?? [];
						const vecAchievedHidden = data?.achievements.filter(a => a.bHidden) ?? [];
						const vecUnachieved = data?.achievements?.filter(a => !a.bAchieved) ?? [];
						stateTransaction(() => {
							appData.details!.achievements = {
								nAchieved,
								nTotal,
								vecAchievedHidden,
								vecHighlight,
								vecUnachieved
							};
							appDetailsCache.SetCachedDataForApp(args[0], "achievements", 2, appData.details!.achievements);
						});

						return appData;
					}
				);
			}
		});
		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					appDetailsStore.__proto__,
					"GetAppData",
					(args, appData: AppData) =>
					{
						if(!module.isValid || !module.overlayMenu || module.excludedApps.indexOf(args[0]) !== -1 || !appData.details)
							return appData;

						const overview = appStore.GetAppOverviewByAppID(args[0]);
						if(overview.app_type != SteamAppTypeShortcut)
							return appData;

						const data = module.fetchData(args[0]);
						let achieved = data?.achievements.filter(a => a.bAchieved);
						const nAchieved = achieved?.length ?? 0;
						const nTotal = data?.achievements.length ?? 0;
						const vecHighlight = achieved?.filter(a => a.bHidden !== true) ?? [];
						const vecAchievedHidden = data?.achievements.filter(a => a.bHidden) ?? [];
						const vecUnachieved = data?.achievements?.filter(a => !a.bAchieved) ?? [];
						stateTransaction(() => {
							appData.details!.achievements = {
								nAchieved,
								nTotal,
								vecAchievedHidden,
								vecHighlight,
								vecUnachieved
							};
							appDetailsCache.SetCachedDataForApp(args[0], "achievements", 2, appData.details!.achievements);
						});

						return appData;
					}
				);
			}
		});

		// DEV: What is this?
		// mountManager.addPatchMount({
		// 	patch(): Patch
		// 	{
		// 		return beforePatch(
		// 			Router,
		// 			"BIsStreamingRemotePlayTogetherGame",
		// 			_ =>
		// 			{
		// 				logger.debug('BIsStreamingRemotePlayTogetherGame');
		// 				if (state.managers.some(m => m.isReady((Router.MainRunningApp as SteamAppOverview | undefined)?.appid ?? 0)))
		// 				{
		// 					setAchievements((Router.MainRunningApp as SteamAppOverview | undefined)?.appid ?? 0);
		// 				}
		// 			}
		// 		);
		// 	}
		// });

		// Achievements section on app details page
		mounts.addPatchMount({
			patch(): Patch
			{
				const AppDetailsSections = findModuleExport((mProp) => (
					typeof mProp === 'function' &&
					typeof mProp.prototype?.GetSections === 'function'
				));
				module.logger.debug("AppDetailsSections", AppDetailsSections);

				return afterPatch(AppDetailsSections.prototype, 'GetSections', function(this: any, _: Record<string, unknown>[], ret: Set<string>)
				{
					const overview: SteamAppOverview = this?.props?.overview;
					if (module.isValid && overview?.app_type === SteamAppTypeShortcut || (overview && module.excludedApps.indexOf(overview.appid) !== -1)){
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
		mounts.addMount({
			mount: function (): void
			{
				overlayOpenLifetimeHook = SteamClient.Overlay.RegisterForOverlayActivated((_, appId, active) => {
					if (!module.isValid || module.excludedApps.indexOf(appId) !== -1)
						return;

					module.logger.debug("overlay", appId, active);
					if(active && appStore.GetAppOverviewByAppID(appId).app_type == SteamAppTypeShortcut){
						void module.removeCache(appId);
						module.fetchData(appId);
					}
				});
				appCloseLifetimeHook = SteamClient.GameSessions.RegisterForAppLifetimeNotifications(update =>
				{
					if (!module.isValid || module.excludedApps.indexOf(update.unAppID) !== -1)
						return;

					module.logger.debug("lifetime", update);
					if (!update.bRunning && appStore.GetAppOverviewByAppID(update.unAppID).app_type == SteamAppTypeShortcut){
						void module.removeCache(update.unAppID);
						module.fetchData(update.unAppID);
					}
				});
			},
			dismount: function (): void
			{
				overlayOpenLifetimeHook?.unregister();
				appCloseLifetimeHook?.unregister();
			}
		});
	}

	progressDescription(data?: AchievementsData): string{
		return format(t("foundAchievements"), data?.achievements?.length ?? 0);
	}

	get category(): boolean
	{
		return this.config.category
	}

	set category(category: boolean)
	{
		this.config.category = category
	}

	get appDetails(): boolean
	{
		return this.config.app_details
	}

	set appDetails(app_details: boolean)
	{
		this.config.app_details = app_details
	}

	get overlayMenu(): boolean
	{
		return this.config.overlay_menu
	}

	set overlayMenu(overlay_menu: boolean)
	{
		this.config.overlay_menu = overlay_menu
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

	// applyOverview and applyDetails not used apparently...
}