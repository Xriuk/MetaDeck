import {Resolver, ResolverCache, ResolverConfig} from "../Resolver";
import {getLaunchCommand, isXeniaGame, romRegex} from "../../shortcuts";
import {getAppDetails} from "../../util";
import { call } from "@decky/api";
import type { ID } from "../../Interfaces";
import { FaXbox } from "react-icons/fa";

export interface XeniaResolverConfig extends ResolverConfig{
	
}

export interface XeniaResolverCache extends ResolverCache{
	title_ids: Record<number, string | null>;
}


export class XeniaResolver extends Resolver<"xenia">{
	identifier = "xenia" as const;

	get titleIds(): Record<number, string | null>{
		return this.cache.title_ids;
	}

	async test(appId: number): Promise<boolean>{
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

		const rom = launchCommand.match(romRegex)?.[0];
		if(!rom)
			return undefined;

		titleId = await call<[string], string | null>("xenia_get_titleid", rom) ?? null;

		this.titleIds[appId] = titleId;

		return titleId ?? undefined;
	}

	override icon = <FaXbox/>;
}