import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {closestWithLimit, getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isCemuGame
} from "../../../shortcuts";
import Logger from "../../../logger";
import { removeBeforeAndIncluding, type WikiSearchResponse } from "../../GamesDBResult";
import { GameTDBMetadataProvider } from "../../metadata/providers/GameTDBProvider";
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
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isCemuGame(getLaunchCommand(details));
	}

	protected async search(title: string): Promise<CompatdataData[]>{
		let response = await fetchNoCors(`https://wiki.cemu-emu.org/api.php?action=opensearch&limit=10&search=${encodeURIComponent(title)}`);
		if(!response)
			return [];

		let results: WikiSearchResponse = await response.json();
		
		// Will retrieve details in getCompatdataForGame
		return results[1].map(t => ({
			title: t,
			id: t
		}));
	}

	override async getCompatdataForGame(appId: number): Promise<CompatdataData | undefined> {
		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching compatdata for game ${appId}`)

		const display_name = details.strDisplayName;
		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);
		const results = await this.search(display_name);
		if (results.length > 0)
		{
			this.logger.debug("results", results);
			let games: CompatdataData[];
			if (data_id === undefined)
			{
				const names = results.map(value => value.title);
				const closest_name = closestWithLimit(this.fuzziness, display_name, names)
				this.logger.debug(closest_name, results.map(value => value.title))
				const games1 = results.filter(value => value.title === closest_name)
				this.logger.debug("Games: ", games1)
				games = games1;
			} else if (data_id === 0)
			{
				return undefined;
			} else
			{
				games = results.filter(value => value.id === data_id)
			}
			const game = games.reverse().pop();

			// Retrieve missing details
			if(game && game.deck_compat_category === undefined){
				// Retrieve the wiki entry
				let title = game.title.replace(" ", "_");
				let response = await fetchNoCors(`https://wiki.cemu-emu.org/index.php?title=${encodeURIComponent(title)}&action=raw`);
				if(!response.ok)
					return undefined;

				// Handle redirects
				let text = await response.text();
				if(text.startsWith("#REDIRECT ")){
					title = removeBeforeAndIncluding(text, "#REDIRECT [[");
					title = title.substring(0, title.length-2).replace(" ", "_"); // Remove ending ]]

					response = await fetchNoCors(`https://wiki.cemu-emu.org/index.php?title=${encodeURIComponent(title)}&action=raw`);
					if(!response.ok)
						return undefined;

					text = await response.text();
				}

				let rating: 'Perfect' | 'Playable' | 'Runs' | 'Loads' | 'Unplayable' | '' = removeBeforeAndIncluding(text, "|rating =").split('\n', 1)[0].trim() as any;

				this.logger.debug("Compat rating", appId, rating);

				game.title = title;
				game.id = title;; // Cemu wiki seems not to have GameIDs...

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

			this.logger.debug(game);
			return game;

		} else return undefined;
		// } else reject(new Error(`HTTP ERROR: ${response.status}`));
	}

	override icon = <MdOutlineTablet/>; // WiiU tabled (kind of)
}