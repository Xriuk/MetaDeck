import {ID, MetadataData} from "../../../../Interfaces";
import {ResolverCache, ResolverConfig} from "../../../Resolver";
import {t} from "../../../../useTranslations";
import {GOGMetadataProviderResolver, separator} from "./GOGMetadataProviderResolver";
import {getLaunchCommand, isEpicGame, isGOGGame, isHeroicGame} from "../../../../shortcuts";
import {removeAfterAndIncluding, removeBeforeAndIncluding} from "../../providers/GamesDBResult";
import {getAppDetails} from "../../../../util";
import {GOGMetadataProviderResolverConfigs} from "../../providers/GOGMetadataProvider";
import {callable} from "@decky/api";

export interface GOGMetadataProviderHeroicResolverConfig extends ResolverConfig
{
}

export interface GOGMetadataProviderHeroicResolverCache extends ResolverCache
{
}

export class GOGMetadataProviderHeroicResolver extends GOGMetadataProviderResolver
{
	static identifier: keyof GOGMetadataProviderResolverConfigs = "heroic";
	static title: string = t("providerMetadataGOG");
	identifier: keyof GOGMetadataProviderResolverConfigs = GOGMetadataProviderHeroicResolver.identifier;
	title: string = GOGMetadataProviderHeroicResolver.title;

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if (details == null)
			return false;
		return isHeroicGame(getLaunchCommand(details));
	}

	async resolve(appId: number): Promise<ID | undefined>
	{
		const details = await getAppDetails(appId);
		if (details == null)
			return undefined;
		const launchCommand = getLaunchCommand(details);
		let prefix;
		if(isGOGGame(launchCommand))
			prefix = "gog";
		else if(isEpicGame(launchCommand))
			prefix = "legendary";
		else
			return undefined; // DEV: add support for other launchers

		return removeAfterAndIncluding(removeBeforeAndIncluding(launchCommand, "heroic://launch/" + prefix + "/"), "\"").trim();
	}

	private heroic_gog_data: (id: number) => Promise<{
		"install_size": number,
		"install_date": number,
		'install_path': string
	}> = callable("heroic_gog_data");

	private heroic_egs_data: (id: string) => Promise<{
		"namespace": string,
		"install_size": number,
		"install_date": number,
		'install_path': string
	}> = callable("heroic_egs_data");

	async apply(appId: number, data: MetadataData): Promise<void>
	{
		const resolved = await this.resolve(appId);
		if (!resolved) return;

		const [platform, id] = resolved.toString().split(separator);
		let plaform_data;
		if(platform === 'gog')
			plaform_data = await this.heroic_gog_data(+id);
		else if(platform === 'epic')
			plaform_data = await this.heroic_egs_data(id + '');
		else
			return; // DEV: add support for other launchers

		data.install_size = plaform_data.install_size;
		data.install_date = plaform_data.install_date;
	}
}