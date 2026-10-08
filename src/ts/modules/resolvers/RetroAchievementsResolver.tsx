import { call, fetchNoCors, toaster } from "@decky/api";
import type { ID } from "../../Interfaces";
import {
	getLaunchCommand, isCemuGame, isEmulatedGame, isRPCS3Game, isShadPS4Game, isRyujinxGame,
	isVita3KGame, isXemuGame, isXeniaGame, romRegex
} from "../../shortcuts";
import { t } from "../../useTranslations";
import { getAppDetails } from "../../util";
import type { ResolverCache, ResolverConfig } from "../Resolver";
import { GlobalResolver } from "./GlobalResolver";
import { version } from "@decky/pkg";
import { FaGamepad } from "react-icons/fa";

export interface RetroAchievementsResolverConfig extends ResolverConfig
{
	
}

export interface RetroAchievementsResolverCache extends ResolverCache
{
	hashes: Record<number, string>;
}

export interface RetroAchievementsResolverConfigs
{
	ra: RetroAchievementsResolverConfig;
}

export interface RetroAchievementsResolverCaches
{
	ra: RetroAchievementsResolverCache;
}

export class RetroAchievementsResolver extends GlobalResolver<RetroAchievementsResolver>
{
	static identifier: keyof RetroAchievementsResolverConfigs = "ra";
	static title: string = t("providerAchievementsRA");
	identifier: keyof RetroAchievementsResolverConfigs = RetroAchievementsResolver.identifier;
	title: string = RetroAchievementsResolver.title;

	private hashRAIds: Record<string, number> = {};

	get hashes(): Record<number, string | null>
	{
		return (this.cache as RetroAchievementsResolverCache).hashes;
	}

	override async mount(): Promise<void> {
		// DEV: check if works, if not replace with new authenticated API
		const response = await fetchNoCors("https://retroachievements.org/dorequest.php?r=hashlibrary", {
			headers: {
				"User-Agent": `MetaDeck/${version} (+https://github.com/Xriuk/MetaDeck)`,
			}
		});
		if(!response.ok){
			toaster.toast({
				title: `${this.module.title} - ${this.provider.title} (${this.identifier})`,
				body: t("initError")
			});
		}

		const body = await response.text();
		this.hashRAIds = (JSON.parse(body.toLowerCase()) as { md5list: Record<string, number>; }).md5list;
	}

	override async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		
		const launchCommand = getLaunchCommand(details);
		return isEmulatedGame(launchCommand) &&
			!isRPCS3Game(launchCommand) && !isShadPS4Game(launchCommand) && !isVita3KGame(launchCommand) &&
			!isXemuGame(launchCommand) && !isXeniaGame(launchCommand) &&
			!isCemuGame(launchCommand) && !isRyujinxGame(launchCommand);
	}

	async resolve(appId: number): Promise<ID | undefined>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;

		let md5 = this.hashes[appId];
		if(!md5){
			const launchCommand = getLaunchCommand(details);
			const rom = launchCommand?.match(new RegExp(romRegex, "i"))?.[0];
			if(!rom)
				return undefined;
			md5 = await call<[string], string>("hash", rom);
			if(md5)
				this.hashes[appId] = md5;
		}
		this.module.logger.debug(`${appId} md5: `, md5);
		if(!md5)
			return undefined;

		return this.hashRAIds[md5];
	}

	override icon = <FaGamepad/>;
}