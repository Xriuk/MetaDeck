import {ResolverCache, ResolverConfig} from "../Resolver";
import {getLaunchCommand, isRyujinxGame, romRegex} from "../../shortcuts";
import {getAppDetails, toasterToast} from "../../util";
import { call } from "@decky/api";
import type { ID } from "../../Interfaces";
import { GlobalResolver } from "./GlobalResolver";
import { t } from "../../useTranslations";
import { BsNintendoSwitch } from "react-icons/bs";

export interface RyujinxTitleIdResolverConfig extends ResolverConfig
{
	
}

export interface RyujinxTitleIdResolverCache extends ResolverCache
{
	title_ids: Record<number, string | null>;
	ryujinx_prod_keys: boolean | undefined;
}

export interface RyujinxTitleIdResolverConfigs
{
	ryujinx: RyujinxTitleIdResolverConfig;
}

export interface RyujinxTitleIdResolverCaches
{
	ryujinx: RyujinxTitleIdResolverCache;
}

// Returns actual title ids (eg: 01007EF00011E000)
export class RyujinxTitleIdResolver extends GlobalResolver<RyujinxTitleIdResolver>
{
	identifier: keyof RyujinxTitleIdResolverConfigs = "ryujinx";

	get titleIds(): Record<number, string | null>{
		return (this.cache as RyujinxTitleIdResolverCache).title_ids;
	}

	get ryujinxProdKeys(): boolean | undefined{
		return (this.cache as RyujinxTitleIdResolverCache).ryujinx_prod_keys;
	}

	set ryujinxProdKeys(value: boolean | undefined){
		(this.cache as RyujinxTitleIdResolverCache).ryujinx_prod_keys = value;
		void this.module.saveCache();
	}

	override async mount(): Promise<void> {
		await this.checkRyujinxProdKeys();
		
		if(!this.ryujinxProdKeys){
			toasterToast(t("ryujinxKeysError"), this);
		}
	}

	override dismount(): Promise<void> {
		this.ryujinxProdKeys = undefined;

		return Promise.resolve();
	}

	async test(appId: number): Promise<boolean>{
		if(this.ryujinxProdKeys === undefined)
			await this.checkRyujinxProdKeys();
		if(!this.ryujinxProdKeys)
			return false;

		const details = await getAppDetails(appId);
		if (!details)
			return false;
		
		return isRyujinxGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		if(this.ryujinxProdKeys === undefined)
			await this.checkRyujinxProdKeys();
		if(!this.ryujinxProdKeys)
			return undefined;

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

		titleId = await call<[string], string | null>("ryujinx_get_titleid", rom) ?? null;

		this.titleIds[appId] = titleId;

		return titleId ?? undefined;
	}

	public async checkRyujinxProdKeys(){
		try{
			if(!await call<[], boolean>('ryujinx_check_prod_keys'))
				throw new Error("");

			this.ryujinxProdKeys = true;
		}
		catch{
			this.ryujinxProdKeys = false;
		}
	}

	override icon = <BsNintendoSwitch/>;
}