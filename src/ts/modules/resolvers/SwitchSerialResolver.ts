import { fetchNoCors } from "@decky/api";
import type { ID } from "../../Interfaces";
import { SwitchTitleIdResolver, type SwitchTitleIdResolverCache, type SwitchTitleIdResolverConfig } from "./SwitchTitleIdResolver";

export interface SwitchSerialResolverConfig extends SwitchTitleIdResolverConfig
{
	
}

export interface SwitchSerialResolverCache extends SwitchTitleIdResolverCache
{
	
}

export interface SwitchSerialResolverConfigs
{
	switch: SwitchSerialResolverConfig;
}

export interface SwitchSerialResolverCaches
{
	switch: SwitchSerialResolverCache;
}

// Returns serial (eg: AAAAA)
export class SwitchSerialResolver extends SwitchTitleIdResolver
{
	identifier: keyof SwitchSerialResolverConfigs = "switch";

	private serialTitleIdsCache: {
		serial: string;
		titleid: string; // Wild format, including multiple ids so we only search for strings containing the id - the first 4 chars which are always the same (0100)
	}[] = [];

	override async mount(): Promise<void> {
		// Retrieve the XML DB from NSW
		// DEV: maybe retrieve and store on the backend?
		const response = await fetchNoCors("http://nswdb.com/xml.php");
		if(!response.ok)
			return;

		// Parse and cache the db
		const parser = new DOMParser();
		const doc = parser.parseFromString(await response.text(), "application/xml");
		for(let node of doc.children.namedItem('releases')?.children ?? []){
			if(node.nodeName !== 'release')
				continue;

			let serial = node.children.namedItem("serial")?.nodeValue; // If contains '?' it's unknown
			let titleid = node.children.namedItem("titleid")?.nodeValue;
			if(!serial || !titleid || serial.indexOf('?') !== -1)
				continue;

			// LA-N-AQXVA -> AQXVA
			let splitSerial = serial.split('-');
			this.serialTitleIdsCache.push({
				serial: splitSerial[splitSerial.length-1],
				titleid: titleid.toUpperCase()
			});
		}
	}

	override async resolve(appId: number): Promise<ID | undefined> {
		// Resolve title id first
		let titleId = (await super.resolve(appId))?.toString().substring(4);
		if(!titleId)
			return undefined;

		// Retrieve a matching serial
		return this.serialTitleIdsCache.find(e => e.titleid.indexOf(titleId))?.serial;
	}
}