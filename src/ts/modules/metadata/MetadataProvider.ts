import {Provider, type ProviderIdentifier} from "../Provider";
import type { MetadataModule } from "./MetadataModule";

export abstract class MetadataProvider<Identifier extends ProviderIdentifier<MetadataModule>>
	extends Provider<MetadataModule, Identifier, "metadata">{
	
}