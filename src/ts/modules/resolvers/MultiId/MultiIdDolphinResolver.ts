import {ResolverCache, ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isDolphinGame, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { MultiIdResolver, separator, type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call, fetchNoCors } from "@decky/api";
import type { ID } from "../../../Interfaces";

export interface MultiIdDolphinResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdDolphinResolverCache extends ResolverCache
{

}

export class MultiIdDolphinResolver extends MultiIdResolver
{
	identifier: keyof MultiIdResolverConfigs = "dolphin";

	private titlesCache: Record<string, string> = {}; // ID6: Title

	override async mount(): Promise<void> {
		await super.mount();

		const response = await fetchNoCors("https://www.gametdb.com/wiitdb.txt?LANG=ORIG");
		if(!response.ok)
			return;

		let entries = (await response.text()).split('\n');
		for(let entry of entries){
			let split = entry.indexOf("=");
			this.titlesCache[entry.substring(0, split).trim()] = entry.substring(split + 1).trim();
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
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		const id6 = await call<[string], string | null>("dolphin_get_id6", rom) ?? null;
		if(!id6 || id6.length !== 6)
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
}