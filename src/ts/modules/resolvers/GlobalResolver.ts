import type { AchievementsData, CompatdataData, MetadataData } from "../../Interfaces";
import type { CompatdataCache, CompatdataConfig, CompatdataModule, CompatdataProviderCaches, CompatdataProviderConfigs, CompatdataProviderResolverCaches, CompatdataProviderResolverConfigs } from "../compatdata/CompatdataModule";
import type { CompatdataProvider } from "../compatdata/CompatdataProvider";
import { Resolver } from "../Resolver";
import type { MetadataCache, MetadataConfig, MetadataModule, MetadataProviderCaches, MetadataProviderConfigs, MetadataProviderResolverCaches, MetadataProviderResolverConfigs } from "../metadata/MetadataModule";
import type { MetadataProvider } from "../metadata/MetadataProvider";
import type { AchievementsCache, AchievementsConfig, AchievementsModule, AchievementsProviderCaches, AchievementsProviderConfigs, AchievementsProviderResolverCaches, AchievementsProviderResolverConfigs } from "../achievements/AchievementsModule";
import type { AchievementsProvider } from "../achievements/AchievementsProvider";

export abstract class GlobalResolver<Res extends Resolver<
	MetadataModule | CompatdataModule | AchievementsModule,
	MetadataProvider<any> | CompatdataProvider<any> | AchievementsProvider<any>,
	Res,
	MetadataConfig | CompatdataConfig | AchievementsConfig,
	MetadataProviderConfigs | CompatdataProviderConfigs | AchievementsProviderConfigs,
	any,
	MetadataProviderResolverConfigs | CompatdataProviderResolverConfigs | AchievementsProviderResolverConfigs,
	MetadataCache | CompatdataCache | AchievementsCache,
	MetadataProviderCaches | CompatdataProviderCaches | AchievementsProviderCaches,
	any,
	MetadataProviderResolverCaches | CompatdataProviderResolverCaches | AchievementsProviderResolverCaches,
	MetadataData | CompatdataData | AchievementsData
>> extends Resolver<
	MetadataModule | CompatdataModule | AchievementsModule,
	MetadataProvider<any> | CompatdataProvider<any> | AchievementsProvider<any>,
	Res,
	MetadataConfig | CompatdataConfig | AchievementsConfig,
	MetadataProviderConfigs | CompatdataProviderConfigs | AchievementsProviderConfigs,
	any,
	MetadataProviderResolverConfigs | CompatdataProviderResolverConfigs | AchievementsProviderResolverConfigs,
	MetadataCache | CompatdataCache | AchievementsCache,
	MetadataProviderCaches | CompatdataProviderCaches | AchievementsProviderCaches,
	any,
	MetadataProviderResolverCaches | CompatdataProviderResolverCaches | AchievementsProviderResolverCaches,
	MetadataData | CompatdataData | AchievementsData>
{
	
}