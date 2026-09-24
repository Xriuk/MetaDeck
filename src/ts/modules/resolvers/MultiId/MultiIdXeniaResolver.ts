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

}

// Xbox 360 title id is unique across regions, so we don't need to check multiple entries
export class MultiIdXeniaResolver extends MultiIdResolver
{
	identifier: keyof MultiIdResolverConfigs = "xenia";

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isXeniaGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		return await call<[string], string | null>("xenia_get_titleid", rom) ?? undefined;
	}
}