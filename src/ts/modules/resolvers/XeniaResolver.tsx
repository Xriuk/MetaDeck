import {ResolverCache, ResolverConfig} from "../Resolver";
import {getLaunchCommand, isXeniaGame, romRegex} from "../../shortcuts";
import {getAppDetails} from "../../util";
import { call } from "@decky/api";
import type { ID } from "../../Interfaces";
import { GlobalResolver } from "./GlobalResolver";
import { FaXbox } from "react-icons/fa";

export interface XeniaResolverConfig extends ResolverConfig
{
	
}

export interface XeniaResolverCache extends ResolverCache
{
	title_ids: Record<number, string | null>;
}

export interface XeniaResolverConfigs
{
	xenia: XeniaResolverConfig;
}

export interface XeniaResolverCaches
{
	xenia: XeniaResolverCache;
}

export class XeniaResolver extends GlobalResolver<XeniaResolver>
{
	identifier: keyof XeniaResolverConfigs = "xenia";

	get titleIds(): Record<number, string | null>{
		return (this.cache as XeniaResolverCache).title_ids;
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

	override icon = <FaXbox/>;
}