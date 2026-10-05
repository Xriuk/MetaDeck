import type { AchievementsData, ID } from "../../../Interfaces"
import { t } from "../../../useTranslations"
import { fetchNoCorsLegacyTimeout, getAppDetails } from "../../../util"
import type { ProviderCache, ProviderConfig } from "../../Provider"
import type { AchievementsProviderConfigs } from "../AchievementsModule"
import { AchievementsProvider } from "../AchievementsProvider"
import { RetroAchievementsResolver, type RetroAchievementsResolverCaches, type RetroAchievementsResolverConfigs, type RetroAchievementsResolverCache, type RetroAchievementsResolverConfig } from "../../resolvers/RetroAchievementsResolver"
import Logger from "../../../logger"
import { DialogControlsSection, Field, sleep, TextField, Toggle } from "@decky/ui"
import { GetGameInfoAndUserProgressResponse } from "@retroachievements/api";
import { FaGamepad } from "react-icons/fa"
import { useMetaDeckState } from "../../../MetaDeckState"
import { useState } from "react"
import { Markdown } from "../../../markdown"
import React from "react"
import { version } from "@decky/pkg"

export interface RetroAchievementsAchievementsProviderConfig extends ProviderConfig<RetroAchievementsResolverConfigs, RetroAchievementsResolverConfig>
{
	username: string;
	api_key: string;
	points: boolean;
}

export interface RetroAchievementsAchievementsProviderCache extends ProviderCache<RetroAchievementsResolverCaches, RetroAchievementsResolverCache>
{
	// Cache lasts max 5 mins, to allow achievements and metadata to retrieve the same result
	game_info: Record<ID, GetGameInfoAndUserProgressResponse & {
		retrieved: number; // Date.getTime()
	}>;
}

export class RetroAchievementsAchievementsProvider extends AchievementsProvider<any>{
	static identifier: keyof AchievementsProviderConfigs = "ra";
	static title: string = t("providerAchievementsRA");
	identifier: keyof AchievementsProviderConfigs = RetroAchievementsAchievementsProvider.identifier;
	title: string = RetroAchievementsAchievementsProvider.title;

	logger: Logger = new Logger(RetroAchievementsAchievementsProvider.identifier);

	resolvers: RetroAchievementsResolver[] = [
		new RetroAchievementsResolver(this)
	];

	get username(): string
	{
		return (this.config as RetroAchievementsAchievementsProviderConfig).username;
	}

	set username(data: string)
	{
		(this.config as RetroAchievementsAchievementsProviderConfig).username = data;
		void this.module.saveData();
	}

	get apiKey(): string
	{
		return (this.config as RetroAchievementsAchievementsProviderConfig).api_key;
	}

	set apiKey(data: string)
	{
		(this.config as RetroAchievementsAchievementsProviderConfig).api_key = data;
		void this.module.saveData();
	}

	get points(): boolean
	{
		return (this.config as RetroAchievementsAchievementsProviderConfig).points;
	}

	set points(data: boolean)
	{
		(this.config as RetroAchievementsAchievementsProviderConfig).points = data;
		void this.module.saveData();
	}

	get gameInfo(): RetroAchievementsAchievementsProviderCache['game_info']
	{
		return (this.cache as RetroAchievementsAchievementsProviderCache).game_info;
	}

	override test(appId: number, external = false): Promise<boolean> {
		if(!this.username || !this.apiKey || this.excludedApps.indexOf(appId) !== -1)
			return Promise.resolve(false);

		return super.test(appId, external);
	}

	provide(appId: number): Promise<AchievementsData | undefined> {
		if(this.excludedApps.indexOf(appId) !== -1)
			return Promise.resolve(undefined);

		return this.throttle(async () => {
			const game = await this.getGameInfoAndProgress(appId);

			this.logger.debug(`${appId} game: `, game);

			if(!game)
				return undefined;
			
			const details = await getAppDetails(appId);
			if (!details)
				return undefined;
					
			return {
				title: details.strDisplayName,
				id: game.ID,

				achievements: Object.values(game.Achievements)
					.sort((a, b) => Number(a.DisplayOrder) - Number(b.DisplayOrder))
					.map(achievement => {
						let achieved = !!achievement.DateEarned;
				
						return {
							bAchieved: achieved,
							bHidden: false,
							flAchieved: (((achievement.NumAwarded ? Number(achievement.NumAwarded) : 0) / (game.NumDistinctPlayersCasual ? Number(game.NumDistinctPlayersCasual) : 1)) * 100.0),
							flCurrentProgress: achieved ? 1 : 0,
							flMaxProgress: 1,
							flMinProgress: 0,
							rtUnlocked: achieved ?
								(achievement.DateEarnedHardcore ? ((new Date(achievement.DateEarnedHardcore).getTime() / 1000) + (new Date(achievement.DateEarnedHardcore).getTimezoneOffset() * 60)) :
									achievement.DateEarned ? ((new Date(achievement.DateEarned).getTime() / 1000) + (new Date(achievement.DateEarned).getTimezoneOffset() * 60)) :
									0) :
								0,
							strDescription: [
								(this.points ? `${achievement.Points} CP` : undefined),
								achievement.Description
							].filter(d => d).join(' - '),
							strID: achievement.ID,
							strImage: `https://media.retroachievements.org/Badge/${achievement.BadgeName}${(achieved ? "" : "_lock")}.png`,
							strName: achievement.Title
						};
					})
			};
		});
	}

	override icon = <FaGamepad/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [username, setUsername] = useState(this.username);
		const [apiKey, setApiKey] = useState(this.apiKey);
		const [points, setPoints] = useState(this.points);
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
						<Markdown>
							{t("raApiKeyInstructionsMD")}
						</Markdown>
					} />
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
				</DialogControlsSection>
			</>
		)
	}


	public async getGameInfoAndProgress(appId: number): Promise<GetGameInfoAndUserProgressResponse | undefined>{
		if(!this.username || !this.apiKey)
			return undefined;
		
		const resolved = await this.resolve(appId, true);
		if (!resolved)
			return undefined;

		// Cache lasts 5 mins
		let game: (typeof this.gameInfo[ID]) | undefined = this.gameInfo[resolved];
		if(game && Math.floor(Math.abs(new Date().getTime() - game.retrieved) / (1000 * 60)) < 5)
			return game;

		// Clear cache
		game = undefined;
		delete this.gameInfo[resolved];

		// Retry because of RetroAchievements throttling
		let retry = 0;
		let sleep_ms = 2000;
		while (!game && retry < 5){
			if (retry > 0){
				await sleep(sleep_ms);
				sleep_ms *= 2;
			}

			if(!game){
				const response = await fetchNoCorsLegacyTimeout(
					`https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?` + new URLSearchParams({
						z: this.username,
						y: this.apiKey,
						u: this.username,
						g: resolved.toString(),
					}).toString(), 'GET',
					{
						headers: { "User-Agent": `MetaDeck/${version} (+https://github.com/Xriuk/MetaDeck)` }
					});
				if (
					response.status == 429 ||
					response.status == 504 ||
					response.status == 500
				)
				{
					this.logger.debug(`Response status for app id ${appId} (RA id: ${resolved}) was ${response.status}, retrying`, retry);
					retry++;
				}
				else if (response.status == 200){
					game = await response.json();
					if(game)
						game.retrieved = new Date().getTime();

					if(game)
						this.gameInfo[resolved] = game;
					else
						delete this.gameInfo[resolved];

					return game;
				}
				else
				{
					// Clear to avoid errors
					if(response.status == 403)
						this.apiKey = '';

					this.logger.debug(`Response status for app id ${appId} (RA id: ${resolved}) ${response.status}`);
					throw new Error(`${response.status}`);
				}
			}
		}

		throw new Error("Maximum retries exceeded");
	}
}