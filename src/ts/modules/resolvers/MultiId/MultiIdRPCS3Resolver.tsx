import {ResolverConfig} from "../../Resolver";
import {getLaunchCommand, isRPCS3Game, romRegex} from "../../../shortcuts";
import {getAppDetails} from "../../../util";
import { type MultiIdResolverConfigs } from "./MultiIdResolver";
import { call } from "@decky/api";
import { MultiIdSerialStationResolver, type MultiIdSerialStationResolverCache } from "./MultiIdSerialStation";
import { SiPlaystation3 } from "react-icons/si";

export const rpcs3IdRegex = '\\/dev_hdd0\\/game\\/([A-Z0-9]+)\\/';
export const rpcs3RomPathRegex = '(\\/home\\/deck\\/.+\\/PS3_GAME)\\/USRDIR\\/EBOOT\\.BIN';

export interface MultiIdRPCS3ResolverConfig extends ResolverConfig
{
	
}

export interface MultiIdRPCS3ResolverCache extends MultiIdSerialStationResolverCache
{
	
}

export class MultiIdRPCS3Resolver extends MultiIdSerialStationResolver
{
	identifier: keyof MultiIdResolverConfigs = "rpcs3";

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isRPCS3Game(getLaunchCommand(details));
	}

	protected async retrieveTitleId(appId: number): Promise<string | undefined> {
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;

		const launchCommand = getLaunchCommand(details);
		const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
		if(!rom)
			return undefined;

		// If the game is installed it will have its id in the path,
		// otherwise we need to retrieve it from inside the rom
		let titleId = rom.match(new RegExp(rpcs3IdRegex))?.[1] ?? null;
		if(!titleId){
			let romFolder = rom.match(new RegExp(rpcs3RomPathRegex))?.[1];
			if(!romFolder)
				return undefined;

			return await call<[string], string | null>("rpcs3_get_titleid", romFolder) ?? undefined;
		}

		return titleId;
	}

	override icon = <SiPlaystation3/>;

	// DEV: maybe retrieve and match title from GameTDB to retrieve other regions?
}