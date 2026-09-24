import {ResolverCache, ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isPCSX2Game, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call } from "@decky/api";
import { MultiIdSerialStationResolver } from "./MultiIdSerialStation";

export interface MultiIdPCSX2ResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdPCSX2ResolverCache extends ResolverCache
{

}

export class MultiIdPCSX2Resolver extends MultiIdSerialStationResolver
{
	identifier: keyof MultiIdResolverConfigs = "pcsx2";

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isPCSX2Game(getLaunchCommand(details));
	}

	protected async retrieveTitleId(appId: number): Promise<string | undefined> {
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		return await call<[string], string | null>("pcsx2_get_titleid", rom) ?? undefined;
	}
}