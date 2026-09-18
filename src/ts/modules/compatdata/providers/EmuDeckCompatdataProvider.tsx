import {ProviderCache, ProviderConfig} from "../../Provider";
import {CompatdataProvider} from "../CompatdataProvider";
import {CompatdataData, SteamDeckCompatCategory, VerifiedDBResults, YesNo} from "../../../Interfaces";
import {FC} from "react";
import {distanceWithLimit, getAppDetails} from "../../../util";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../useTranslations";
import {
	getLaunchCommand, isCemuGame, isDolphinGame, isDuckstationGame, isEmulatedGame, isFlycastGame,
	isMelonDSGame, isMGBAGame, isPCSX2Game, isPPSSPPGame, isRosaliesMupenGUIGame, isRPCS3Game,
	isRyujinxGame, isShadPS4Game, isVita3KGame, isXemuGame, isXeniaGame
} from "../../../shortcuts";
import {ResolverCache, ResolverConfig} from "../../Resolver";

export interface EmuDeckCompatdataProviderConfig extends ProviderConfig<{}, ResolverConfig>
{
	fuzziness: number
}

export interface EmuDeckCompatdataProviderCache extends ProviderCache<{}, ResolverCache>
{

}

export class EmuDeckCompatdataProvider extends CompatdataProvider<any>
{
	static identifier: string = "emudeck";
	static title: string = t("providerCompatdataEmuDeck");
	identifier: string = EmuDeckCompatdataProvider.identifier;
	title: string = EmuDeckCompatdataProvider.title;

	resolvers = [];

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
					.reduce<Record<string, VerifiedDBResults>>((acc, curr) => {
						acc[curr.Game] = curr;
						return acc;
					}, {});
			}
		}
	}

	async mount(): Promise<void>
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

	async provide(appId: number): Promise<CompatdataData | undefined>
	{
		return await this.throttle(async () => {
			const overview = appStore.GetAppOverviewByAppID(appId);
			const closest_names = distanceWithLimit(5, overview.display_name ?? "", Object.keys(this.verifiedDB));
			let results = closest_names.map(n => this.verifiedDB[n]);
			let consoleNames = await this.getConsoleNames(appId);
			if(consoleNames?.length)
				results = results.filter(r => consoleNames.indexOf(r.Console) !== -1);

			return {
				deck_compat_category: Math.max(
					SteamDeckCompatCategory.UNKNOWN,
					...results.map(r => {
						if (r.Boots == YesNo.YES && r.Playable == YesNo.YES)
							return SteamDeckCompatCategory.VERIFIED;
						else if (r.Boots == YesNo.YES && (r.Playable == YesNo.NO || r.Playable == YesNo.PARTIAL))
							return SteamDeckCompatCategory.PLAYABLE;
						else
							return SteamDeckCompatCategory.UNSUPPORTED;
					})
				),
				notes: results.map(r => r.Notes).filter(n => n)
			};
		});
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		return isEmulatedGame(getLaunchCommand(details));
	}

	settingsComponent(): FC
	{
		return () => undefined;
	}

}