import {ID, MetadataData} from "../../../../Interfaces";
import {ResolverCache, ResolverConfig} from "../../../Resolver";
import {GOGMetadataProviderResolver} from "./GOGMetadataProviderResolver";
import {getExe, getLaunchCommand, isEpicGame, isGOGGame, isJunkStoreGame} from "../../../../shortcuts";
import {removeAfterAndIncluding, removeBeforeAndIncluding} from "../../../GamesDBResult";
import {getAppDetails} from "../../../../util";
import {callable} from "@decky/api";
import { FaStore } from "react-icons/fa";

export interface GOGMetadataProviderJunkStoreResolverConfig extends ResolverConfig{

}

export interface GOGMetadataProviderJunkStoreResolverCache extends ResolverCache{

}

export class GOGMetadataProviderJunkStoreResolver extends GOGMetadataProviderResolver<"gog_junk">{
	identifier = "gog_junk" as const;

	async test(appId: number): Promise<boolean>{
		const details = await getAppDetails(appId);
		if (!details)
			return false;

		return isJunkStoreGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined>{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);
		let exe = getExe(details);
		if (!exe) return undefined;
		let prefix;
		if(isGOGGame(launchCommand))
			prefix = "gog";
		else if(isEpicGame(launchCommand))
			prefix = "epic";
		else
			return undefined; // DEV: add support for other launchers
		
		return prefix + removeAfterAndIncluding(removeBeforeAndIncluding(launchCommand, prefix + "-launcher.sh"), exe).trim();
	}

	private directory_size: (path: string) => Promise<number> = callable("directory_size");
	private file_date: (path: string) => Promise<number> = callable("file_date");

	override async apply(appId: number, data: MetadataData): Promise<void>{
		if(data.install_size && data.install_date)
			return;

		let details = await getAppDetails(appId);
		if(!details)
			return undefined;
		let exe = getExe(details)?.replace(/['"]+/g, "");
		if (!exe)
			return undefined;

		data.install_size = await this.directory_size(exe);
		data.install_date = await this.file_date(exe);
	}

	override icon = <FaStore/>;
}