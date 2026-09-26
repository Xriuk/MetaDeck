import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../../Interfaces";
import {closestWithLimit, getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isDolphinGame,
	isGameCubeId6
} from "../../../shortcuts";
import Logger from "../../../logger";
import { MultiIdDolphinResolver } from "../../resolvers/MultiId/MultiIdDolphinResolver";
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import { removeBeforeAndIncluding, type WikiSearchResponse } from "../../GamesDBResult";
import { GameTDBMetadataProvider } from "../../metadata/providers/GameTDBProvider";
import { FuzzySearchCompatdataProvider, type FuzzySearchCompatdataProviderCache, type FuzzySearchCompatdataProviderConfig } from "./FuzzySearchCompatdataProvider";
import { SiDolphin } from "react-icons/si";

export interface DolphinCompatdataProviderConfig extends Omit<FuzzySearchCompatdataProviderConfig, 'resolvers'>, ProviderConfig<Pick<MultiIdResolverConfigs, 'dolphin'>, ResolverConfig>
{
	
}

export interface DolphinCompatdataProviderCache extends Omit<FuzzySearchCompatdataProviderCache, 'resolvers'>, ProviderCache<Pick<MultiIdResolverCaches, 'dolphin'>, ResolverCache>
{

}

// ID provider which fallbacks to fuzzy search
export class DolphinCompatdataProvider extends FuzzySearchCompatdataProvider
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

	protected async search(title: string): Promise<CompatdataData[]>{
		let response = await fetchNoCors(`https://wiki.dolphin-emu.org/api.php?action=opensearch&limit=10&search=${encodeURIComponent(title)}`);
		if(!response)
			return [];

		let results: WikiSearchResponse = await response.json();
		
		// Will retrieve details in getCompatdataForGame
		return results[1].map(t => ({
			title: t,
			id: t
		}));
	}

	private async getTitleData(title: string | undefined, id: string | undefined, appId: number, fallbackToSearch = false): Promise<CompatdataData | undefined>{
		if(!title && !id)
			return undefined;

		// Retrieve the wiki entry
		let response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=${(id ?? title)}&action=raw`);
		if(!response.ok){
			if(fallbackToSearch)
				return await super.provide(appId);
			else
				return undefined;
		}

		// Handle redirects
		let text = await response.text();
		if(text.startsWith("#REDIRECT ")){
			title = removeBeforeAndIncluding(text, "#REDIRECT [[");
			title = title.substring(0, title.length-2); // Remove ending ]]
		}
		if(!title)
			return undefined;

		// Retrieve the wiki rating page
		response = await fetchNoCors(`https://wiki.dolphin-emu.org/index.php?title=Template:Ratings/${encodeURIComponent(title)}&action=raw`);
		if(!response.ok)
			return undefined;

		let rating = parseInt(await response.text(), 10);

		this.logger.debug("Compat rating", appId, rating);

		let result: CompatdataData = {
			title: title,
			id: id ?? title,

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
			os_test_results: [],
			frame_test_results: []
		};

		const deckAndMachine = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string]
		] as const;
		const deckMachineAndFrame = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string],
			[result.frame_test_results!, "SteamFrame" as string]
		] as const;
		const deckMachineOSAndFrame = [
			[result.deck_test_results!, "SteamDeckVerified" as string],
			[result.machine_test_results!, "SteamMachine" as string],
			[result.os_test_results!, "SteamOS" as string],
			[result.frame_test_results!, "SteamFrame" as string]
		] as const;
		const machineAndFrame = [
			[result.machine_test_results!, "SteamMachine" as string],
			[result.frame_test_results!, "SteamFrame" as string]
		] as const;

		// The glyphs obviously do not match
		result.deck_test_results!.push({
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

		// Default configuration works fine for playable games (we cannot assume for the Frame here)
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
		if((id && isGameCubeId6(id)) || metadata.some(m => m.controls?.some(c => c.type === "gamecube" || c.type === "classiccontroller"))){
			deckMachineAndFrame.forEach(([results, cat]) => {
				results.push(
					{
						test_loc_token: `#${cat}_TestResult_DefaultControllerConfigFullyFunctional`,
						test_result: SteamTestResult.Verified
					}
				);
			});
		}
		else{
			deckMachineOSAndFrame.forEach(([results, cat]) => {
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

	async provide(appId: number): Promise<CompatdataData | undefined>{
		// Dolphin groups the title id for different regions
		const id6 = (await this.resolve(appId))?.toString().split(separator, 1)[0];
		if(!id6)
			return undefined;

		this.logger.debug("Title ID6", appId, id6);

		return await this.getTitleData(undefined, id6, appId, true);
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
				let response = await this.getTitleData(game.title, undefined, appId, true);
				if(response)
					Object.assign(game, response);
			}

			this.logger.debug(game);
			return game;

		} else return undefined;
		// } else reject(new Error(`HTTP ERROR: ${response.status}`));
	}

	override icon = <SiDolphin/>;
}