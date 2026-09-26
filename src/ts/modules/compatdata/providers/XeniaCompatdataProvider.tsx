import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isXeniaGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import type { ResolverConfig, ResolverCache } from "../../Resolver";
import { MultiIdXeniaResolver } from "../../resolvers/MultiId/MultiIdXeniaResolver";
import { CompatdataProvider } from "../CompatdataProvider";
import { type MultiIdResolverConfigs, type MultiIdResolverCaches, type MultiIdResolver, separator } from "../../resolvers/MultiId/MultiIdResolver";
import { FaXbox } from "react-icons/fa";

type XeniaCompatData = {
	title: string;
	status: "Playable" | "Gameplay" | "Loads" | "Unplayable";
	id: string;
};

export interface XeniaCompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'xenia'>, ResolverConfig>
{
	
}

export interface XeniaCCompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'xenia'>, ResolverCache>
{

}

export class XeniaCompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdXeniaResolver(this)
	];

	static identifier: string = "xenia";
	static title: string = t("providerCompatdataXenia");
	identifier: string = XeniaCompatdataProvider.identifier;
	title: string = XeniaCompatdataProvider.title;

	logger = new Logger(XeniaCompatdataProvider.identifier);

	private compatData: Record<string, XeniaCompatData> = {}; // Formatted id: compat

	async getCompatData(): Promise<void>
	{
		// Retrieve compat page source
		let response = await fetchNoCors("https://github.com/xenia-canary/game-compatibility/releases/download/game-compatibility/compatibility_data.json");
		if(!response.ok)
			return;

		let data: XeniaCompatData[] = await response.json();
		for(let entry of data){
			this.compatData[entry.id.toUpperCase()] = entry;
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
		return isXeniaGame(getLaunchCommand(details));
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// Xbox 360 has a single title id per game
		const titleId = (await this.resolve(appId))?.toString().split(separator)[0]?.toUpperCase();
		if(!titleId || !this.compatData[titleId])
			return undefined;

		let result: CompatdataData = {
			title: this.compatData[titleId].title,
			id: titleId,

			deck_compat_category:
				this.compatData[titleId].status === "Playable" ? SteamDeckCompatCategory.VERIFIED :
				this.compatData[titleId].status === "Gameplay" ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED,

			deck_test_results: [],
			machine_test_results: [],
			os_test_results: [],
			frame_test_results: []
		};

		const machineAndFrame = [
			[result.machine_test_results!, "SteamMachine" as string],
			[result.frame_test_results!, "SteamFrame" as string]
		] as const;
		const deckAndMachine = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string]
		] as const;
		const deckMachineAndFrame = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string],
			[result.frame_test_results!, "SteamFrame" as string]
		] as const;

		// The glyphs do match
		// Controller works by default
		result.deck_test_results!.push({
			test_loc_token: '#SteamDeckVerified_TestResult_ControllerGlyphsMatchDeckDevice',
			test_result: SteamTestResult.Verified
		});
		machineAndFrame.forEach(([results, cat]) => {
			results.push({
				test_loc_token: `#${cat}_TestResult_ControllerGlyphsMatchDevice`,
				test_result: SteamTestResult.Verified
			});
		});
		deckMachineAndFrame.forEach(([results, cat]) => {
			results.push({
				test_loc_token: `#${cat}_TestResult_DefaultControllerConfigFullyFunctional`,
				test_result: SteamTestResult.Verified
			});
		});

		// Default configuration works fine for playable games (we cannot assume for the Frame here, especially since Xenia runs under Proton)
		if(result.deck_compat_category === SteamDeckCompatCategory.VERIFIED){
			deckAndMachine.forEach(([results, cat]) => {
				results.push(
					{
						test_loc_token: `#${cat}_TestResult_DefaultConfigurationIsPerformant`,
						test_result: SteamTestResult.Verified
					}
				);
			});
		}

		return result;
	}

	override icon = <FaXbox/>;
}