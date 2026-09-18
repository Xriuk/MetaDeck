import {MetadataProviderResolver} from "../../MetadataProviderResolver";

// Separates plaform (gog, epic, origin, ...) from the actual game id in a string
export const separator = "$GOG$";

export abstract class GOGMetadataProviderResolver extends MetadataProviderResolver<GOGMetadataProviderResolver>
{
}