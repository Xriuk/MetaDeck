import { call } from "@decky/api";
import type { ID } from "../../Interfaces";
import { getLaunchCommand, isRPCS3Game, romRegex } from "../../shortcuts";
import { getAppDetails, toasterToast } from "../../util";
import type { ResolverCache, ResolverConfig } from "../Resolver";
import { GlobalResolver } from "./GlobalResolver";
import { rpcs3IdRegex, rpcs3RomPathRegex } from "./MultiId/MultiIdRPCS3Resolver";
import { t } from "../../useTranslations";
import { SiPlaystation3 } from "react-icons/si";

export interface RPCS3NPWRResolverConfig extends ResolverConfig
{
	// Like /home/deck/Emulation/storage/rpcs3/dev_hdd0/
	hdd_path: string;
}

export interface RPCS3NPWRResolverCache extends ResolverCache
{
	npwr_ids: Record<number, string | null>;
}

export interface RPCS3NPWRResolverConfigs
{
	rpcs3: RPCS3NPWRResolverConfig;
}

export interface RPCS3NPWRResolverCaches
{
	rpcs3: RPCS3NPWRResolverCache;
}

export class RPCS3NPWRResolver extends GlobalResolver<RPCS3NPWRResolver>{
	static identifier: keyof RPCS3NPWRResolverConfigs = "rpcs3";
	identifier: keyof RPCS3NPWRResolverConfigs = RPCS3NPWRResolver.identifier;

	get hddPath(): string
	{
		return (this.config as RPCS3NPWRResolverConfig).hdd_path;
	}

	set hddPath(data: string)
	{
		(this.config as RPCS3NPWRResolverConfig).hdd_path = data;
		void this.module.saveConfig();
	}

	get NPWRIds(): Record<number, string | null>
	{
		return (this.cache as RPCS3NPWRResolverCache).npwr_ids;
	}

	override async mount(): Promise<void> {
		if(!this.hddPath)
			return;

		try{
			if(!await call<[], boolean>("rpcs3_check_hdd_path"))
				throw new Error("");
		}
		catch{
			toasterToast(t("rpcs3PathError"), this);

			this.hddPath = "";
		}
	}

	override async test(appId: number): Promise<boolean> {
		if(!this.hddPath)
			return false;

		const details = await getAppDetails(appId);
		if(!details)
			return false;
		
		return isRPCS3Game(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined> {
		if(!this.hddPath)
			return undefined;

		let npwrId = this.NPWRIds[appId];
		if(npwrId !== undefined)
			return npwrId ?? undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		const launchCommand = getLaunchCommand(details);
		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		// If the game is installed it will have its id in the path
		// Then we retrieve the trophy dir, either from the game id path or from the rom folder itself
		let titleId = rom.match(new RegExp(rpcs3IdRegex))?.[1] ?? null;
		if(titleId)
			npwrId = await call<[string], string>("rpcs3_get_trophy_dir_path", this.hddPath + "game/" + titleId) ?? null;
		else{
			let romFolder = rom.match(new RegExp(rpcs3RomPathRegex))?.[1];
			if(!romFolder)
				return undefined;

			npwrId = await call<[string], string | null>("rpcs3_get_trophy_dir_path", romFolder) ?? null;
		}

		this.NPWRIds[appId] = npwrId;

		return npwrId ?? undefined;
	}
	
	override icon = <SiPlaystation3/>;
}