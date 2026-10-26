import {AsyncMountable} from "../System";
import {MetaDeckState, type Resolvers} from "../MetaDeckState";
import {Module, type ModuleCaches, type ModuleConfigs, type ModuleIdentifier} from "./Module";
import {FC, type ReactNode} from "react";
import throttledQueue from "throttled-queue";
import {ModuleResolver, type Resolver, type ResolverIdentifier} from "./Resolver";
import {ID, type IDDictionary} from "../Interfaces";
import type { SteamAppOverview } from "../SteamTypes";
import { Settings } from "../settings";

export interface ProviderResolverConfig{
	enabled: boolean;
}

export interface ProviderConfig<Resolvers extends ResolverIdentifier = never>{
	enabled: boolean;
	excluded_apps: number[];
	// https://github.com/sindresorhus/type-fest/blob/e9f614f191aa039e4aefa2d41d62c2a3fd070cfd/source/is-never.d.ts#L54
	resolvers: [Resolvers] extends [never] ? {} : Record<Resolvers, ProviderResolverConfig>;
}

export interface ProviderCache{
	
}

export type ProviderIdentifier<Mod extends Module<any, any, any>> =
	keyof Mod['config']['providers'] & keyof Mod['cache']['providers'];

type Cast<Type, Dest> = Type extends Dest ? Type : never;
// https://github.com/sindresorhus/type-fest/blob/e9f614f191aa039e4aefa2d41d62c2a3fd070cfd/source/is-any.d.ts#L29
type IsAny<Type> = 0 extends 1 & Type ? true : false; // NoInfer<T> gives problems...

export abstract class Provider<
	Mod extends Module<any, any, any>,
	Identifier extends ProviderIdentifier<Mod>,

	ModId extends ModuleIdentifier = Mod extends Module<infer Id, any, any> ? Id : never,
	ProvConfig extends ProviderConfig<any> = IsAny<Identifier> extends true ?
		ProviderConfig<any> :
		Cast<ModuleConfigs[ModId]['providers'][Identifier], ProviderConfig<any>>
> implements AsyncMountable
{
	get state(): MetaDeckState{
		return this.module.state;
	}

	private readonly _module: Mod;
	get module(): Mod{
		return this._module;
	}

	get config(): ProvConfig{
		return this.module.config.providers[this.identifier];
	}

	get cache(): ModuleCaches[ModId]['providers'][Identifier]{
		return this.module.cache.providers[this.identifier];
	}

	abstract identifier: Identifier;
	abstract title: string;

	protected throttle = throttledQueue(4, 1000, true);

	constructor(module: Mod){
		this._module = module;
	}

	protected handleError(error: Error): never{
		if(this.state.loadingData.currentModule)
			this.state.loadingData.currentModule.error = error
		throw error
	}

	mount(): Promise<void>{
		return Promise.resolve();
	}

	dismount(): Promise<void>{
		return Promise.resolve();
	}

	get enabled(): boolean{
		return this.config.enabled;
	}

	set enabled(enabled: boolean){
		this.config.enabled = enabled;
		void this.saveConfig();
	}

	get excludedApps(): number[]
	{
		return this.module.excludedApps.concat(this.excludedAppsSelf);
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

	get isValid(): boolean{
		return this.enabled;
	}

	get overviews(): SteamAppOverview[]
	{
		return this.module.overviews
			.filter(a => !this.excludedAppsSelf.includes(a.appid));
	}

	get apps(): number[]
	{
		return this.overviews.map(overview => overview.appid);
	}

	get resolvers(): IsAny<Identifier> extends true ? Resolver<any>[] : Resolvers[Cast<keyof ProvConfig['resolvers'], ResolverIdentifier>][]{
		// Exclude previous resolvers which might still be in config...
		const modules = Settings.defaultConfig.modules;
		const providers = modules[this.module.identifier as keyof typeof modules].providers;
		return Object.keys((providers[this.identifier as keyof typeof providers] as ProviderConfig).resolvers)
			.map(r => (this.state.resolvers as any)[r] as Resolver<any>) as any;
	}

	async test(appId: number, external = false): Promise<boolean>{
		if(!external && this.excludedApps.includes(appId))
			return false;

		for(let resolver of this.resolvers){
			if(resolver.isEnabled(this as any) && await resolver.test(appId))
				return true;
		}

		return false;
	}
	
	async resolve(appId: number, external = false): Promise<ID | undefined>{
		if(!external && this.excludedApps.includes(appId))
			return undefined;

		for (const resolver of this.resolvers){
			if (resolver.isEnabled(this as any) && await resolver.test(appId)){
				let id = await resolver.resolve(appId);
				if(id !== undefined)
					return id;
			}
		}

		return undefined;
	}

	async apply(appId: number, data: Mod['data'][number]): Promise<void>{
		if(this.excludedApps.includes(appId))
			return;

		for (const resolver of this.resolvers){
			if (resolver instanceof ModuleResolver && resolver.moduleIdentifier === this.module.identifier &&
				resolver.isEnabled(this as any) && await resolver.test(appId)){
					
				await resolver.apply(appId, data);
				return;
			}
		}
	}

	protected async onOverridesChange(oldOverrides: IDDictionary, newOverrides: IDDictionary){
		// Retrieve changed app ids: new values, values with changed ids and removed values
		let changedIds = Object.entries(newOverrides)
			.filter(([a, i]) => oldOverrides[a as any] !== i)
			.map(([a, _]) => a as unknown as number)
			.concat(Object.keys(oldOverrides).filter(a => !newOverrides[a as any]) as unknown as number[])
			.map(a => +a);

		// Remove cache, not re-fetching because there might be a lot of entries, they will be fetched as needed
		await this.state.settings.runInDisabledSaveState(async () => {
			for(let changedId of changedIds){
				await this.module.removeCache(changedId);
			}
		});

		await this.saveCache();
	}

	saveConfig(): Promise<void>{
		return this.module.saveConfig();
	}

	saveCache(): Promise<void>{
		return this.module.saveCache();
	}

	clearModuleCache(){
		// Not re-fetching because there might be a lot of entries, they will be fetched as needed
		return this.module.clearProviderCache(this.identifier);
	}

	abstract provide(appId: number): ReturnType<Mod['fetchDataAsync']>;

	icon?: ReactNode;
	settingsComponent: FC = () => undefined;
}