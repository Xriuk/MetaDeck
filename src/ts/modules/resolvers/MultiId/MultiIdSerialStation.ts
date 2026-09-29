import {ID} from "../../../Interfaces";
import type { ResolverCache } from "../../Resolver";
import { MultiIdResolver, separator } from "./MultiIdResolver";
import { fetchNoCors } from "@decky/api";

export interface MultiIdSerialStationResolverCache extends ResolverCache
{
	title_ids: Record<number, string | null>;
}

// Retrieves multiple title id for a single PlayStation game
export abstract class MultiIdSerialStationResolver extends MultiIdResolver
{
	get titleIds(): Record<number, string | null>{
		return (this.cache as MultiIdSerialStationResolverCache).title_ids;
	}

	protected abstract retrieveTitleId(appId: number): Promise<string | undefined>;

	async resolve(appId: number): Promise<ID | undefined>
	{
		let titleId: string | null | undefined = this.titleIds[appId];
		if(titleId !== undefined)
			return titleId ?? undefined;

		titleId = await this.retrieveTitleId(appId);
		if(!titleId){
			this.titleIds[appId] = null;
			return undefined;
		}

		// Retrieve the game id on SerialStation, if we fail we return the single id
		let response = await fetchNoCors("https://api.serialstation.com/v1/title-ids/" + titleId);
		if(!response.ok){
			this.titleIds[appId] = titleId;
			return titleId;
		}
		let titleIdInfo: {
			games?: {
				id?: string;
			}[];
		} = await response.json();
		if(!titleIdInfo?.games?.length){
			this.titleIds[appId] = titleId;
			return titleId;
		}

		// Retrieve all the title ids for all the games
		let titleIds = new Set<string>(titleId);
		for(let game of titleIdInfo.games){
			if(!game.id)
				continue;

			response = await fetchNoCors("https://api.serialstation.com/v1/games/" + game.id);
			if(!response.ok)
				continue;
			let gameIdInfo: {
				title_ids?: string[];
			} = await response.json();
			if(!gameIdInfo.title_ids?.length)
				continue;

			for(let gameTitleId of gameIdInfo.title_ids){
				titleIds.add(gameTitleId);
			}
		}

		this.titleIds[appId] = [...titleIds].join(separator);

		return this.titleIds[appId];
	}
}