import {Module} from "./Module";
import {AsyncMountable} from "../System";
import {MetaDeckState} from "../MetaDeckState";
import {ID} from "../Interfaces";
import type { ReactNode } from "react";
import type { MultiIdRPCS3ResolverConfig, MultiIdRPCS3ResolverCache } from "./resolvers/MultiId/MultiIdRPCS3Resolver";
import type { RetroAchievementsResolverConfig, RetroAchievementsResolverCache } from "./resolvers/RetroAchievementsResolver";
import type { RPCS3NPWRResolverConfig, RPCS3NPWRResolverCache } from "./resolvers/RPCS3NPWRResolver";
import type { RyujinxSerialResolverConfig, RyujinxSerialResolverCache } from "./resolvers/RyujinxSerialResolver";
import type { RyujinxTitleIdResolverConfig, RyujinxTitleIdResolverCache } from "./resolvers/RyujinxTitleIdResolver";
import type { XeniaResolverConfig, XeniaResolverCache } from "./resolvers/XeniaResolver";
import type { MultiIdCemuResolverConfig, MultiIdCemuResolverCache } from "./resolvers/MultiId/MultiIdCemuResolver";
import type { MultiIdDolphinResolverConfig, MultiIdDolphinResolverCache } from "./resolvers/MultiId/MultiIdDolphinResolver";
import type { MultiIdPCSX2ResolverConfig, MultiIdPCSX2ResolverCache } from "./resolvers/MultiId/MultiIdPCSX2Resolver";
import type { GOGMetadataProviderNSLResolverCache, GOGMetadataProviderNSLResolverConfig } from "./metadata/resolvers/GOG/GOGMetadataProviderNSLResolver";
import type { GOGMetadataProviderJunkStoreResolverCache, GOGMetadataProviderJunkStoreResolverConfig } from "./metadata/resolvers/GOG/GOGMetadataProviderJunkStoreResolver";
import type { GOGMetadataProviderHeroicResolverConfig, GOGMetadataProviderHeroicResolverCache } from "./metadata/resolvers/GOG/GOGMetadataProviderHeroicResolver";
import type { Provider } from "./Provider";

export interface ResolverConfig{
	
}

export interface ResolverCache{

}

export interface ResolverConfigs{
	ra: RetroAchievementsResolverConfig;

	pcsx2: MultiIdPCSX2ResolverConfig;
	rpcs3: MultiIdRPCS3ResolverConfig;
	rpcs3_npwr: RPCS3NPWRResolverConfig;

	xenia: XeniaResolverConfig;

	dolphin: MultiIdDolphinResolverConfig;
	cemu: MultiIdCemuResolverConfig;
	ryujinx_titleid: RyujinxTitleIdResolverConfig;
	ryujinx_serial: RyujinxSerialResolverConfig;

	gog_nsl: GOGMetadataProviderNSLResolverConfig;
	gog_junk: GOGMetadataProviderJunkStoreResolverConfig;
	gog_heroic: GOGMetadataProviderHeroicResolverConfig;
}

export interface ResolverCaches{
	ra: RetroAchievementsResolverCache;

	pcsx2: MultiIdPCSX2ResolverCache;
	rpcs3: MultiIdRPCS3ResolverCache;
	rpcs3_npwr: RPCS3NPWRResolverCache;

	xenia: XeniaResolverCache;

	dolphin: MultiIdDolphinResolverCache;
	cemu: MultiIdCemuResolverCache;
	ryujinx_titleid: RyujinxTitleIdResolverCache;
	ryujinx_serial: RyujinxSerialResolverCache;

	gog_nsl: GOGMetadataProviderNSLResolverCache;
	gog_junk: GOGMetadataProviderJunkStoreResolverCache;
	gog_heroic: GOGMetadataProviderHeroicResolverCache;
}

export type ResolverIdentifier = keyof ResolverConfigs & keyof ResolverCaches;

export abstract class Resolver<Identifier extends ResolverIdentifier> implements AsyncMountable
{
	private readonly _state: MetaDeckState;
	get state(): MetaDeckState
	{
		return this._state;
	}


	abstract identifier: Identifier;

	get config(){
		return this.state.settings.config.resolvers[this.identifier];
	}

	get cache(){
		return this.state.settings.cache.resolvers[this.identifier];
	}

	constructor(state: MetaDeckState){
		state.mounts.addMount(this);
		this._state = state;
	}

	mount(): Promise<void>{
		return Promise.resolve();
	}

	dismount(): Promise<void>
	{
		return Promise.resolve();
	}

	isEnabled(provider: Provider<any, any>): boolean{
		return provider.config.resolvers[this.identifier].enabled;
	}
	setEnabled(provider: Provider<any, any>, enabled: boolean){
		provider.config.resolvers[this.identifier].enabled = enabled;
	}

	saveConfig(): Promise<void>
	{
		return this.state.settings.writeConfig();
	}

	saveCache(): Promise<void>
	{
		return this.state.settings.writeCache();
	}

	abstract test(appId: number): Promise<boolean>;

	abstract resolve(appId: number): Promise<ID | undefined>;

	icon?: ReactNode;
}

export abstract class ModuleResolver<
	Identifier extends ResolverIdentifier,
	Mod extends Module<any, any, any>>
		extends Resolver<Identifier>{

	apply(_appId: number, _data: Mod['data'][number]): Promise<void> {
		return Promise.resolve();
	}
}