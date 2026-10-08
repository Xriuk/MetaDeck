import { fetchNoCors, toaster } from "@decky/api";
import type { ID } from "../../Interfaces";
import { RyujinxTitleIdResolver, type RyujinxTitleIdResolverCache, type RyujinxTitleIdResolverConfig } from "./RyujinxTitleIdResolver";
import Logger from "../../logger";
import { t } from "../../useTranslations";

export interface RyujinxSerialResolverConfig extends RyujinxTitleIdResolverConfig
{
	
}

export interface RyujinxSerialResolverCache extends RyujinxTitleIdResolverCache
{
	
}

export interface RyujinxSerialResolverConfigs
{
	ryujinx: RyujinxSerialResolverConfig;
}

export interface RyujinxSerialResolverCaches
{
	ryujinx: RyujinxSerialResolverCache;
}

// Returns serial (eg: AAAAA)
export class RyujinxSerialResolver extends RyujinxTitleIdResolver
{
	static identifier: keyof RyujinxSerialResolverConfigs = "ryujinx";
	identifier: keyof RyujinxSerialResolverConfigs = RyujinxSerialResolver.identifier;

	protected logger = new Logger(RyujinxSerialResolver.identifier);

	private serialTitleIdsCache: {
		serial: string;
		titleid: string; // Wild format, including multiple ids so we only search for strings containing the id - the first 4 chars which are always the same (0100)
	}[] = [];

	override async mount(): Promise<void> {
		await super.mount();

		// Retrieve the XML DB from NSW
		// DEV: maybe retrieve and store on the backend?
		const response = await fetchNoCors("http://nswdb.com/xml.php");
		if(!response.ok){
			toaster.toast({
				title: `${this.module.title} - ${this.provider.title} (${this.identifier})`,
				body: t("initError")
			});

			return;
		}

		// Parse and cache the db
		const parser = new DOMParser();
		const doc = parser.parseFromString(await response.text(), "application/xml");
		this.logger.debug("Retrieved db", doc);
		
		for(let rootNode of doc.children){
			if(rootNode.nodeName !== 'releases')
				continue;

			for(let node of rootNode.children){
				if(node.nodeName !== 'release')
					continue;

				let serial: string | undefined | null;
				let titleid: string | undefined | null;
				for(let childNode of node.children){
					if(childNode.nodeName === 'serial'){
						serial = childNode.firstChild?.nodeValue;
					}
					else if(childNode.nodeName === 'titleid'){
						titleid = childNode.firstChild?.nodeValue;
					}
				}
				// If serial contains '?' it's unknown
				if(!serial || !titleid || serial.includes('?'))
					continue;

				// LA-N-AQXVA -> AQXVA
				let splitSerial = serial.split('-');
				this.serialTitleIdsCache.push({
					serial: splitSerial[splitSerial.length-1],
					titleid: titleid.toUpperCase()
				});
			}
		}

		this.logger.debug("Cached serials / title ids", this.serialTitleIdsCache);
	}

	override async resolve(appId: number): Promise<ID | undefined> {
		// Resolve title id first
		let titleId = (await super.resolve(appId))?.toString().substring(4);
		if(!titleId)
			return undefined;

		// Retrieve a matching serial
		return this.serialTitleIdsCache.find(e => e.titleid.includes(titleId))?.serial;
	}
}