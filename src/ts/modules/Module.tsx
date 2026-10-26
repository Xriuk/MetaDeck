import {Provider, ProviderCache, ProviderConfig, type ProviderIdentifier} from "./Provider";
import {MetadataCache, MetadataConfig} from "./metadata/MetadataModule";
import {AsyncMountable, Mounts} from "../System";
import {MetaDeckState, Modules} from "../MetaDeckState";
import {FC, type ReactNode} from "react";
import Logger from "../logger";
import {CompatdataCache, CompatdataConfig} from "./compatdata/CompatdataModule";
import {SteamAppDetails, SteamAppOverview} from "../SteamTypes";
import {getAppDetails, stateTransaction} from "../util";
import {t} from "../useTranslations";
import PromisePool from "es6-promise-pool";
import { SteamAppTypeShortcut } from "../Interfaces";
import type { AchievementsCache, AchievementsConfig } from "./achievements/AchievementsModule";
import { Settings } from "../settings";
import { merge } from "lodash-es";

type ProviderOverrides<Providers extends string | symbol | number = string> = Record<number, Extract<Providers, string>>;

export interface ModuleConfig<ProvConfigs extends Record<keyof ProvConfigs, ProviderConfig<any>>>{
	enabled: boolean;
	excluded_apps: number[];
	providers_overrides: ProviderOverrides<keyof ProvConfigs>;
	providers: ProvConfigs;
}

export interface ModuleCache<ProvCaches extends Record<keyof ProvCaches, ProviderCache>, Data>{
	data: Record<number, Data | null>;
	data_providers: Record<number, keyof ProvCaches>;
	providers: ProvCaches;
}

export interface ModuleConfigs{
	metadata: MetadataConfig;
	compatdata: CompatdataConfig;
	achievements: AchievementsConfig;
}

export interface ModuleCaches{
	metadata: MetadataCache;
	compatdata: CompatdataCache;
	achievements: AchievementsCache;
}

export type ModuleIdentifier = keyof ModuleConfigs & keyof ModuleCaches;

export abstract class Module<
	Identifier extends ModuleIdentifier,
	Prov extends Provider<any, any>,

	Data = ModuleCaches[Identifier]['data'][number]
> implements AsyncMountable{
	private readonly _state: MetaDeckState;
	get state(): MetaDeckState{
		return this._state;
	}

	abstract identifier: Identifier;
	abstract title: string;

	abstract logger: Logger;

	abstract providers: Prov[];

	get config(){
		return this.state.settings.config.modules[this.identifier];
	}

	get cache(){
		return this.state.settings.cache.modules[this.identifier];
	}

	dependencies: (keyof Modules)[] = [];

	private _unmetDependency: boolean = false;

	constructor(state: MetaDeckState){
		state.mounts.addMount(this);
		this.addMounts(state.mounts);
		this._state = state;
	}

	protected handleError(error: Error): never{
		if(this.state.loadingData.currentModule)
			this.state.loadingData.currentModule.error = error
		throw error
	}

	get data(): Record<number, Data | null>{
		return this.cache.data as any;
	}

	set data(data: Record<number, Data | null>){
		this.cache.data = data as any;
		void this.saveCache();
	}

	notCachedData: Record<number, Data | null> = {}; // Heavy data which should not be saved to cache

	get dataProviders(){
		return this.cache.data_providers;
	}

	set dataProviders(data: typeof this.cache.data_providers){
		this.cache.data_providers = data;
		void this.saveCache();
	}

	get providerOverrides(){
		return this.config.providers_overrides;
	}

	set providerOverrides(data: typeof this.config.providers_overrides){
		this.config.providers_overrides = data;
		void this.saveConfig();
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

	get isValid(): boolean{
		return !this.unmetDependency && this.enabled;
	}

	get overviews(): SteamAppOverview[]{
		return this.state.overviews
			.filter(a => !this.excludedAppsSelf.includes(a.appid));
	}

	get apps(): number[]
	{
		return this.overviews.map(overview => overview.appid);
	}

	async apply(appId: number): Promise<void>{
		if(this.excludedApps.includes(appId))
			return;

		const overview = appStore.GetAppOverviewByAppID(appId)
		if (overview.app_type == SteamAppTypeShortcut)
			await this.applyApp(overview, await getAppDetails(appId));
	}

	async applyApp(overview: SteamAppOverview, details: SteamAppDetails | null){
		if(this.excludedApps.includes(overview.appid))
			return;

		try{
			if (overview.app_type == SteamAppTypeShortcut){
				await this.applyOverview(overview);
				await stateTransaction(async () => {
					if(details)
						await this.applyDetails(details)
				});
			}
		}
		catch (e: any){
			this.handleError(e);
		}

	}

	applyOverview(_overview: SteamAppOverview): Promise<void>{
		return Promise.resolve();
	}

	applyDetails(_details: SteamAppDetails): Promise<void>{
		return Promise.resolve();
	}

	async removeCache(appId: number): Promise<void>{
		await this.state.settings.runInDisabledSaveState(() => {
			delete this.data[appId];
			return Promise.resolve();
		});

		await this.saveCache();

		delete this.notCachedData[appId];
	}

	async clearProviderCache(identifier: ProviderIdentifier<Module<Identifier, Prov>>){
		await this.state.settings.runInDisabledSaveState(async () => {
			for (let appId of this.state.apps){
				if(this.dataProviders[appId] === identifier)
					await this.removeCache(+appId);
			}
		});

		await this.saveCache();
	}

	async clearCache(): Promise<void>{
		await this.state.settings.runInDisabledSaveState(async () => {
			for (let appId of this.state.apps){
				await this.removeCache(+appId);
			}
			this.data = {};
			this.dataProviders = {};

			this.cache.providers = merge({}, Settings.defaultCache.modules[this.identifier as keyof ModuleCaches].providers as any);
		});

		await this.saveCache();

		this.notCachedData = {};
	}

	saveConfig(): Promise<void>{
		return this.state.settings.writeConfig();
	}

	saveCache(): Promise<void>{
		return this.state.settings.writeCache();
	}

	abstract addMounts(mounts: Mounts): void;

	abstract progressDescription(data?: Data): string;

	abstract isEmpty(data: Data): boolean;

	get missingDescription(): string{
		return t("noData").replace("{data}", this.title);
	}

	public hasData(appId: number): boolean{
		return this.getCachedData(appId) != null;
	}

	public hasCachedData(appId: number): boolean{
		return this.getCachedData(appId) !== undefined;
	}

	protected cacheData(appId: number, data: Data | null){
		if(!data || JSON.stringify(data).length < 5000)
			this.data[appId] = data;
		else
			this.notCachedData[appId] = data;
	}

	protected getCachedData(appId: number){
		return this.data[appId]
			?? this.notCachedData[appId]
			?? undefined;
	}

	public fetchData(appId: number): Data | undefined{
		if(this.excludedApps.includes(appId))
			return undefined;

		try{
			this.logger.debug(`Fetching ${this.identifier} for ${appId} ${(appStore.GetAppOverviewByAppID(appId)?.display_name ?? 'unknown')}`,
				this.getCachedData(appId),
				this.dataProviders[appId]);

			if (!this.hasCachedData(appId))
				void this.fetchDataAsync(appId);

			return this.getCachedData(appId);
		}
		catch (e: any){
			this.handleError(e);
		}
	}

	protected async fetchDataProviders(appId: number): Promise<[ProviderIdentifier<Module<Identifier, Prov>>, Data] | undefined>{
		for (const provider of this.providers){
			if(!provider.isValid || provider.excludedAppsSelf.includes(appId) || !await provider.test(appId))
				continue;
			
			const data = await provider.provide(appId);
			if(!data || this.isEmpty(data))
				continue;
			
			return [provider.identifier, data];
		}

		return undefined;
	}

	public async fetchDataAsync(appId: number): Promise<Data | undefined>{
		if(this.excludedApps.includes(appId))
			return undefined;

		try{
			if (!this.hasCachedData(appId)){				
				// Prevent saving multiple times inside providers
				await this.state.settings.runInDisabledSaveState(async () => {
					// Check if we have a saved provider
					if(this.dataProviders[appId] || this.providerOverrides[appId]){
						let providerId = this.dataProviders[appId] ?? this.providerOverrides[appId];
						const provider = this.providers.find(p => p.identifier === providerId);
						if(provider?.isValid && !provider.excludedAppsSelf.includes(appId) && await provider.test(appId)){
							const data = await provider.provide(appId);
							if(data && !this.isEmpty(data)){
								// DEV: merge with below
								await this.provideAdditional(appId, data);
								this.logger.debug(`Caching ${this.identifier} for ${appId}: `, data, provider.identifier);

								this.cacheData(appId, data);
								this.dataProviders[appId] = provider.identifier;
							}
							else if(!this.providerOverrides[appId])
								delete this.dataProviders[appId];
							else
								return undefined;
						}
						else if(!this.providerOverrides[appId])
							delete this.dataProviders[appId];
						else
							return undefined;
					}

					// Retrieve a new provider
					if(!this.hasCachedData(appId)){
						const data = await this.fetchDataProviders(appId);
						if(data){
							await this.provideAdditional(appId, data[1]);
							this.logger.debug(`Caching ${this.identifier} for ${appId}: `, data[1], data[0]);

							this.cacheData(appId, data[1]);
							this.dataProviders[appId] = data[0] as any;
						}
					}
					
					// Provide default data, if any,
					// or still cache undefined to avoid querying continuously
					if(!this.hasCachedData(appId)){
						let defaultData = await this.provideDefault(appId);
						if(defaultData && !this.isEmpty(defaultData)){
							this.logger.debug(`Caching ${this.identifier} for ${appId}: `, defaultData, 'default');

							this.cacheData(appId, defaultData);
						}
						else{
							this.logger.debug(`Caching no provider/default ${this.identifier} for ${appId}`);

							this.cacheData(appId, null);
						}
					}
				});

				await this.saveCache();
			}
			else
				this.logger.debug(`Loading cached ${this.identifier} for ${appId}: `, this.getCachedData(appId), this.dataProviders[appId]);

			void this.apply(appId);

			return this.getCachedData(appId);
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

	private async refreshDataForApp(appId: number): Promise<void>{
		const data = await this.fetchDataAsync(appId);
		this.logger.debug(`Refreshed ${this.identifier} for ${appId}: `, data);
		if(!this.state.loadingData.currentModule)
			return;
		
		const overview = appStore.GetAppOverviewByAppID(appId);
		this.state.loadingData.currentModule.game = overview.display_name;
		if (overview && data)
			this.state.loadingData.currentModule.description = !!data ? this.progressDescription(data) : this.missingDescription;
		else
			this.state.loadingData.currentModule.description = this.missingDescription;
		this.state.loadingData.currentModule.processed++;
	}

	icon?: ReactNode;
	settingsComponent: FC = () => undefined;

	async mount(): Promise<void>{
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

	async dismount(): Promise<void>{
		try{
			for (const provider of this.providers){
				await provider.dismount();
			}
		}
		catch (e: any){
			this.handleError(e);
		}

	}

	// Should not return empty data
	protected async provideDefault(_appId: number): Promise<Data | undefined>{
		return undefined
	}

	// DEV: find a way to remove/merge(?)
	async provideAdditional(appId: number, data: Data): Promise<void>{
		if(this.excludedApps.includes(appId))
			return undefined;

		for (const provider of this.providers){
			if (provider.isValid && !provider.excludedAppsSelf.includes(appId) && await provider.test(appId)){
				await provider.apply(appId, data);
				return;
			}
		}
	}

	onOverridesChange(oldOverrides: typeof this.config.providers_overrides, newOverrides: typeof this.config.providers_overrides){
		// Retrieve changed app ids: new values, values with changed ids and removed values
		let changedIds = Object.entries(newOverrides)
			.filter(([a, i]) => oldOverrides[a as any] !== i)
			.map(([a, _]) => a as unknown as number)
			.concat(Object.keys(oldOverrides).filter(a => !newOverrides[a as any]) as unknown as number[])
			.map(a => +a);

		return this.onExcludedChange([], changedIds);
	}

	async onExcludedChange(oldExcluded: number[], newExcluded: number[]){
		// Retrieve changed app ids: new values and removed values
		let changedIds = newExcluded
			.filter(a => !oldExcluded.includes(a))
			.concat(oldExcluded.filter(a => !newExcluded.includes(a)));

		// Remove cache and clear provider, not re-fetching because there might be a lot of entries, they will be fetched as needed
		await this.state.settings.runInDisabledSaveState(async () => {
			for(let changedId of changedIds){
				await this.removeCache(changedId);
				delete this.dataProviders[changedId];
			}
		});

		await this.saveCache();
	}
}