import {ResolverCache, ResolverConfig} from "../Resolver";
import {getLaunchCommand, isSwitchGame, romRegex} from "../../shortcuts";
import {getAppDetails} from "../../util";
import { call } from "@decky/api";
import type { ID } from "../../Interfaces";
import { GlobalResolver } from "./GlobalResolver";

export interface SwitchTitleIdResolverConfig extends ResolverConfig
{
	
}

export interface SwitchTitleIdResolverCache extends ResolverCache
{
	title_ids: Record<number, string | null>;
}

export interface SwitchTitleIdResolverConfigs
{
	switch: SwitchTitleIdResolverConfig;
}

export interface SwitchTitleIdResolverCaches
{
	switch: SwitchTitleIdResolverCache;
}

// Returns actual title ids (eg: 01007EF00011E000)
export class SwitchTitleIdResolver extends GlobalResolver<SwitchTitleIdResolver>
{
	identifier: keyof SwitchTitleIdResolverConfigs = "switch";

	get titleIds(): Record<number, string | null>{
		return (this.cache as SwitchTitleIdResolverCache).title_ids;
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isSwitchGame(getLaunchCommand(details));
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

		titleId = await call<[string], string | null>("switch_get_titleid", rom) ?? null;

		this.titleIds[appId] = titleId;

		return titleId ?? undefined;
	}
}