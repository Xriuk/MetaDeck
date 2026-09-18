import {ID, MetadataData} from "../../../../../Interfaces";
import {ResolverCache, ResolverConfig} from "../../../../Resolver";
import {t} from "../../../../../useTranslations";
import {GOGMetadataProviderResolver} from "../GOGMetadataProviderResolver";
import {getExe, getLaunchCommand, isEpicGame, isGOGGame, isJunkStoreGame} from "../../../../../shortcuts";
import {removeAfterAndIncluding, removeBeforeAndIncluding} from "../../GamesDBResult";
import {getAppDetails} from "../../../../../util";
import {GOGMetadataProviderResolverConfigs} from "../GOGMetadataProvider";
import {callable} from "@decky/api";

export interface GOGMetadataProviderJunkStoreResolverConfig extends ResolverConfig
{
}

export interface GOGMetadataProviderJunkStoreResolverCache extends ResolverCache
{
}

export class GOGMetadataProviderJunkStoreResolver extends GOGMetadataProviderResolver
{
	static identifier: keyof GOGMetadataProviderResolverConfigs = "junk";
	static title: string = t("providerMetadataGOG");
	identifier: keyof GOGMetadataProviderResolverConfigs = GOGMetadataProviderJunkStoreResolver.identifier;
	title: string = GOGMetadataProviderJunkStoreResolver.title;

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isJunkStoreGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined>
	{
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

	async apply(appId: number, data: MetadataData): Promise<void>
	{
		let details = await getAppDetails(appId);
		if(!details)
			return undefined;
		let exe = getExe(details)?.replace(/['"]+/g, "");
		if (!exe)
			return undefined;

		data.install_size = await this.directory_size(exe);
		data.install_date = await this.file_date(exe);
	}
}