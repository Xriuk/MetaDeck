import {Provider, type ProviderIdentifier} from "../Provider";
import type { AchievementsModule } from "./AchievementsModule";

export abstract class AchievementsProvider<Identifier extends ProviderIdentifier<AchievementsModule>>
	extends Provider<AchievementsModule, Identifier, "achievements">{
	
}