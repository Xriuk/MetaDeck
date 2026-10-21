import { call } from "@decky/api";
import type { ID } from "../../../Interfaces";
import { getLaunchCommand, isRPCS3Game, romRegex } from "../../../shortcuts";
import { getAppDetails, toasterToast } from "../../../util";
import { type ResolverCache, type ResolverConfig } from "../../Resolver";
import { rpcs3IdRegex, rpcs3RomPathRegex } from "./MultiIdRPCS3Resolver";
import { t } from "../../../useTranslations";
import { SiPlaystation3 } from "react-icons/si";
import { MultiIdResolver, separator } from "./MultiIdResolver";

export interface MultiIdRPCS3NPWRResolverConfig extends ResolverConfig{
	// Like /home/deck/Emulation/storage/rpcs3/dev_hdd0/
	hdd_path: string;
}

export interface MultiIdRPCS3NPWRResolverCache extends ResolverCache{
	npwr_ids: Record<number, string | null>;
}

// A game can have multiple trophy sets
export class MultiIdRPCS3NPWRResolver extends MultiIdResolver<"rpcs3_npwr">{
	identifier = "rpcs3_npwr" as const;

	get hddPath(): string{
		return this.config.hdd_path;
	}

	set hddPath(data: string){
		this.config.hdd_path = data;
		void this.saveConfig();
	}

	get NPWRIds(): Record<number, string | null>{
		return this.cache.npwr_ids;
	}

	override async mount(): Promise<void> {
		if(!this.hddPath)
			return;

		try{
			if(!await call<[string], boolean>("rpcs3_check_hdd_path", this.hddPath))
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

		let npwrIds = this.NPWRIds[appId];
		if(npwrIds !== undefined)
			return npwrIds ?? undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		const launchCommand = getLaunchCommand(details);
		const rom = launchCommand.match(romRegex)?.[0];
		if(!rom)
			return undefined;

		// If the game is installed it will have its id in the path
		// Then we retrieve the trophy dir, either from the game id path or from the rom folder itself
		let titleId = rom.match(new RegExp(rpcs3IdRegex))?.[1] ?? null;
		let ids: string[];
		if(titleId)
			ids = await call<[string], string[]>("rpcs3_get_trophy_dir_paths", this.hddPath + "game/" + titleId) ?? null;
		else{
			let romFolder = rom.match(new RegExp(rpcs3RomPathRegex))?.[1];
			if(!romFolder)
				return undefined;

			ids = await call<[string], string[]>("rpcs3_get_trophy_dir_paths", romFolder) ?? null;
		}

		npwrIds = ids.length ? ids.join(separator) : null;
		this.NPWRIds[appId] = npwrIds;

		return npwrIds ?? undefined;
	}
	
	override icon = <SiPlaystation3/>;
}