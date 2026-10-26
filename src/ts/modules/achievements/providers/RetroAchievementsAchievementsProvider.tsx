import type { AchievementsData, ID } from "../../../Interfaces"
import { t } from "../../../useTranslations"
import { copyToClipboard, fetchNoCorsLegacyTimeout, getAppDetails, toasterToast } from "../../../util"
import type { ProviderCache, ProviderConfig } from "../../Provider"
import { AchievementsProvider } from "../AchievementsProvider"
import Logger from "../../../logger"
import { DialogButton, DialogControlsSection, Field, sleep, TextField, Toggle } from "@decky/ui"
import { GetGameInfoAndUserProgressResponse } from "@retroachievements/api";
import { FaGamepad } from "react-icons/fa"
import { useMetaDeckState } from "../../../MetaDeckState"
import { useState } from "react"
import { Markdown } from "../../../markdown"
import React from "react"

export interface RetroAchievementsAchievementsProviderConfig extends ProviderConfig<'ra'>{
	username: string;
	api_key: string;
	points: boolean;
	// https://github.com/RetroAchievements/RAWeb/blob/fa58a24122f80e86e401443514800a49d344b7d1/public/API/API_GetGameInfoAndUserProgress.php#L31
	achievement_types: boolean;
	parent_sets: boolean; // One set per parent or one single base set
	subsets: boolean;
	subsets_sets: boolean;
}

export interface RetroAchievementsAchievementsProviderCache extends ProviderCache{
	// Cache lasts max 5 mins, to allow achievements and metadata to retrieve the same result
	game_info: Record<ID, GetGameInfoAndUserProgressResponse & {
		retrieved: number; // Date.getTime()
	}>;
}

export class RetroAchievementsAchievementsProvider extends AchievementsProvider<"ra">{
	identifier = "ra" as const;
	title = t("providerAchievementsRA");

	logger = new Logger(this.identifier);

	private parentSubsets: Record<ID, ID[]> = {}; // Parent ID, subset IDs

	override get isValid(): boolean {
		return super.isValid && !!this.username && !!this.apiKey;
	}

	get username(): string{
		return this.config.username;
	}

	set username(data: string){
		this.config.username = data;
		void this.saveConfig();
	}

	get apiKey(): string{
		return this.config.api_key;
	}

	set apiKey(data: string)
	{
		this.config.api_key = data;
		void this.saveConfig();
	}

	get points(): boolean
	{
		return this.config.points;
	}

	set points(data: boolean)
	{
		let current = this.points;
		this.config.points = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get achievementTypes(): boolean
	{
		return this.config.achievement_types;
	}

	set achievementTypes(data: boolean)
	{
		let current = this.achievementTypes;
		this.config.achievement_types = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get parentSets(): boolean
	{
		return this.config.parent_sets;
	}

	set parentSets(data: boolean)
	{
		let current = this.parentSets;
		this.config.parent_sets = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get subsets(): boolean
	{
		return this.config.subsets;
	}

	set subsets(data: boolean)
	{
		let current = this.subsets;
		this.config.subsets = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get subsetsSets(): boolean
	{
		return this.config.subsets_sets;
	}

	set subsetsSets(data: boolean)
	{
		let current = this.subsetsSets;
		this.config.subsets_sets = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	get gameInfo(): RetroAchievementsAchievementsProviderCache['game_info']
	{
		return this.cache.game_info;
	}

	private async raRequest(url: string): Promise<Response>{
		let retry = 0;
		let sleep_ms = 2000;
		while (retry < 5){
			if (retry > 0){
				await sleep(sleep_ms);
				sleep_ms *= 2;
			}

			const response = await this.throttle(() => fetchNoCorsLegacyTimeout(url, 'GET'));
			if (response.status == 429 || response.status == 504 || response.status == 500){
				this.logger.debug(`Response status was ${response.status}, retrying`, retry);
				retry++;
			}
			else if (response.status == 200)
				return response;
			else{
				// Clear to avoid errors
				if(response.status == 403){
					toasterToast(t("apiKeyError"), this);

					this.apiKey = '';
				}

				this.logger.debug(`Response status was ${response.status}`);
				throw new Error(`${response.status}`);
			}
		}

		throw new Error("Maximum retries exceeded");
	}

	override async mount(): Promise<void> {
		let init = false;
		try{
			// Retrieve consoles list
			let response = await this.raRequest(`https://retroachievements.org/API/API_GetConsoleIDs.php?` + new URLSearchParams({
					y: this.apiKey,
					a: '1',
					g: '1'
				}).toString());
			if(!response.ok)
				return;

			let consoles: { ID: number; }[] = await response.json();
			if(!consoles.length)
				return;

			// For each console retrieve all games
			for(let console of consoles){
				let response = await this.raRequest(
				`https://retroachievements.org/API/API_GetGameList.php?` + new URLSearchParams({
					y: this.apiKey,
					i: console.ID.toString(),
					f: '1',
					h: '1',
					c: '0' // Retrieve all
				}).toString());
				if(!response.ok)
					return;

				let games: {
					Title: string;
					ID: number;
				}[] = await response.json();
				for(let game of games){
					let matchingGames = games.filter(g => g.ID !== game.ID && g.Title.startsWith(game.Title) && g.Title.toLowerCase().includes("subset"));
					if(!matchingGames.length)
						continue;

					this.parentSubsets[game.ID] = matchingGames.map(g => g.ID);
				}
			}

			this.logger.debug("Parent/subsets", this.parentSubsets);
			
			init = true;
		}
		finally{
			if(!init)
				toasterToast(t("initError"), this);
		}
	}

	provide(appId: number): Promise<AchievementsData | undefined> {
		return this.throttle(async () => {
			let game = await this.getGameInfoAndProgress(appId);

			this.logger.debug(`${appId} game: `, game);

			if(!game)
				return undefined;
			
			const details = await getAppDetails(appId);
			if (!details)
				return undefined;

			// Retrieve parent game
			let parents: Record<ID, typeof game> = { [game.ID]: game };
			while((game as any).ParentGameID){
				let newGame = await this.getGameInfoAndProgressInternal((game as any).ParentGameID);
				if(!newGame)
					break;

				parents[game.ID] = newGame;
				newGame = game;
			}

			const parentGame = game;

			// Retrieve all subsets if needed
			let subsets: Record<ID, typeof game> = {};
			if(this.subsets){
				for(let gameId of Object.keys(parents)){
					if(!this.parentSubsets[gameId])
						continue;

					for(let subsetId of this.parentSubsets[gameId]){
						if(parents[subsetId])
							continue;

						game = await this.getGameInfoAndProgressInternal(subsetId);
						if(!game)
							continue;

						parents[game.ID] = game;
					}
				}
			}
			
			// 1 + ... + 1 sets (achievementTypes=false)
			// 1 + 3 + ... + 1 + 3 sets (achievementTypes=true)
			let multipleParents = (Object.keys(parents).length > 1 && this.parentSets);
			let multipleSubsets = (Object.keys(subsets).length && this.subsets && this.subsetsSets);
			let result: AchievementsData = {
				title: details.strDisplayName,
				id: parentGame.ID,

				groups: [parentGame]
					.concat(Object.values(parents).filter(g => g.ID !== parentGame.ID))
					.concat(Object.values(subsets))
					.flatMap(game => {

					let isBase = game.ID === parentGame.ID;
					let isParent = !isBase && parents[game.ID];
					let multipleSets = (isParent ? multipleParents : multipleSubsets);
					if(!multipleSets && !isBase)
						return [];

					let subsetTitle = isBase ?
						'' :
						game.Title.match(/\[subset\s*-\s*(.+)\s*\]/i)?.[1]
							?? game.Title;

					if(!this.achievementTypes){
						return [{
							name: subsetTitle,
							achievements: []
						}];
					}
					else{
						if(multipleSets && isBase)
							subsetTitle = t("defaultAchievementSet");
						let baseName = (multipleSets ? `${subsetTitle} - ` : "");
						return [
							{
								name: subsetTitle,
								achievements: []
							},
							{
								name: baseName + t("raAchievementTypeProgression"),
								achievements: []
							},
							{
								name: baseName + t("raAchievementTypeMissable"),
								achievements: []
							},
							{
								name: baseName + t("raAchievementTypeCompletion"),
								achievements: []
							}
						];
					}
				})
			};

			this.logger.debug(`${appId} groups: `, result.groups);

			let i = 0;
			for(let game of [parentGame]
				.concat(Object.values(parents).filter(g => g.ID !== parentGame.ID))
				.concat(Object.values(subsets))){

				let isBase = game.ID === parentGame.ID;
				let isParent = !isBase && parents[game.ID];
				let isBaseGroup = !isBase && !(isParent ? multipleParents : multipleSubsets); // Base does not default to 0 group, but it is 0 group

				let subsetTitle = ((!this.module.hasAchievementSetsSupport && (multipleParents || multipleSubsets) && !isBase && !isBaseGroup) ? 
					(game.Title.match(/\[subset\s*-\s*(.+)\s*\]/i)?.[1]
						?? game.Title) : 
					undefined);

				for(let achievement of Object.values(game.Achievements)
					.sort((a, b) => Number(a.DisplayOrder) - Number(b.DisplayOrder))){
						
					let achieved = !!achievement.DateEarned;

					let groupId = isBaseGroup ? 0 : i;
					let achievementType: string | undefined = undefined;
					if(this.achievementTypes){
						switch((achievement as any).Type){
						case 'progression':
							groupId = (groupId * 4) + 1;
							if(!this.module.hasAchievementSetsSupport)
								achievementType = t("raAchievementTypeProgression");
							break;
						case 'missable':
							groupId = (groupId * 4) + 2;
							if(!this.module.hasAchievementSetsSupport)
								achievementType = t("raAchievementTypeMissable");
							break;
						case 'win_condition':
							groupId = (groupId * 4) + 3;
							if(!this.module.hasAchievementSetsSupport)
								achievementType = t("raAchievementTypeCompletion");
							break;
						default:
							groupId = (groupId * 4) + 0;
							break;
						}
					}
						
					result.groups[groupId].achievements.push({
						bAchieved: achieved,
						bHidden: false,
						flAchieved: (((achievement.NumAwarded ? Number(achievement.NumAwarded) : 0) / (game.NumDistinctPlayersCasual ? Number(game.NumDistinctPlayersCasual) : 1)) * 100.0),
						rtUnlocked: achieved ?
							(achievement.DateEarnedHardcore ? ((new Date(achievement.DateEarnedHardcore).getTime() / 1000) + (new Date(achievement.DateEarnedHardcore).getTimezoneOffset() * 60)) :
								achievement.DateEarned ? ((new Date(achievement.DateEarned).getTime() / 1000) + (new Date(achievement.DateEarned).getTimezoneOffset() * 60)) :
								0) :
							0,
						strDescription: [
							subsetTitle,
							(this.points ? `${achievement.Points} CP` : undefined),
							achievementType,
							achievement.Description
						].filter(d => d).join(' - '),
						strID: achievement.ID,
						strImage: `https://media.retroachievements.org/Badge/${achievement.BadgeName}.png`,
						strImageLocked: `https://media.retroachievements.org/Badge/${achievement.BadgeName}_lock.png`,
						strName: achievement.Title
					});
				}

				if(!isBaseGroup)
					i++;
			}

			return result;
		});
	}

	override icon = <FaGamepad/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [username, setUsername] = useState(this.username);
		const [apiKey, setApiKey] = useState(this.apiKey);
		const [subsets, setSubsets] = useState(this.subsets);
		const [points, setPoints] = useState(this.points);
		const [achievementTypes, setAchievementTypes] = useState(this.achievementTypes);
		const [parentSets, setParentSets] = useState(this.parentSets);
		const [subsetsSets, setSubsetsSets] = useState(this.subsetsSets);

		const authUrl = "https://retroachievements.org/controlpanel.php";

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("username")}
						description={
							<TextField
								value={username}
								disabled={loadingData.loading}
								onChange={(event) => {
									setUsername(event.target.value);
									this.username = event.target.value;
								}}/>
						} />
					<Field
						label={t("apiKey")}
						description={
							<TextField
								value={apiKey}
								disabled={loadingData.loading}
								onChange={(event) => {
									setApiKey(event.target.value);
									this.apiKey = event.target.value;
								}}/>
						} />
					<Field description={
						<>
							<Markdown>{t("raApiKeyInstructionsMD")
								.replace("{raUrl}", `[retroachievements.org](${authUrl})`)}</Markdown>
							<DialogButton
								onClick={() => void copyToClipboard(authUrl)}>
								{t("copyAuthUrl")}
							</DialogButton>
						</>
					} />
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("raSubsets")}
						description={t("raSubsetsDesc")}>
						<Toggle
							value={subsets}
							onChange={(checked) => {
								setSubsets(checked);
								this.subsets = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("raPoints")}
						description={t("raPointsDesc")}>
						<Toggle
							value={points}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setPoints(checked);
								this.points = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("raAchievementTypesSets") : t("raAchievementTypesPrefix"))}
						description={(this.module.hasAchievementSetsSupport ? t("raAchievementTypesSetsDesc") : t("raAchievementTypesPrefixDesc"))}>
						<Toggle
							value={achievementTypes}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setAchievementTypes(checked);
								this.achievementTypes = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("raParentSetSets") : t("raParentSetPrefixes"))}
						description={(this.module.hasAchievementSetsSupport ? t("raParentSetSetsDesc") : t("raParentSetPrefixesDesc"))}>
						<Toggle
							value={parentSets}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setParentSets(checked);
								this.parentSets = checked;
							}}/>
					</Field>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("raSubsetSetSets") : t("raSubsetSetPrefixes"))}
						description={!subsets ?
							t("settingsDependencyNotMet")
								.replace("{setting1}", (this.module.hasAchievementSetsSupport ? t("raSubsetSetSets") : t("raSubsetSetPrefixes")))
								.replace("{setting2}", t("raSubsets")) :
							(this.module.hasAchievementSetsSupport ? t("raSubsetSetSetsDesc") : t("raSubsetSetPrefixesDesc"))}>
						<Toggle
							value={subsetsSets}
							disabled={loadingData.loading || !subsets}
							onChange={(checked) => {
								setSubsetsSets(checked);
								this.subsetsSets = checked;
							}}/>
					</Field>
				</DialogControlsSection>
			</>
		)
	}


	private async getGameInfoAndProgressInternal(raId: ID): Promise<GetGameInfoAndUserProgressResponse | undefined>{
		// Cache lasts 5 mins
		let game: (typeof this.gameInfo[ID]) | undefined = this.gameInfo[raId];
		if(game && Math.floor(Math.abs(new Date().getTime() - game.retrieved) / (1000 * 60)) < 5)
			return game;

		// Clear cache
		game = undefined;
		delete this.gameInfo[raId];

		const response = await this.raRequest(
			`https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?` + new URLSearchParams({
				y: this.apiKey,
				u: this.username,
				g: raId.toString()
			}).toString());
		game = await response.json();
		if(game){
			game.retrieved = new Date().getTime();
			this.gameInfo[raId] = game;
		}

		return game;
	}

	public async getGameInfoAndProgress(appId: number): Promise<GetGameInfoAndUserProgressResponse | undefined>{
		if(!this.username || !this.apiKey)
			return undefined;
		
		const resolved = await this.resolve(appId, true);
		if (!resolved)
			return undefined;

		return await this.getGameInfoAndProgressInternal(resolved);
	}
}