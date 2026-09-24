import {CompatdataData, SteamDeckCompatCategory, SteamTestResult, VerifiedDBResults, YesNo, type ID} from "../../../Interfaces";
import {closestWithLimit, distanceWithLimit, getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isCemuGame, isDolphinGame, isDuckstationGame, isEmulatedGame, isFlycastGame,
	isMelonDSGame, isMGBAGame, isPCSX2Game, isPPSSPPGame, isRosaliesMupenGUIGame, isRPCS3Game,
	isRyujinxGame, isShadPS4Game, isVita3KGame, isXemuGame, isXeniaGame
} from "../../../shortcuts";
import { FuzzySearchCompatdataProvider, type FuzzySearchCompatdataProviderCache, type FuzzySearchCompatdataProviderConfig } from "./FuzzySearchCompatdataProvider";
import Logger from "../../../logger";

export interface EmuDeckCompatdataProviderConfig extends FuzzySearchCompatdataProviderConfig
{

}

export interface EmuDeckCompatdataProviderCache extends FuzzySearchCompatdataProviderCache
{

}

export class EmuDeckCompatdataProvider extends FuzzySearchCompatdataProvider
{
	static identifier: string = "emudeck";
	static title: string = t("providerCompatdataEmuDeck");
	identifier: string = EmuDeckCompatdataProvider.identifier;
	title: string = EmuDeckCompatdataProvider.title;

	logger: Logger = new Logger(EmuDeckCompatdataProvider.identifier)

	private verifiedDB: Record<string, VerifiedDBResults> = {};

	async getVerifiedDB(): Promise<void>
	{
		const response = (await fetchNoCors("https://opensheet.elk.sh/1fRqvAh_wW8Ho_8i966CCSBgPJ2R_SuDFIvvKsQCv05w/Database"));
		if (response.ok)
		{
			if (response.status === 200)
			{
				const verifiedDB: VerifiedDBResults[] = await response.json()
				this.verifiedDB = verifiedDB
					.filter(r => !r.Platform || r.Platform.trim() === "Steam Deck")
					.reduce<Record<string, VerifiedDBResults>>((acc, curr, i) => {
						acc[curr.Game] = curr;
						acc[curr.Game].Row = i;
						return acc;
					}, {});
			}
		}
	}

	override async mount(): Promise<void>
	{
		await super.mount();
		await this.getVerifiedDB();
	}

	private async getConsoleNames(appId: number): Promise<string[] | undefined>{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		if(isXemuGame(launchCommand))
			return ['Xbox'];
		else if(isXeniaGame(launchCommand))
			return ['Xbox 360'];

		else if(isDuckstationGame(launchCommand))
			return ['PS1', 'PSX'];
		else if(isPCSX2Game(launchCommand))
			return ['PS2'];
		else if(isRPCS3Game(launchCommand))
			return ['PS3'];
		else if(isShadPS4Game(launchCommand))
			return ['PS4'];
		else if(isPPSSPPGame(launchCommand))
			return ['PSP'];
		else if(isVita3KGame(launchCommand))
			return ['PS Vita', 'PSVITA'];

		else if(isDolphinGame(launchCommand))
			return ['Wii', 'Gamecube'];
		else if(isCemuGame(launchCommand))
			return ['Wii U'];
		else if(isMelonDSGame(launchCommand))
			return ['DS'];
		else if(isMGBAGame(launchCommand))
			return ['Gameboy', 'Gameboy Color', 'Gameboy Advance'];
		else if(isRosaliesMupenGUIGame(launchCommand))
			return ['N64'];
		else if(isRyujinxGame(launchCommand))
			return ['Switch'];

		else if(isFlycastGame(launchCommand))
			return ['Dreamcast'];
		
		else
			return undefined; // Unknown (match all)
	}

	protected async search(title: string, consoleNames?: string[]): Promise<CompatdataData[]>{
		// Search with double the fuzziness to retrieve them all, they will be filtered later
		const closest_names = distanceWithLimit(this.fuzziness * 2, title, Object.keys(this.verifiedDB));
		let results = closest_names.map(n => this.verifiedDB[n]);

		// If we have console(s), filter by them
		if(consoleNames?.length)
			results = results.filter(r => consoleNames.indexOf(r.Console) !== -1);

		// Take max 5 results
		results = results.slice(0, 5);

		// Group by name
		let dict: Record<string, VerifiedDBResults[]> = {};
		for(let result of results){
			if(!dict[result.Game])
				dict[result.Game] = [];
			dict[result.Game].push(result);
		}

		return Object.entries(dict).map(([name, res]) => {
			let result: CompatdataData = {
				title: name,
				id: Math.min(...res.map(r => r.Row)),

				deck_compat_category: Math.max(
					SteamDeckCompatCategory.UNKNOWN,
					...res.map(r => {
						if (r.Boots == YesNo.YES && r.Playable == YesNo.YES)
							return SteamDeckCompatCategory.VERIFIED;
						else if (r.Boots == YesNo.YES && (r.Playable == YesNo.NO || r.Playable == YesNo.PARTIAL))
							return SteamDeckCompatCategory.PLAYABLE;
						else
							return SteamDeckCompatCategory.UNSUPPORTED;
					})
				),

				notes: res.map(r => r.Notes)
					.filter(n => n)
			};

			return result;
		});
	}

	public override async getCompatdataForGame(appId: number): Promise<CompatdataData | undefined>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);

		this.logger.debug(`Fetching compatdata for game ${appId}`)

		const display_name = details.strDisplayName;
		const data_id = this.overrides[appId];
		let consoleNames = await this.getConsoleNames(appId);
		this.logger.debug("data_id", data_id);
		const results = await this.search(display_name, consoleNames);
		if (results.length > 0)
		{
			this.logger.debug("results", results);
			let games: CompatdataData[];
			if (data_id === undefined)
			{
				const names = results.map(value => value.title);
				const closest_name = closestWithLimit(this.fuzziness, display_name, names);
				this.logger.debug(closest_name, results.map(value => value.title));
				const games1 = results.filter(value => value.title === closest_name);
				this.logger.debug("Games: ", games1);
				games = games1;
			} else if (data_id === 0)
			{
				return undefined;
			} else
			{
				games = results.filter(value => value.id === data_id)
			}
			const game = games.reverse().pop();

			// Retrieve missing info
			if(game && game.deck_test_results === undefined){
				game.deck_test_results = [];
				game.machine_test_results = [];
				game.os_test_results = [];

				const deckAndMachine = [
					[game.deck_test_results, "SteamDeckVerified" as string],
					[game.machine_test_results, "SteamMachine" as string]
				] as const;

				// Only on Xbox and Xbox 360 the glyphs do match
				if(isXemuGame(launchCommand) || isXeniaGame(launchCommand)){
					game.deck_test_results!.push({
						test_loc_token: '#SteamDeckVerified_TestResult_ControllerGlyphsMatchDeckDevice',
						test_result: SteamTestResult.Verified
					});
					game.machine_test_results!.push({
						test_loc_token: `#SteamMachine_TestResult_ControllerGlyphsMatchDevice`,
						test_result: SteamTestResult.Verified
					});
				}
				else{
					game.deck_test_results.push({
						test_loc_token: '#SteamDeckVerified_TestResult_ControllerGlyphsDoNotMatchDeckDevice',
						test_result: SteamTestResult.Playable
					});
					game.machine_test_results.push({
						test_loc_token: `#SteamMachine_TestResult_ControllerGlyphsDoNotMatchDevice`,
						test_result: SteamTestResult.Playable
					});
				}

				// Controller works on:
				// PS1, PS2, PS3, PS4, PSP, PS Vita
				// Xbox, Xbox 360
				// N64
				// Dreamcast
				// Note: GameCube also has controller but we cannot detect it from Dolphin here
				if(isDuckstationGame(launchCommand) || isPCSX2Game(launchCommand) || isRPCS3Game(launchCommand) || isShadPS4Game(launchCommand) ||
						isPPSSPPGame(launchCommand) || isVita3KGame(launchCommand) ||
					isXemuGame(launchCommand) || isXeniaGame(launchCommand) ||
					isRosaliesMupenGUIGame(launchCommand) ||
					isFlycastGame(launchCommand)){

					deckAndMachine.forEach(([results, cat]) => {
						results.push(
							{
								test_loc_token: `#${cat}_TestResult_DefaultControllerConfigFullyFunctional`,
								test_result: SteamTestResult.Verified
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

				// Default configuration works fine for playable games
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

				// Portable consoles should have correct interface text size on Deck
				if(isPPSSPPGame(launchCommand) || isVita3KGame(launchCommand) || isMelonDSGame(launchCommand) || isMGBAGame(launchCommand) || isRyujinxGame(launchCommand)){
					game.deck_test_results.push({
						test_loc_token: '#SteamDeckVerified_TestResult_InterfaceTextIsLegible',
						test_result: SteamTestResult.Verified
					});
				}

				// Only PS3, PS4, Xbox 360 and Switch should have the correct deck resolution
				if(!isRPCS3Game(launchCommand) && !isShadPS4Game(launchCommand) && !isXeniaGame(launchCommand) && !isRyujinxGame(launchCommand)){
					game.deck_test_results.push({
						test_loc_token: '#SteamDeckVerified_TestResult_NativeResolutionNotDefault',
						test_result: SteamTestResult.Playable
					});
				}
			}

			this.logger.debug(game);
			return game;

		} else return undefined;
		// } else reject(new Error(`HTTP ERROR: ${response.status}`));
	}

	protected override async getAllCompatdataForGame(appId: number): Promise<Record<ID, Pick<CompatdataData, 'title'>> | undefined>
	{
		const display_name = appStore.GetAppOverviewByAppID(appId)?.display_name;
		let consoleNames = await this.getConsoleNames(appId);
		const results = await this.search(display_name, consoleNames);

		// We add all results without limiting them for overrides
		if (results.length > 0)
		{
			let ret: Record<ID, CompatdataData> = {};
			for (let game of results)
			{
				ret[game.id] = game;
			}
			return ret;
		} else return undefined;
	}

	override async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isEmulatedGame(getLaunchCommand(details));
	}
}