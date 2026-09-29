import {Provider} from "../Provider";
import {AchievementsData} from "../../Interfaces";
import {
	AchievementsCache,
	AchievementsConfig,
	AchievementsModule, AchievementsProviderCaches, AchievementsProviderCacheTypes,
	AchievementsProviderConfigs,
	AchievementsProviderConfigTypes, AchievementsProviderResolverCaches, AchievementsProviderResolverConfigs
} from "./AchievementsModule";
import type { AchievementsProviderResolver } from "./AchievementsProviderResolver";

// DEV: maybe fetch separately achievements details and progress? Add method?

export abstract class AchievementsProvider<Res extends AchievementsProviderResolver<Res>> extends Provider<
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
>
{
}