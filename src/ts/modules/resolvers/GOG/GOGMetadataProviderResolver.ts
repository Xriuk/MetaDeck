import { ModuleResolver } from "../../Resolver";
import type { MetadataModule } from "../../metadata/MetadataModule";

// Separates plaform (gog, epic, origin, ...) from the actual game id in a string
export const separator = "$GOG$";

export abstract class GOGMetadataProviderResolver<Identifier extends "gog_nsl" | "gog_junk" | "gog_heroic">
	extends ModuleResolver<Identifier, MetadataModule>{
	
}