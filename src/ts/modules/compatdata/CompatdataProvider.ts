import {Provider, type ProviderIdentifier} from "../Provider";
import type { CompatdataModule } from "./CompatdataModule";

export abstract class CompatdataProvider<Identifier extends ProviderIdentifier<CompatdataModule>>
	extends Provider<CompatdataModule, Identifier, "compatdata">{
	
}