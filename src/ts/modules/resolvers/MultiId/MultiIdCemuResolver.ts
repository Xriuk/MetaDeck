import {ResolverCache, ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isCemuGame, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { MultiIdResolver, separator, type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call, fetchNoCors } from "@decky/api";
import type { ID } from "../../../Interfaces";

export interface MultiIdCemuResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdCemuResolverCache extends ResolverCache
{
	// Last 4 chars of serial
	game_codes: Record<number, string | null>;
}

export class MultiIdCemuResolver extends MultiIdResolver
{
	identifier: keyof MultiIdResolverConfigs = "cemu";

	private titlesCache: Record<string, string> = {}; // ID6: Title

	get gameCodes(): Record<number, string | null>{
		return (this.cache as MultiIdCemuResolverCache).game_codes;
	}

	override async mount(): Promise<void> {
		const response = await fetchNoCors("https://www.gametdb.com/wiiutdb.txt?LANG=ORIG");
		if(!response.ok)
			return;

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
		return isCemuGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		let code: string | null = this.gameCodes[appId];
		if(code === undefined){
			const details = await getAppDetails(appId);
			if (!details){
				this.gameCodes[appId] = null;
				return undefined;
			}
			
			const launchCommand = getLaunchCommand(details);
			const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
			if(!rom){
				this.gameCodes[appId] = null;
				return undefined;
			}

			// Returned serial is like "WUP-P-AMKE", we only need the last segment
			const gameSerial = (await call<[string], string | null>("cemu_get_gameserial", rom))?.split('-') ?? null;
			if(!gameSerial?.length || gameSerial[gameSerial.length-1].length !== 4){
				this.gameCodes[appId] = null;
				return undefined;
			}

			// We only have the code and no publisher
			code = gameSerial[gameSerial.length-1].substring(0, 4);
			this.gameCodes[appId] = code;
		}
		if(!code)
			return undefined;

		// Retrieve all the ids by changing region
		let regionIds = Object.keys(this.titlesCache)
			.filter(i => i.startsWith(code));
			
		let publisher = regionIds[0].substring(4);

		// Retrieve other ids by matching retrieved titles and publisher
		let titleTitles = Object.entries(this.titlesCache)
			.filter(t => t[0].endsWith(publisher) && regionIds.some(r => this.titlesCache[r] === t[1]))
			.map(t => t[0]);

		return [
			...new Set<string>([
				...regionIds,
				...titleTitles
			])
		].join(separator);
	}
}