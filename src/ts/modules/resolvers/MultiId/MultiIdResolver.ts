import type { MultiIdDolphinResolverCache, MultiIdDolphinResolverConfig } from "./MultiIdDolphinResolver";
import type { MultiIdPCSX2ResolverCache, MultiIdPCSX2ResolverConfig } from "./MultiIdPCSX2Resolver";
import type { MultiIdRPCS3ResolverCache, MultiIdRPCS3ResolverConfig } from "./MultiIdRPCS3Resolver";
import type { MultiIdXeniaResolverCache, MultiIdXeniaResolverConfig } from "./MultiIdXeniaResolver";
import type { MultiIdCemuResolverCache, MultiIdCemuResolverConfig } from "./MultiIdCemuResolver";
import { GlobalResolver } from "../GlobalResolver";

export interface MultiIdResolverConfigs
{
	rpcs3: MultiIdRPCS3ResolverConfig;
	pcsx2: MultiIdPCSX2ResolverConfig;
	dolphin: MultiIdDolphinResolverConfig;
	cemu: MultiIdCemuResolverConfig;
	xenia: MultiIdXeniaResolverConfig;
}

export interface MultiIdResolverCaches
{
	rpcs3: MultiIdRPCS3ResolverCache;
	pcsx2: MultiIdPCSX2ResolverCache;
	dolphin: MultiIdDolphinResolverCache;
	cemu: MultiIdCemuResolverCache;
	xenia: MultiIdXeniaResolverCache;
}

// Separates multiple game ids in a string
export const separator = "$MultiId$";

// Retrieves multiple ids which match the same game to retrieve most metadata. The original id will be returned first
export abstract class MultiIdResolver extends GlobalResolver<MultiIdResolver>
{

}