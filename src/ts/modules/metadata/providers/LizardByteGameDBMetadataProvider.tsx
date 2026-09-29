import { StoreCategory, type MetadataData } from "../../../Interfaces";
import Logger from "../../../logger";
import { t } from "../../../useTranslations";
import type { MetadataProviderConfigs } from "../MetadataModule";
import { type FuzzySearchMetadataProviderConfig, type FuzzySearchMetadataProviderCache, FuzzySearchMetadataProvider } from "./FuzzySearchMetadataProvider";
import { fetchNoCors } from "@decky/api";
import { distanceWithLimit, getAppDetails } from "../../../util";
import type { Company, Game, GameMode, InvolvedCompany, ExternalGame, ReleaseDate} from "igdb-api-types";
import { SteamMetadataProvider } from "./SteamMetadataProvider";
import { getLaunchCommand, getShortcutCategories } from "../../../shortcuts";
import { SiIgdb } from "react-icons/si";

export interface LizardByteGameDBMetadataProviderConfig extends FuzzySearchMetadataProviderConfig
{
	
}

export interface LizardByteGameDBMetadataProviderCache extends FuzzySearchMetadataProviderCache
{
	
}

// IGDB-like
export class LizardByteGameDBMetadataProvider extends FuzzySearchMetadataProvider
{
	static identifier: keyof MetadataProviderConfigs = "lizardbyte";
	static title: string = t("providerMetadataLizardByteGameDB");
	identifier: keyof MetadataProviderConfigs = LizardByteGameDBMetadataProvider.identifier;
	title: string = LizardByteGameDBMetadataProvider.title;

	logger: Logger = new Logger(LizardByteGameDBMetadataProvider.identifier)
	
	private _steamProvider?: SteamMetadataProvider;
	get steamProvider(): SteamMetadataProvider
	{
		if(!this._steamProvider){
			this._steamProvider = this.module.providers.find(p => p instanceof SteamMetadataProvider);
			if(!this._steamProvider)
				this._steamProvider = new SteamMetadataProvider(this.module);
		}

		return this._steamProvider;
	}

	protected async search(title: string): Promise<MetadataData[]>
	{
		if(!title?.length)
			return [];

		// Retrieve the first two letters to search for the title first, based on these rules:
		// - 2 alphanumeric ascii chars: regular search <aa>.json
		// - 1 alphanumeric ascii char + 1 non-alphanumeric ascii char (-.#[@): first char search <a>.json
		// - 1st or 2nd non-ascii chars: @.json
		let bucket: string;
		let firstChar = title.toLowerCase().charCodeAt(0);
		let secondChar = title.length > 1 ? title.toLowerCase().charCodeAt(1) : undefined;
		if(firstChar >= 32 && firstChar <= 126 && (!secondChar || (secondChar >= 32 && secondChar <= 126))){
			if (secondChar &&
				((firstChar >= 30 && firstChar <= 39) || (firstChar >= 97 && firstChar <= 122)) &&
				((secondChar >= 30 && secondChar <= 39) || (secondChar >= 97 && secondChar <= 122))){

				bucket = title.substring(0, 2).toLowerCase();
			}
			else
				bucket = title.charAt(0).toLowerCase();
		}
		else
			bucket = "@";

		let response = await fetchNoCors(`https://app.lizardbyte.dev/GameDB/buckets/${bucket}.json`);
		if(!response.ok)
			return [];

		let result: Record<string, { name: string; }> = await response.json();
		
		// Search with double the fuzziness to retrieve them all, they will be filtered later
		const closest_names = distanceWithLimit(this.fuzziness * 2, title, Object.values(result).map(e => e.name));
		// Take max 10 results (since we might have different regions)
		let results = Object.entries(result)
			.filter(e => closest_names.includes(e[1].name))
			.slice(0, 10);

		// Retrieve just titles, then we'll query everything
		return results.map(([id, entry]) => ({
			id: id,
			title: entry.name,

			// Will enrich later
			description: '',
			store_categories: []
		}));
	}

	protected override async enrichMetadataForGame(appId: number, game: MetadataData): Promise<void> {
		if(game.description)
			return;

		const response = await fetchNoCors(`https://app.lizardbyte.dev/GameDB/games/${game.id}.json`);
		if (!response.ok){
			game.description = t("noDescription"); // To not enrich again
			return;
		}
			
		let gameR: Game = await response.json();

		if(gameR.release_dates?.length)
			game.release_date = Math.floor(new Date(Math.min(...gameR.release_dates.map(d => (d as ReleaseDate).date!)) * 1000).getTime() / 1000);
		
		const details = (await getAppDetails(appId))!;
		const cats = await getShortcutCategories(getLaunchCommand(details));

		// If we have a steam id we query that first to get more accurate results
		if(gameR.external_games?.some(g => typeof g !== 'number' && (g as any).external_game_source?.id === 1)){
			let steam = await this.steamProvider.getAppMetadata(
				(gameR.external_games?.find(g => typeof g !== 'number' && (g as any).external_game_source?.id === 1) as ExternalGame)?.uid ?? '');
			if(steam){
				steam.release_date = game.release_date;
				steam.store_categories.push(...cats);

				Object.assign(game, steam);

				game.description ??= t("noDescription"); // To not enrich again
				return;
			}
		}
		
		game.description = (gameR.summary ?? gameR.storyline) || t("noDescription");
		game.rating = gameR.aggregated_rating;
		if(gameR.involved_companies?.some(c => typeof c !== 'number' && typeof c.company !== 'number' && c.company?.name && c.developer)){
			game.developers = gameR.involved_companies
				.filter(c => typeof c !== 'number' && typeof c.company !== 'number' && c.developer)
				.map(c => ({ name: ((c as InvolvedCompany).company as Company).name!, url: '' }));
		}
		if(gameR.involved_companies?.some(c => typeof c !== 'number' && typeof c.company !== 'number' && c.company?.name && !c.developer)){
			game.publishers = gameR.involved_companies
				.filter(c => typeof c !== 'number' && typeof c.company !== 'number' && !c.developer)
				.map(c => ({ name: ((c as InvolvedCompany).company as Company).name!, url: '' }));
		}

		const gameModesMatching: Record<number, StoreCategory> = {
			1: StoreCategory.SinglePlayer,
			2: StoreCategory.MultiPlayer,
			3: StoreCategory.CoOp,
			4: StoreCategory.SplitScreen,
			5: StoreCategory.MMO
		};
		if(gameR.game_modes?.some(m => typeof m !== 'number' && gameModesMatching[m.id])){
			game.store_categories = gameR.game_modes
				.map(m => gameModesMatching[(m as GameMode).id])
				.filter(m => m);
		}

		if(gameR.multiplayer_modes?.length){
			for(let multiplayerMode of gameR.multiplayer_modes){
				if(typeof multiplayerMode === 'number')
					continue;
				
				if(multiplayerMode.onlinecoop)
					game.store_categories.push(StoreCategory.OnlineCoOp);
				if(multiplayerMode.offlinecoop)
					game.store_categories.push(StoreCategory.LocalCoOp);
				if(multiplayerMode.splitscreen || multiplayerMode.splitscreenonline)
					game.store_categories.push(StoreCategory.SplitScreen);
				if(multiplayerMode.onlinecoop || multiplayerMode.splitscreenonline)
					game.store_categories.push(StoreCategory.OnlineMultiPlayer);
				if(multiplayerMode.offlinecoop || multiplayerMode.lancoop || multiplayerMode.splitscreen)
					game.store_categories.push(StoreCategory.LocalMultiPlayer);
			}
		}
	}

	override icon = <SiIgdb/>;
}