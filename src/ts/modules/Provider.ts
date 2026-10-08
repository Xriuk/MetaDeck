import {AsyncMountable} from "../System";
import {MetaDeckState} from "../MetaDeckState";
import {Module, ModuleCache, ModuleConfig} from "./Module";
import {FC, type ReactNode} from "react";
import throttledQueue from "throttled-queue";
import {Resolver, ResolverCache, ResolverConfig} from "./Resolver";
import {ID, type IDDictionary} from "../Interfaces";
import type { SteamAppOverview } from "../SteamTypes";

export interface ProviderConfig<ResConfigs extends Record<keyof ResConfigs, ResConfig>, ResConfig extends ResolverConfig>
{
	enabled: boolean,
	excluded_apps: number[],
	resolvers: ResConfigs
}

export interface ProviderCache<ResCaches extends Record<keyof ResCaches, ResCache>, ResCache extends ResolverCache>
{
	resolvers: ResCaches
}

export abstract class Provider<
	   Mod extends Module<Mod, Prov, ModConfig, ProvConfigs, ProvConfig, ProvResConfigs, ModCache, ProvCaches, ProvCache, ProvResCaches, Data>,
	   Prov extends Provider<Mod, Prov, Res, ModConfig, ProvConfigs, ProvConfig, ProvResConfigs, ModCache, ProvCaches, ProvCache, ProvResCaches, Data>,
	   Res extends Resolver<Mod, Prov, Res, ModConfig, ProvConfigs, ProvConfig, ProvResConfigs, ModCache, ProvCaches, ProvCache, ProvResCaches, Data>,
	   ModConfig extends ModuleConfig<ProvConfigs, ProvConfig>,
	   ProvConfigs extends Record<keyof ProvConfigs, ProvConfig>,
	   ProvConfig extends ProviderConfig<ProvResConfigs[keyof ProvResConfigs], ResolverConfig & ProvResConfigs[keyof ProvResConfigs][keyof ProvResConfigs[keyof ProvResConfigs]]>,
	   ProvResConfigs extends Record<keyof ProvResConfigs, Record<keyof ProvResConfigs[keyof ProvResConfigs], ProvResConfigs[keyof ProvResConfigs][keyof ProvResConfigs[keyof ProvResConfigs]]>>,
	   ModCache extends ModuleCache<ProvCaches, ProvCache, Data>,
	   ProvCaches extends Record<keyof ProvCaches, ProvCache>,
	   ProvCache extends ProviderCache<ProvResCaches[keyof ProvResCaches], ResolverCache & ProvResCaches[keyof ProvResCaches][keyof ProvResCaches[keyof ProvResCaches]]>,
	   ProvResCaches extends Record<keyof ProvResCaches, Record<keyof ProvResCaches[keyof ProvResCaches], ResolverCache & (ProvResCaches[keyof ProvResCaches][keyof ProvResCaches[keyof ProvResCaches]])>>,
	   Data
> implements AsyncMountable
{
	private readonly _state: MetaDeckState;
	get state(): MetaDeckState
	{
		return this._state;
	}

	private readonly _module: Mod;
	get module(): Mod
	{
		return this._module;
	}

	get config(): ProvConfig
	{
		return this.module.config.providers[this.identifier as keyof ProvConfigs];
	}

	get cache(): ProvCache
	{
		return this.module.cache.providers[this.identifier as keyof ProvCaches];
	}

	abstract identifier: string
	abstract title: string

	abstract resolvers: Res[]

	protected throttle = throttledQueue(4, 1000, true);

	constructor(module: Mod)
	{
		this._state = module.state;
		this._module = module;
	}

	protected handleError(error: Error): never
	{
		if(this.state.loadingData.currentModule)
			this.state.loadingData.currentModule.error = error
		throw error
	}

	async mount(): Promise<void>
	{
		try
		{
			if (this.enabled){
				for (const resolver of this.resolvers){
					if (resolver.enabled)
						await resolver.mount();
				}
			}
		} catch (e: any)
		{
			this.handleError(e);
		}
	}

	async dismount(): Promise<void>
	{
		try
		{
			if (this.enabled)
			{
				for (const resolver of this.resolvers)
				{
					await resolver.dismount();
				}
			}
		} catch (e: any)
		{
			this.handleError(e);
		}
	}

	get enabled(): boolean
	{
		return this.config.enabled;
	}

	set enabled(enabled: boolean)
	{
		this.config.enabled = enabled;
		void this.module.saveConfig();
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
		void this.module.saveConfig();
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
	
	async resolve(appId: number, external = false): Promise<ID | undefined>
	{
		if(!external && this.excludedApps.includes(appId))
			return undefined;

		for (const resolver of this.resolvers)
		{
			if (resolver.enabled && await resolver.test(appId))
			{
				let id = await resolver.resolve(appId);
				if(id !== undefined)
					return id;
			}
		}

		return undefined;
	}

	async apply(appId: number, data: Data): Promise<void>
	{
		if(this.excludedApps.includes(appId))
			return;

		for (const resolver of this.resolvers)
		{
			if (resolver.enabled && await resolver.test(appId))
			{
				await resolver.apply(appId, data);
				return;
			}
		}
	}

	async test(appId: number, external = false): Promise<boolean>
	{
		if(!external && this.excludedApps.includes(appId))
			return false;

		for(let resolver of this.resolvers){
			if(await resolver.test(appId))
				return true;
		}

		return false;
	}

	protected onOverridesChange(oldOverrides: IDDictionary, newOverrides: IDDictionary){
		// Retrieve changed app ids: new values, values with changed ids and removed values
		let changedIds = Object.entries(newOverrides)
			.filter(([a, i]) => oldOverrides[a as any] !== i)
			.map(([a, _]) => a as unknown as number)
			.concat(Object.keys(oldOverrides).filter(a => !newOverrides[a as any]) as unknown as number[])
			.map(a => +a);

		return this.module.onExcludedChange([], changedIds);
	}

	abstract provide(appId: number): Promise<Data | undefined>;

	icon?: ReactNode;
	settingsComponent: FC = () => undefined;
}