import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isDolphinGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import { CompatdataProvider } from "../CompatdataProvider";
import { MultiIdDolphinResolver } from "../../resolvers/MultiId/MultiIdDolphinResolver";
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import type { FC } from "react";
import { removeBeforeAndIncluding } from "../../metadata/providers/GamesDBResult";
import { GameTDBMetadataProvider } from "../../metadata/providers/GameTDBProvider";

export interface DolphinCompatdataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'dolphin'>, ResolverConfig>
{
	
}

export interface DolphinCompatdataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'dolphin'>, ResolverCache>
{

}

export class DolphinCompatdataProvider extends CompatdataProvider<any>
{
	resolvers: MultiIdResolver[] = [
		new MultiIdDolphinResolver(this)
	];

	static identifier: string = "dolphin";
	static title: string = t("providerCompatdataDolphin");
	identifier: string = DolphinCompatdataProvider.identifier;
	title: string = DolphinCompatdataProvider.title;

	logger = new Logger(DolphinCompatdataProvider.identifier);

	private _gameTDBProvider?: GameTDBMetadataProvider;
	get gameTDBProvider(): GameTDBMetadataProvider
	{
		if(!this._gameTDBProvider){
			this._gameTDBProvider = this.state.modules.metadata.providers.find(p => p instanceof GameTDBMetadataProvider);
			if(!this._gameTDBProvider)
				this._gameTDBProvider = new GameTDBMetadataProvider(this.state.modules.metadata);
		}

		return this._gameTDBProvider;
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isDolphinGame(getLaunchCommand(details));
	}

	// https://wiki.dolphin-emu.org/index.php?title=GameIDs#System_Code
	private isGameCubeId6(id6: string): boolean{
		switch(id6[0]){
		case 'D':
		case 'G':
		case 'P':
			return true;
		}

		return false;
	}

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// Dolphin groups the title id for different regions
		const id6 = (await this.resolve(appId))?.toString().split(separator)[0];
		if(!id6)
			return undefined;

		this.logger.debug("Title ID6", appId, id6);

		// Retrieve the wiki entry
		let response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=${id6}&action=raw`);
		if(!response.ok)
			return undefined;

		let title = removeBeforeAndIncluding(await response.text(), "#REDIRECT [[");
		title = title.substring(0, title.length-2); // Remove ending ]]

		// Retrieve the wiki page
		response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=Template:Ratings/${encodeURIComponent(title)}&action=raw`);
		if(!response.ok)
			return undefined;

		let rating = parseInt(await response.text(), 10);

		this.logger.debug("Compat rating", appId, rating);

		let result: CompatdataData = {
			title: title,
			id: id6,

			deck_compat_category:
				rating >= 4 ? SteamDeckCompatCategory.VERIFIED :
				rating >= 3 ? SteamDeckCompatCategory.PLAYABLE :
				SteamDeckCompatCategory.UNSUPPORTED,

			deck_test_results: [
				// Wii/GC default resolution 480i (NTSC) or 576i (PAL)
				{
					test_loc_token: '#SteamDeckVerified_TestResult_NativeResolutionNotDefault',
					test_result: SteamTestResult.Playable
				}
			],
			machine_test_results: [],
			os_test_results: []
		};

		const deckAndMachine = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string]
		] as const;

		// The glyphs obviously do not match
		result.deck_test_results!.push({
			test_loc_token: '#SteamDeckVerified_TestResult_ControllerGlyphsDoNotMatchDeckDevice',
			test_result: SteamTestResult.Playable
		});
		result.machine_test_results!.push({
			test_loc_token: `#SteamMachine_TestResult_ControllerGlyphsDoNotMatchDevice`,
			test_result: SteamTestResult.Playable
		});

		// Default configuration works fine for playable games
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

		// If the game is not perfect, it might have minor issues
		if(rating === 4){
			deckAndMachine.concat([[result.os_test_results!, "SteamOS"] as const])
				.forEach(([results, cat]) => {
					results.push(
						{
							test_loc_token: `#${cat}_TestResult_DisplayOutputHasNonblockingIssues`,
							test_result: SteamTestResult.Playable
						},
						{
							test_loc_token: `#${cat}_TestResult_VideoPlaybackHasNonblockingIssues`,
							test_result: SteamTestResult.Playable
						},
						{
							test_loc_token: `#${cat}_TestResult_AudioOutputHasNonblockingIssues`,
							test_result: SteamTestResult.Playable
						}
					);
				});
		}

		// Enrich test result by retrieving required devices like USB Guitar
		let metadata = await this.gameTDBProvider.getDolphinGameEntries(appId);
		if(metadata.some(m => m.controls?.some(c => c.type === "guitar" && c.required))){
			([
				[result.deck_test_results!, "SteamDeckVerified"],
				[result.os_test_results!, "SteamOS"]
			] as const).forEach(([results, cat]) => {
				results.push(
					{
						test_loc_token: `#${cat}_TestResult_NotFullyFunctionalWithoutExternalUSBGuitar`,
						test_result: SteamTestResult.Playable
					}
				);
			});
		}

		// Controller works if it is a GameCube game or if we have support for GameCube or Classic Controller,
		// otherwise it may require tweaks
		if(this.isGameCubeId6(id6) || metadata.some(m => m.controls?.some(c => c.type === "gamecube" || c.type === "classiccontroller"))){
			deckAndMachine.forEach(([results, cat]) => {
				results.push(
					{
						test_loc_token: `#${cat}_TestResult_DefaultControllerConfigFullyFunctional`,
						test_result: SteamTestResult.Playable
					}
				);
			});
		}
		else{
			deckAndMachine.forEach(([results, cat]) => {
				results.push(
					{
						test_loc_token: `#${cat}_TestResult_DefaultControllerConfigNotFullyFunctional`,
						test_result: SteamTestResult.Playable
					}
				);
			});
		}

		return result;
	}

	settingsComponent: FC = () => undefined;
}