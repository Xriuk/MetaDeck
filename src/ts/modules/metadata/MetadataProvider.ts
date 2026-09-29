import {Provider} from "../Provider";
import {MetadataData} from "../../Interfaces";
import {
	MetadataCache,
	MetadataConfig,
	MetadataModule,
	MetadataProviderCaches, MetadataProviderCacheTypes,
	MetadataProviderConfigs,
	MetadataProviderConfigTypes, MetadataProviderResolverCaches, MetadataProviderResolverConfigs
} from "./MetadataModule";
import type { MetadataProviderResolver } from "./MetadataProviderResolver";

export abstract class MetadataProvider<Res extends MetadataProviderResolver<Res>> extends Provider<
	   MetadataModule,
	   MetadataProvider<Res>,
	   Res,
	   MetadataConfig,
	   MetadataProviderConfigs,
	   MetadataProviderConfigTypes,
	   MetadataProviderResolverConfigs,
	   MetadataCache,
	   MetadataProviderCaches,
	   MetadataProviderCacheTypes,
	   MetadataProviderResolverCaches,
	   MetadataData
>
{
}