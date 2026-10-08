import {Provider, ProviderCache, ProviderConfig} from "./Provider";
import {MetadataCache, MetadataConfig} from "./metadata/MetadataModule";
import {AsyncMountable, Mounts} from "../System";
import {MetaDeckState, Modules} from "../MetaDeckState";
import {FC, type ReactNode} from "react";
import Logger from "../logger";
import {CompatdataCache, CompatdataConfig} from "./compatdata/CompatdataModule";
import {SteamAppDetails, SteamAppOverview} from "../SteamTypes";
import {getAppDetails, stateTransaction} from "../util";
import {format, t} from "../useTranslations";
import PromisePool from "es6-promise-pool";
import {ResolverCache, ResolverConfig} from "./Resolver";
import { SteamAppTypeShortcut } from "../Interfaces";
import type { AchievementsCache, AchievementsConfig } from "./achievements/AchievementsModule";
import { Settings } from "../settings";
import { merge } from "lodash-es";

export interface ModuleConfig<ProvConfigs extends Record<keyof ProvConfigs, ProvConfig>, ProvConfig extends ProviderConfig<any, any>>
{
	enabled: boolean,
	excluded_apps: number[],
	providers: ProvConfigs
}

export interface ModuleCache<ProvCaches extends Record<keyof ProvCaches, ProvCache>, ProvCache extends ProviderCache<any, any>, Data>
{
	data: Record<number, Data>,
	data_providers: Record<number, string>,
	providers: ProvCaches
}

export interface ModuleConfigs
{
	metadata: MetadataConfig;
	compatdata: CompatdataConfig;
	achievements: AchievementsConfig;
}

export interface ModuleCaches
{
	metadata: MetadataCache;
	compatdata: CompatdataCache;
	achievements: AchievementsCache;
}

export abstract class Module<
	   Mod extends Module<Mod, Prov, ModConfig, ProvConfigs, ProvConfig, ProvResConfigs, ModCache, ProvCaches, ProvCache, ProvResCaches, Data>,
	   Prov extends Provider<Mod, Prov, any, ModConfig, ProvConfigs, ProvConfig, ProvResConfigs, ModCache, ProvCaches, ProvCache, ProvResCaches, Data>,
	   ModConfig extends ModuleConfig<ProvConfigs, ProvConfig>,
	   ProvConfigs extends Record<keyof ProvConfigs, ProvConfig>,
	   ProvConfig extends ProviderConfig<ProvResConfigs[keyof ProvResConfigs], ResolverConfig & ProvResConfigs[keyof ProvResConfigs][keyof ProvResConfigs[keyof ProvResConfigs]]>,
	   ProvResConfigs extends Record<keyof ProvResConfigs, Record<keyof ProvResConfigs[keyof ProvResConfigs], ProvResConfigs[keyof ProvResConfigs][keyof ProvResConfigs[keyof ProvResConfigs]]>>,
	   ModCache extends ModuleCache<ProvCaches, ProvCache, Data>,
	   ProvCaches extends Record<keyof ProvCaches, ProvCache>,
	   ProvCache extends ProviderCache<ProvResCaches[keyof ProvResCaches], ResolverCache & ProvResCaches[keyof ProvResCaches][keyof ProvResCaches[keyof ProvResCaches]]>,
	   ProvResCaches extends Record<keyof ProvResCaches, Record<keyof ProvResCaches[keyof ProvResCaches], ProvResCaches[keyof ProvResCaches][keyof ProvResCaches[keyof ProvResCaches]]>>,
	   Data
> implements AsyncMountable
{

	state: MetaDeckState;

	abstract identifier: string;
	abstract title: string;

	abstract logger: Logger;

	abstract providers: Prov[];

	get config(): ModConfig
	{
		return this.state.settings.config.modules[this.identifier as keyof typeof this.state.settings.config.modules] as unknown as ModConfig;
	}

	get cache(): ModCache
	{
		return this.state.settings.cache.modules[this.identifier as keyof typeof this.state.settings.cache.modules] as unknown as ModCache;
	}

	dependencies: (keyof Modules)[] = []

	private _unmetDependency: boolean = false;

	constructor(state: MetaDeckState)
	{
		state.mounts.addMount(this);
		this.addMounts(state.mounts);
		this.state = state;
	}

	protected handleError(error: Error): never
	{
		if(this.state.loadingData.currentModule)
			this.state.loadingData.currentModule.error = error
		throw error
	}

	get data(): Record<number, Data>
	{
		return this.cache.data;
	}

	set data(data: Record<number, Data>)
	{
		this.cache.data = data;
		void this.saveCache();
	}

	get dataProviders(): Record<number, string>
	{
		return this.cache.data_providers;
	}

	set dataProviders(data: Record<number, string>)
	{
		this.cache.data_providers = data;
		void this.saveCache();
	}

	get enabled(): boolean
	{
		return this.config.enabled;
	}

	set enabled(enabled: boolean)
	{
		this.config.enabled = enabled;
		void this.saveConfig();
	}

	get excludedApps(): number[]
	{
		return this.state.excludedApps.concat(this.excludedAppsSelf);
	}

	get excludedAppsSelf(): number[]
	{
		return this.config.excluded_apps;
	}

	set excludedAppsSelf(apps: number[])
	{
		this.config.excluded_apps = apps;
		void this.saveConfig();
	}

	get unmetDependency(): boolean
	{
		return this._unmetDependency;
	}

	set unmetDependency(value: boolean)
	{
		this._unmetDependency = value;
	}

	get isValid(): boolean
	{
		return !this.unmetDependency && this.enabled;
	}

	get overviews(): SteamAppOverview[]
	{
		return this.state.overviews
			.filter(a => !this.excludedAppsSelf.includes(a.appid));
	}

	get apps(): number[]
	{
		return this.overviews.map(overview => overview.appid);
	}

	async apply(appId: number): Promise<void>
	{
		if(this.excludedApps.includes(appId))
			return;

		const overview = appStore.GetAppOverviewByAppID(appId)
		if (overview.app_type == SteamAppTypeShortcut)
			await this.applyApp(overview, await getAppDetails(appId));
	}

	async applyApp(overview: SteamAppOverview, details: SteamAppDetails | null)
	{
		if(this.excludedApps.includes(overview.appid))
			return;

		try
		{
			if (overview.app_type == SteamAppTypeShortcut)
			{
				await this.applyOverview(overview);
				await stateTransaction(async () => {
					if(details)
						await this.applyDetails(details)
				})
			}
		} catch (e: any)
		{
			this.handleError(e);
		}

	}

	applyOverview(_overview: SteamAppOverview): Promise<void>
	{
		return Promise.resolve();
	}

	applyDetails(_details: SteamAppDetails): Promise<void>
	{
		return Promise.resolve();
	}

	async removeCache(appId: number): Promise<void>
	{
		await this.state.settings.runInDisabledSaveState(() => {
			delete this.data[appId];
			delete this.dataProviders[appId];
			return Promise.resolve();
		});

		await this.saveCache();
	}

	async clearCache(): Promise<void>
	{
		await this.state.settings.runInDisabledSaveState(async () => {
			for (let appId of Object.keys(this.data)){
				await this.removeCache(+appId);
			}
			this.data = {};
			this.dataProviders = {};

			this.cache.providers = merge({}, Settings.defaultCache.modules[this.identifier as keyof ModuleCaches].providers as any);
		});

		await this.saveCache();
	}

	saveConfig(): Promise<void>
	{
		return this.state.settings.writeConfig();
	}

	saveCache(): Promise<void>
	{
		return this.state.settings.writeCache();
	}

	abstract addMounts(mounts: Mounts): void;

	abstract progressDescription(data?: Data): string

	get missingDescription(): string
	{
		return format(t("noData"), this.title)
	}

	public hasData(appId: number): boolean
	{
		return !!this.data[appId];
	}

	public fetchData(appId: number): Data | undefined
	{
		if(this.excludedApps.includes(appId))
			return undefined;

		try{
			this.logger.debug(`Fetching ${this.identifier} for ${appId}`, this.data[appId], this.dataProviders[appId]);
			if (!this.data[appId])
				void this.fetchDataAsync(appId);
			return this.data[appId];
		}
		catch (e: any){
			this.handleError(e);
		}
	}

	public async fetchDataAsync(appId: number): Promise<Data | undefined>{
		if(this.excludedApps.includes(appId))
			return undefined;

		try{
			if (!this.hasData(appId)){
				// Prevent saving multiple times inside providers
				await this.state.settings.runInDisabledSaveState(async () => {
					for (const provider of this.providers){
						if (provider.enabled && await provider.test(appId)){
							const data = await provider.provide(appId);
							if (data){
								await this.provideAdditional(appId, data);
								this.logger.debug(`Caching ${this.identifier} for ${appId}: `, data, provider.identifier);

								this.data[appId] = data;
								this.dataProviders[appId] = provider.identifier;
								break;
							}
						}
					}
					
					if(!this.data[appId]){
						let defaultData = await this.provideDefault(appId);
						if(defaultData){
							this.logger.debug(`Caching ${this.identifier} for ${appId}: `, defaultData, 'default');

							this.data[appId] = defaultData;
						}
						else
							this.logger.debug(appId, "no provider");
					}
				});

				await this.saveCache();
			}
			else
				this.logger.debug(`Loading cached ${this.identifier} for ${appId}: `, this.data[appId], this.dataProviders[appId]);

			void this.apply(appId);

			return this.data[appId];
		}
		catch (e: any){
			this.handleError(e);
		}
	}

	async refresh(): Promise<void>{
		try{
			let self = this;

			// Prevent saving multiple times for each app
			await this.state.settings.runInDisabledSaveState(async () => {
				//@ts-ignore
				await new PromisePool(function* () {
					for (let appId of self.apps){
						yield self.refreshDataForApp(appId);
					}
				}, 4).start();
			});

			await this.saveCache();

			this.logger.debug(`Refreshed ${this.identifier}`, this.data);
		}
		catch (e: any){
			this.handleError(e);
		}

	}

	private async refreshDataForApp(appId: number): Promise<void>
	{
		if(this.excludedApps.includes(appId))
			return undefined;

		const overview = appStore.GetAppOverviewByAppID(appId);
		const data = await this.fetchDataAsync(appId)
		this.logger.debug(`Refreshed ${this.identifier} for ${appId}: `, data);
		if(!this.state.loadingData.currentModule)
			return;
		
		this.state.loadingData.currentModule.game = overview.display_name;
		if (overview && data)
			this.state.loadingData.currentModule.description = !!data ? this.progressDescription(data) : this.missingDescription;
		else
			this.state.loadingData.currentModule.description = this.missingDescription;
		this.state.loadingData.currentModule.processed++;
	}

	icon?: ReactNode;
	settingsComponent: FC = () => undefined;

	async mount(): Promise<void>
	{
		let backupLoading = this.state.loadingData.loading;
		let backupModule = this.state.loadingData.module;
		let backupGame = this.state.loadingData.currentModule?.game!;

		this.state.loadingData.loading = true;
		this.state.loadingData.module = this.identifier;
		if(this.state.loadingData.currentModule){
			this.state.loadingData.currentModule.game = t("initializing");
			this.state.loadingData.currentModule.total = this.providers.length;
			this.state.loadingData.currentModule.processed = 0;
		}
		this.state.notifyUpdate();

		try
		{
			if (this.enabled){
				for (const provider of this.providers){
					if (provider.enabled)
						await provider.mount();
					if(this.state.loadingData.currentModule){
						this.state.loadingData.currentModule.processed++;
						this.state.notifyUpdate();
					}
				}
			}
		}
		catch (e: any){
			this.handleError(e);
		}
		finally{
			if(this.state.loadingData.currentModule){
				this.state.loadingData.currentModule.total = 0;
				this.state.loadingData.currentModule.game = backupGame;
			}
			this.state.loadingData.module = backupModule;
			this.state.loadingData.loading = backupLoading;
			this.state.notifyUpdate();
		}
	}

	async dismount(): Promise<void>
	{
		try
		{
			for (const provider of this.providers)
			{
				await provider.dismount();
			}
		} catch (e: any)
		{
			this.handleError(e);
		}

	}

	protected async provideDefault(_appId: number): Promise<Data | undefined>
	{
		return undefined
	}

	async provideAdditional(appId: number, data: Data): Promise<void>
	{
		if(this.excludedApps.includes(appId))
			return undefined;

		for (const provider of this.providers)
		{
			if (provider.enabled && await provider.test(appId))
			{
				await provider.apply(appId, data);
				return;
			}
		}
	}

	async onExcludedChange(oldExcluded: number[], newExcluded: number[]){
		// Retrieve changed app ids: new values and removed values
		let changedIds = newExcluded
			.filter(a => !oldExcluded.includes(a))
			.concat(oldExcluded.filter(a => !newExcluded.includes(a)));

		// Remove cache and re-fetch
		await this.state.settings.runInDisabledSaveState(async () => {
			for(let changedId of changedIds){
				await this.removeCache(changedId);
				await this.fetchDataAsync(changedId);
			}
		});

		await this.saveCache();
	}
}