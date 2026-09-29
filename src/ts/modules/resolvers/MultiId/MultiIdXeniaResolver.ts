import {ResolverCache, ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isXeniaGame, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { MultiIdResolver, type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call } from "@decky/api";
import type { ID } from "../../../Interfaces";

export interface MultiIdXeniaResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdXeniaResolverCache extends ResolverCache
{
	title_ids: Record<number, string | null>;
}

// Xbox 360 title id is unique across regions, so we don't need to check multiple entries
export class MultiIdXeniaResolver extends MultiIdResolver
{
	identifier: keyof MultiIdResolverConfigs = "xenia";

	get titleIds(): Record<number, string | null>{
		return (this.cache as MultiIdXeniaResolverCache).title_ids;
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isXeniaGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		let titleId: string | null | undefined = this.titleIds[appId];
		if(titleId !== undefined)
			return titleId ?? undefined;

		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		titleId = await call<[string], string | null>("xenia_get_titleid", rom) ?? null;

		this.titleIds[appId] = titleId;

		return titleId ?? undefined;
	}
}