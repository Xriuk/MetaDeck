import { Resolver, type ResolverIdentifier } from "../../Resolver";

// Separates multiple game ids in a string
export const separator = "$MultiId$";

// Retrieves multiple ids which match the same game to retrieve most metadata. The original id will be returned first
export abstract class MultiIdResolver<Identifier extends ResolverIdentifier>
	extends Resolver<Identifier>{

}