import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import Logger from "../../../logger";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { CompatdataProvider } from "../CompatdataProvider";
import { FaXbox } from "react-icons/fa";
import { toasterToast } from "../../../util";

type XeniaCompatData = {
	title: string;
	status: "Playable" | "Gameplay" | "Loads" | "Unplayable";
	id: string;
};

export interface XeniaCompatdataProviderConfig extends ProviderConfig<'xenia'>{
	
}

export interface XeniaCCompatdataProviderCache extends ProviderCache{
	
}

export class XeniaCompatdataProvider extends CompatdataProvider<any>{
	identifier = "xenia" as const;
	title = t("providerCompatdataXenia");

	logger = new Logger(this.identifier);

	private compatData: Record<string, XeniaCompatData> = {}; // Formatted id: compat

	override async mount(): Promise<void>{
		// Retrieve compat page source
		let response = await fetchNoCors("https://github.com/xenia-canary/game-compatibility/releases/download/game-compatibility/compatibility_data.json");
		if(!response.ok){
			toasterToast(t("initError"), this);

			return;
		}

		let data: XeniaCompatData[] = await response.json();
		for(let entry of data){
			this.compatData[entry.id.toUpperCase()] = entry;
		}
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		if (this.excludedApps.includes(appId))
			return undefined;
		
		const titleId = (await this.resolve(appId))?.toString().toUpperCase();
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