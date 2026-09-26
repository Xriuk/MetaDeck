import {ID, MetadataData} from "../../../../Interfaces";
import {ResolverCache, ResolverConfig} from "../../../Resolver";
import {t} from "../../../../useTranslations";
import {GOGMetadataProviderResolver, separator} from "./GOGMetadataProviderResolver";
import {getLaunchCommand, isEpicGame, isGOGGame, isNSLGame, isUbisoftGame} from "../../../../shortcuts";
import {removeAfterAndIncluding, removeBeforeAndIncluding} from "../../../GamesDBResult";
import {getAppDetails} from "../../../../util";
import {GOGMetadataProviderResolverConfigs} from "../../providers/GOGMetadataProvider";
import {callable} from "@decky/api";

export interface GOGMetadataProviderNSLResolverConfig extends ResolverConfig
{
}

export interface GOGMetadataProviderNSLResolverCache extends ResolverCache
{
}

export class GOGMetadataProviderNSLResolver extends GOGMetadataProviderResolver
{
	static identifier: keyof GOGMetadataProviderResolverConfigs = "nsl";
	static title: string = t("providerMetadataGOG");
	identifier: keyof GOGMetadataProviderResolverConfigs = GOGMetadataProviderNSLResolver.identifier;
	title: string = GOGMetadataProviderNSLResolver.title;

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return false;
		return isNSLGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		if(isGOGGame(launchCommand))
			return "gog" + separator + removeAfterAndIncluding(removeBeforeAndIncluding(launchCommand, "/gameId="), "/path=").trim();
		else if(isEpicGame(launchCommand))
			return "epic" + separator + removeAfterAndIncluding(removeBeforeAndIncluding(launchCommand, "com.epicgames.launcher://apps/"), "?action").trim();
		else if(isUbisoftGame(launchCommand))
			return "uplay" + separator + removeAfterAndIncluding(removeBeforeAndIncluding(launchCommand, "uplay://launch/"), "/").trim();
		else
			return undefined; // DEV: add support for other launchers
	}

	private nsl_gog_data: (id: number) => Promise<{
		"install_size": number,
		"install_date": number,
		'install_path': string
	}> = callable("nsl_gog_data");

	private nsl_egs_data: (id: string) => Promise<{
		"namespace": string,
		"install_size": number,
		"install_date": number,
		'install_path': string
	}> = callable("nsl_egs_data");

	async apply(appId: number, data: MetadataData): Promise<void>
	{
		const resolved = await this.resolve(appId);
		if (!resolved) return;

		const [platform, id] = resolved.toString().split(separator);

		let plaform_data;
		if(platform === 'gog')
			plaform_data = await this.nsl_gog_data(+id);
		else if(platform === 'epic')
			plaform_data = await this.nsl_egs_data(id + '');
		else
			return; // DEV: add support for other launchers
		
		if(!plaform_data)
			return;

		data.install_size = plaform_data.install_size;
		data.install_date = plaform_data.install_date;
	}
}