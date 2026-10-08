import {ResolverCache, ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isDolphinGame, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { MultiIdResolver, separator, type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call, fetchNoCors, toaster } from "@decky/api";
import type { ID } from "../../../Interfaces";
import { t } from "../../../useTranslations";
import { SiDolphin } from "react-icons/si";

export interface MultiIdDolphinResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdDolphinResolverCache extends ResolverCache
{
	game_id6s: Record<number, string | null>;
}

export class MultiIdDolphinResolver extends MultiIdResolver
{
	identifier: keyof MultiIdResolverConfigs = "dolphin";

	private titlesCache: Record<string, string> = {}; // ID6: Title

	get gameId6s(): Record<number, string | null>{
		return (this.cache as MultiIdDolphinResolverCache).game_id6s;
	}

	override async mount(): Promise<void> {
		const response = await fetchNoCors("https://www.gametdb.com/wiitdb.txt?LANG=ORIG");
		if(!response.ok){
			toaster.toast({
				title: `${this.module.title} - ${this.provider.title} (${this.identifier})`,
				body: t("initError")
			});

			return;
		}

		let entries = (await response.text()).split('\n');
		for(let entry of entries){
			let split = entry.indexOf("=");

			// GameTDB also contains WiiWare titles which might not have ID6 but ID4
			let id6 = entry.substring(0, split).trim();
			if(!id6 || id6.length !== 6)
				continue;

			this.titlesCache[id6] = entry.substring(split + 1).trim();
		}
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isDolphinGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		let id6: string | null = this.gameId6s[appId];
		if(id6 === undefined){
			const details = await getAppDetails(appId);
			if (!details){
				this.gameId6s[appId] = null;
				return undefined;
			}

			const launchCommand = getLaunchCommand(details);
			const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
			if(!rom){
				this.gameId6s[appId] = null;
				return undefined;
			}

			id6 = await call<[string], string | null>("dolphin_get_id6", rom) ?? null;
			if(!id6 || id6.length !== 6){
				this.gameId6s[appId] = null;
				return undefined;
			}
			this.gameId6s[appId] = id6;
		}
		if(!id6)
			return undefined;

		let code = id6.substring(0, 4);
		let publisher = id6.substring(4);

		// Retrieve other ids by changing region
		let regionIds = Object.keys(this.titlesCache)
			.filter(i => i.startsWith(code) && i.endsWith(publisher));

		// Retrieve other ids by matching retrieved titles and publisher
		let titleTitles = Object.entries(this.titlesCache)
			.filter(t => t[0].endsWith(publisher) && regionIds.some(r => this.titlesCache[r] === t[1]))
			.map(t => t[0]);

		return [
			...new Set<string>([
				id6,
				...regionIds,
				...titleTitles
			])
		].join(separator);
	}

	override icon = <SiDolphin/>;
}