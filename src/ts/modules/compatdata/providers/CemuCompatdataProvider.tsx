import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {fetchNoCorsLegacyTimeout, getAppDetails} from "../../../util";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isCemuGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import { removeBeforeAndIncluding, type WikiSearchResponse } from "../../GamesDBResult";
import { GameTDBMetadataProvider } from "../../metadata/providers/GameTDBMetadataProvider";
import { FuzzySearchCompatdataProvider, type FuzzySearchCompatdataProviderCache, type FuzzySearchCompatdataProviderConfig } from "./FuzzySearchCompatdataProvider";
import { MdOutlineTablet } from "react-icons/md";

export interface CemuCompatdataProviderConfig extends FuzzySearchCompatdataProviderConfig
{
	
}

export interface CemuCompatdataProviderCache extends FuzzySearchCompatdataProviderCache
{

}

// No resolvers because Cemu Wiki has no Game IDs...
export class CemuCompatdataProvider extends FuzzySearchCompatdataProvider
{
	static identifier: string = "cemu";
	static title: string = t("providerCompatdataCemu");
	identifier: string = CemuCompatdataProvider.identifier;
	title: string = CemuCompatdataProvider.title;

	logger = new Logger(CemuCompatdataProvider.identifier);

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
		if (this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return false;

		const details = await getAppDetails(appId);
		if(!details)
			return false;
		if(!isCemuGame(getLaunchCommand(details)))
			return false;

		return await super.test(appId);
	}

	protected async search(title: string): Promise<CompatdataData[]>{
		let response = await fetchNoCorsLegacyTimeout('https://wiki.cemu-emu.org/api.php?' + new URLSearchParams({
			action: 'opensearch',
			limit: '10',
			search: title
		}).toString());
		if(!response)
			return [];

		let results: WikiSearchResponse = await response.json();
		
		// Will enrich later
		return results[1].map(t => ({
			title: t,
			id: t
		}));
	}

	protected override async enrichCompatdataForGame(appId: number, game: CompatdataData): Promise<void> {
		if(game.deck_compat_category !== undefined)
			return;

		// Retrieve the wiki entry
		let title = game.title.replace(" ", "_");
		let response = await fetchNoCorsLegacyTimeout('https://wiki.cemu-emu.org/index.php?' + new URLSearchParams({
			action: 'raw',
			title: title
		}).toString());
		if(!response.ok){
			game.deck_compat_category = SteamDeckCompatCategory.UNKNOWN; // To not enrich again
			return;
		}

		// Handle redirects (#REDIRECT [[New title]])
		let text = await response.text();
		if(text.startsWith("#REDIRECT ")){
			title = removeBeforeAndIncluding(text, "#REDIRECT [[");
			title = title.substring(0, title.length-2).replace(" ", "_"); // Remove ending ]]

			response = await fetchNoCorsLegacyTimeout('https://wiki.cemu-emu.org/index.php?' + new URLSearchParams({
				action: 'raw',
				title: title
			}).toString());
			if(!response.ok){
				game.deck_compat_category = SteamDeckCompatCategory.UNKNOWN; // To not enrich again
				return;
			}

			text = await response.text();
		}

		let rating: 'Perfect' | 'Playable' | 'Runs' | 'Loads' | 'Unplayable' | '' = removeBeforeAndIncluding(text, "|rating =").split('\n', 1)[0].trim() as any;

		this.logger.debug("Compat rating", appId, rating);

		game.title = title;
		game.id = title; // Cemu wiki seems not to have GameIDs...

		game.deck_compat_category =
			(rating === 'Perfect' || rating === 'Playable') ? SteamDeckCompatCategory.VERIFIED :
			rating === 'Runs' ? SteamDeckCompatCategory.PLAYABLE :
			rating ? SteamDeckCompatCategory.UNSUPPORTED :
			SteamDeckCompatCategory.UNKNOWN;
		
		game.deck_test_results ??= [];
		game.machine_test_results ??= [];
		game.os_test_results ??= [];
		game.frame_test_results ??= [];

		const deckAndMachine = [
			[game.deck_test_results, "SteamDeckVerified" as string],
			[game.machine_test_results, "SteamMachine" as string]
		] as const;
		const deckMachineAndFrame = [
			[game.deck_test_results, "SteamDeckVerified" as string],
			[game.machine_test_results, "SteamMachine" as string],
			[game.frame_test_results, "SteamFrame" as string]
		] as const;
		const machineAndFrame = [
			[game.machine_test_results, "SteamMachine" as string],
			[game.frame_test_results, "SteamFrame" as string]
		] as const;

		// The glyphs obviously do not match
		// Controller works by default (or do they? since the WiiU pad has also touch and webcam)
		game.deck_test_results!.push({
			test_loc_token: '#SteamDeckVerified_TestResult_ControllerGlyphsDoNotMatchDeckDevice',
			test_result: SteamTestResult.Playable
		});
		machineAndFrame.forEach(([results, cat]) => {
			results.push(
				{
					test_loc_token: `#${cat}_TestResult_ControllerGlyphsDoNotMatchDevice`,
					test_result: SteamTestResult.Playable
				}
			);
		});
		deckMachineAndFrame.forEach(([results, cat]) => {
			results.push(
				{
					test_loc_token: `#${cat}_TestResult_DefaultControllerConfigFullyFunctional`,
					test_result: SteamTestResult.Verified
				}
			);
		});

		// Default configuration works fine for playable games (we cannot assume for the Frame here)
		if(game.deck_compat_category === SteamDeckCompatCategory.VERIFIED){
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
		if(rating === 'Playable'){
			deckAndMachine.concat([[game.os_test_results, "SteamOS"] as const])
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
		if(this.gameTDBProvider.enabled){
			let metadata = await this.gameTDBProvider.getCemuGameEntries(appId);
			if(metadata.some(m => m.controls?.some(c => c.type === "guitar" && c.required))){
				([
					[game.deck_test_results, "SteamDeckVerified"],
					[game.os_test_results, "SteamOS"]
				] as const).forEach(([results, cat]) => {
					results.push(
						{
							test_loc_token: `#${cat}_TestResult_NotFullyFunctionalWithoutExternalUSBGuitar`,
							test_result: SteamTestResult.Playable
						}
					);
				});
			}
		}
	}

	override icon = <MdOutlineTablet/>; // WiiU tabled (kind of)
}