import type { AchievementsData } from "../../Interfaces";
import { Resolver } from "../Resolver";
import type { AchievementsModule, AchievementsConfig, AchievementsProviderConfigs, AchievementsProviderConfigTypes, AchievementsProviderResolverConfigs, AchievementsCache, AchievementsProviderCaches, AchievementsProviderCacheTypes, AchievementsProviderResolverCaches } from "./AchievementsModule";
import type { AchievementsProvider } from "./AchievementsProvider";

export abstract class AchievementsProviderResolver<Res extends Resolver<
	   AchievementsModule,
	   AchievementsProvider<Res>,
	   Res,
	   AchievementsConfig,
	   AchievementsProviderConfigs,
	   AchievementsProviderConfigTypes,
	   AchievementsProviderResolverConfigs,
	   AchievementsCache,
	   AchievementsProviderCaches,
	   AchievementsProviderCacheTypes,
	   AchievementsProviderResolverCaches,
	   AchievementsData
>> extends Resolver<
	   AchievementsModule,
	   AchievementsProvider<Res>,
	   Res,
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
	
}