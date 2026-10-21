import { FaClipboardCheck } from "react-icons/fa";
import { SteamAppTypeShortcut, StoreCategory, type AchievementsData } from "../../Interfaces";
import Logger from "../../logger";
import type { Mounts } from "../../System";
import { t } from "../../useTranslations";
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
}

export interface AchievementsProviderCaches{
	ra: RetroAchievementsAchievementsProviderCache;
	rpcs3: RPCS3AchievementsProviderCache;
	xenia: XeniaAchievementsProviderCache;
}

export class AchievementsModule extends Module<"achievements", AchievementsProvider<any>>{
	identifier = "achievements" as const;
	title = t("moduleAchievements");

	logger: Logger = new Logger(this.identifier);

	providers: AchievementsProvider<any>[] = [
		new RetroAchievementsAchievementsProvider(this),
		new RPCS3AchievementsProvider(this),
		new XeniaAchievementsProvider(this)
	];

	override async removeCache(appId: number): Promise<void> {
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
						if(!module.isValid || module.excludedApps.includes(args[0]))
							return callOriginal;

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
		const achievementsAppData = (appId: number, appData: AppData) => {
			if(!appData.details || appData.details.achievements?.nTotal ||
				(appData.bLoadingAchievments && !module.hasCachedData(appId))){

				return;
			}

			// Start loading achievements and wait for them to finish
			appData.bLoadingAchievments = true;
			const data = module.fetchData(appId);
			if(!module.hasCachedData(appId))
				return;

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

				appDetailsCache.SetCachedDataForApp(appId, "achievements", 2, appData.details!.achievements);
			});
			appData.bLoadingAchievments = false;
		}
		mounts.addPatchMount({
			patch(): Patch{
				return beforePatch(
					appDetailsStore.__proto__,
					"GetAchievements",
					args => {
						if(!module.isValid || module.overlayMenu || module.excludedApps.includes(args[0]))
							return;

						const overview = appStore.GetAppOverviewByAppID(args[0]);
						if(overview.app_type != SteamAppTypeShortcut)
							return;

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
			patch(): Patch
			{
				const AppDetailsSections = findModuleExport((mProp) => (
					typeof mProp === 'function' &&
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
		mounts.addMount({
			mount: function (): void
			{
				overlayOpenLifetimeHook = SteamClient.Overlay.RegisterForOverlayActivated((_, appId, active) => {
					if (!module.isValid || module.excludedApps.includes(appId))
						return;

					if(active && appStore.GetAppOverviewByAppID(appId).app_type == SteamAppTypeShortcut){
						void module.removeCache(appId);
						module.fetchData(appId);
					}
				});
				appCloseLifetimeHook = SteamClient.GameSessions.RegisterForAppLifetimeNotifications(update =>
				{
					if (!module.isValid || module.excludedApps.includes(update.unAppID))
						return;

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
		return t("foundAchievements").replace("{num}", (data?.achievements?.length ?? 0).toString());
	}

	isEmpty(data: AchievementsData): boolean {
		return !data.achievements?.length;
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

	// applyOverview and applyDetails not used apparently...
}