import {CompatdataData, SteamDeckCompatCategory} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isPCSX2Game
} from "../../../shortcuts";
import { removeAfterAndIncluding, removeBeforeAndIncluding } from "../../metadata/providers/GamesDBResult";
import Logger from "../../../logger";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import { CompatdataProvider } from "../CompatdataProvider";
import { MultiIdPCSX2Resolver } from "../../resolvers/MultiId/MultiIdPCSX2Resolver";
import type { FC } from "react";

type PCSX2CompatData = {
	title: string;
	serial: string;
	region: "us" | "eu" | "ja";
	status: "Perfect" | "Playable" | "Ingame" | "Menus" | "Intros" | "Nothing";
};

export interface PCSX2CompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'pcsx2'>, ResolverConfig>
{
	
}

export interface PCSX2CompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'pcsx2'>, ResolverCache>
{

}

export class PCSX2CompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdPCSX2Resolver(this)
	];
	
	static identifier: string = "pcsx2";
	static title: string = t("providerCompatdataPCSX2");
	identifier: string = PCSX2CompatdataProvider.identifier;
	title: string = PCSX2CompatdataProvider.title;

	logger = new Logger(PCSX2CompatdataProvider.identifier);

	private compatData: Record<string, PCSX2CompatData> = {}; // Formatted serial: compat

	async getCompatData(): Promise<void>
	{
		// Retrieve compat page source
		let response = await fetchNoCors("https://pcsx2.net/compat/");
		if(!response.ok)
			return;
		let main_response = await response.text();

		// Extract the compressed main id and runtime main id
		// <script src=/assets/js/main.<36bce525>.js defer></script>
		// <script src=/assets/js/runtime~main.<492161ef>.js defer></script>
		let main_id = removeAfterAndIncluding(removeBeforeAndIncluding(main_response, "<script src=/assets/js/main."), ".js defer").trim();
		if(!main_id)
			return;
		let runtime_main_id = removeAfterAndIncluding(removeBeforeAndIncluding(main_response, "<script src=/assets/js/runtime~main."), ".js defer").trim();
		if(!runtime_main_id)
			return;
		this.logger.debug("Main id / Runtime main id: ", main_id, runtime_main_id);

		// Retrieve main source, which has the component id
		response = await fetchNoCors(`https://pcsx2.net/assets/js/main.${main_id}.js`);
		if(!response.ok)
			return;

		// Retrieve "/compat/-ce9" component id
		// "/compat/-ce9":{...,"__comp":"<22803f85>",...}
		let compat_comp_id = removeAfterAndIncluding(removeBeforeAndIncluding(removeBeforeAndIncluding(await response.text(), "\"/compat/-ce9\":"), "\"__comp\":\""), "\"").trim();
		if(!compat_comp_id)
			return;
		this.logger.debug("Compat component id: ", compat_comp_id);

		// Retrieve runtime main source, which has the mappings to retrieve the last part of the id
		response = await fetchNoCors(`https://pcsx2.net/assets/js/runtime~main.${runtime_main_id}.js`);
		if(!response.ok)
			return;
		let runtime_main_response = await response.text();

		// Retrieve the mapping id
		// "22803f85":"<36262>"
		let comp_mapping_id = removeAfterAndIncluding(removeBeforeAndIncluding(runtime_main_response, `"${compat_comp_id}":"`), "\"").trim();
		if(!comp_mapping_id)
			return;
		this.logger.debug("Mapping id: ", comp_mapping_id);

		// Retrieve the remaining suffix (The first id in the file is the compat_comp_id we already have)
		let compat_comp_suffix = removeAfterAndIncluding(removeBeforeAndIncluding(removeBeforeAndIncluding(runtime_main_response, ")+\".\"+("), `${comp_mapping_id}:"`), "\"").trim();
		this.logger.debug("Compat component suffix: ", compat_comp_suffix);

		// Retrieve the compat component source
		response = await fetchNoCors(`https://pcsx2.net/assets/js/${compat_comp_id}.${compat_comp_suffix}.js`);
		if(!response.ok)
			return;
		
		let json = removeBeforeAndIncluding(await response.text(), "JSON.parse('");
		let lastQuote = json.lastIndexOf("'");
		json = json.substring(0, lastQuote)
			.replace(/\\'/g, "'")
			.replace(/\\\\/g, "\\"); // Unescape
		this.logger.debug("JSON: ", json);

		let data: PCSX2CompatData[] = JSON.parse(json);
		for(let entry of data){
			this.compatData[entry.serial.replace('-', '')] = entry;
		}
	}

	override async mount(): Promise<void>
	{
		await super.mount();
		await this.getCompatData();
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isPCSX2Game(getLaunchCommand(details));
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// We retrieve compatibility for any matching id
		const titleIds = (await this.resolve(appId))?.toString()
			.split(separator);

		this.logger.debug("Title ids", appId, titleIds);

		const compatData = titleIds
			?.map(i => this.compatData[i])
			.filter(c => c);
		if(!compatData?.length)
			return undefined;

		this.logger.debug("Compat data", appId, compatData);

		return {
			title: compatData.find(c => c.title)?.title || '',
			id: titleIds![0],
			deck_compat_category:
				compatData.some(c => c.status === "Perfect" || c.status === "Playable") ? SteamDeckCompatCategory.VERIFIED :
				compatData.some(c => c.status === "Ingame") ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED
		};
	}

	settingsComponent: FC = () => undefined;
}