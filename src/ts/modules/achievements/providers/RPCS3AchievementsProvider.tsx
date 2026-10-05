import { call, fetchNoCors, FileSelectionType, openFilePicker } from "@decky/api";
import Logger from "../../../logger";
import { t } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { type RPCS3NPWRResolverConfigs, type RPCS3NPWRResolverConfig, type RPCS3NPWRResolverCaches, type RPCS3NPWRResolverCache, RPCS3NPWRResolver } from "../../resolvers/RPCS3NPWRResolver";
import type { AchievementsProviderConfigs } from "../AchievementsModule";
import { AchievementsProvider } from "../AchievementsProvider";
import type { AchievementsData } from "../../../Interfaces";
import { getUserTrophiesEarnedForTitle, type AuthTokensResponse, type UserThinTrophy } from "psn-api";
import { fetchNoCorsLegacyTimeout, getAppDetails, grayScaleIcon } from "../../../util";
import { getLaunchCommand, romRegex } from "../../../shortcuts";
import { rpcs3RomPathRegex } from "../../resolvers/MultiId/MultiIdRPCS3Resolver";
import { SiPlaystation3 } from "react-icons/si";
import { useState } from "react";
import { useMetaDeckState } from "../../../MetaDeckState";
import { DialogButton, DialogControlsSection, Field, TextField, Toggle } from "@decky/ui";
import React from "react";
import { Markdown } from "../../../markdown";
import { RAWGMetadataProvider } from "../../metadata/providers/RAWGMetadataProvider";

type RPCS3GameTrophies = {
	trophies: {
		id: string;
		hidden?: boolean;
		type: 'P' | 'G' | 'S' | 'B';
		name: string;
		detail?: string;

		icon: string;
		locked_icon: string;
	}[];
	rarity?: Pick<UserThinTrophy, 'trophyId' | 'trophyEarnedRate'>[];
};

type RPCS3TrophyStatus = {
	unlocked?: boolean;
	unlock_time_utc?: number; // UNIX timestamp
};

type RPCS3GameTrophiesStats = RPCS3GameTrophies & {
	progress?: Record<string, RPCS3TrophyStatus>
};

export interface RPCS3AchievementsProviderConfig extends ProviderConfig<RPCS3NPWRResolverConfigs, RPCS3NPWRResolverConfig>
{
	// Like /home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001
	user_path: string;
	// EN, IT, FR, ... (saved as lowercase)
	language: string;
	trophy_categories: boolean;
	psn_npsso: string; // 64-chars token to access PSN API
}

export interface RPCS3AchievementsProviderCache extends ProviderCache<RPCS3NPWRResolverCaches, RPCS3NPWRResolverCache>
{
	game_trophies: Record<number, RPCS3GameTrophies | null>;
}

/**
 * Retrieves trophies from RPCS3 for installed games and folders, even not yet installed trophies
 * (for games which have not been run yet), and optionally retrieves trophies rarity from PSN
 */
export class RPCS3AchievementsProvider extends AchievementsProvider<any>{
	static identifier: keyof AchievementsProviderConfigs = "rpcs3";
	static title: string = t("providerCompatdataRPCS3");
	identifier: keyof AchievementsProviderConfigs = RPCS3AchievementsProvider.identifier;
	title: string = RPCS3AchievementsProvider.title;

	logger: Logger = new Logger(RPCS3AchievementsProvider.identifier);

	resolvers: RPCS3NPWRResolver[] = [
		new RPCS3NPWRResolver(this)
	];

	private _psnTokens?: AuthTokensResponse;
	private _psnTokensExpiration?: Date;

	private _rawgProvider?: RAWGMetadataProvider;
	get rawgProvider(): RAWGMetadataProvider
	{
		if(!this._rawgProvider){
			this._rawgProvider = this.state.modules.metadata.providers.find(p => p instanceof RAWGMetadataProvider);
			if(!this._rawgProvider)
				this._rawgProvider = new RAWGMetadataProvider(this.state.modules.metadata);
		}

		return this._rawgProvider;
	}

	get userPath(): string
	{
		return (this.config as RPCS3AchievementsProviderConfig).user_path;
	}

	set userPath(data: string)
	{
		(this.config as RPCS3AchievementsProviderConfig).user_path = data;
		void this.module.saveData();
	}

	get language(): string
	{
		return (this.config as RPCS3AchievementsProviderConfig).language;
	}

	set language(data: string)
	{
		(this.config as RPCS3AchievementsProviderConfig).language = data;
		void this.module.saveData();
	}

	get trophyCategories(): boolean
	{
		return (this.config as RPCS3AchievementsProviderConfig).trophy_categories;
	}

	set trophyCategories(data: boolean)
	{
		(this.config as RPCS3AchievementsProviderConfig).trophy_categories = data;
		void this.module.saveData();
	}

	get PSNNPSSO(): string
	{
		return (this.config as RPCS3AchievementsProviderConfig).psn_npsso;
	}

	set PSNNPSSO(data: string)
	{
		(this.config as RPCS3AchievementsProviderConfig).psn_npsso = data;
		void this.module.saveData();
	}

	get gameTrophies(): Record<number, RPCS3GameTrophies | null>{
		return (this.cache as RPCS3AchievementsProviderCache).game_trophies;
	}

	override async mount(): Promise<void> {
		await super.mount();

		if(this.userPath){
			try{
				if(!await call<[string], boolean>("rpcs3_check_user_path", this.userPath))
					throw new Error("");

				if(!this.resolvers[0].hddPath)
					this.resolvers[0].hddPath = this.userPath.split('/dev_hdd0/home/')[0] + '/dev_hdd0/';
			}
			catch{
				this.userPath = "";
				if(this.resolvers[0].hddPath)
					this.resolvers[0].hddPath = "";
			}
		}

		if(this.language.toLowerCase() != "en"){
			let locale = await call<[string], number | null>("rpcs3_locale_to_ps3", this.language.toLowerCase());
			if(locale == null)
				this.language = "EN";
		}

		if(this.PSNNPSSO){
			try{
				// DEV: https://github.com/SteamDeckHomebrew/decky-loader/issues/960
				const accessCodeResponse = await DeckyPluginLoader.legacyFetchNoCors(
					'https://ca.account.sony.com/api/authz/v3/oauth/authorize?' + new URLSearchParams({
						access_type: "offline",
						client_id: "09515159-7237-4370-9b40-3806e67c0891",
						redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
						response_type: "code",
						scope: "psn:mobile.v2.core psn:clientapp"
					}).toString(),
					{
						method: 'GET',
						headers: {
							Cookie: `npsso=${this.PSNNPSSO}`
						},
						allow_redirects: false
					});
				if(!accessCodeResponse.success || typeof accessCodeResponse.result === 'string' || !accessCodeResponse.result?.headers["Location"]?.includes("?code=")){
					this.PSNNPSSO = "";
				}
				else{
					const accessCode = new URLSearchParams(accessCodeResponse.result.headers["Location"]!.split("redirect/")[1]).get('code')!;
					/*const accessCodeResponse = await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth/authorize?' + new URLSearchParams({
							access_type: "offline",
							client_id: "09515159-7237-4370-9b40-3806e67c0891",
							redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
							response_type: "code",
							scope: "psn:mobile.v2.core psn:clientapp"
						}).toString(), {
						headers: {
							Cookie: `npsso=${this.state.settings.rpcs3.npsso}`
						},
						redirect: 'manual'
					});
					if(!accessCodeResponse.headers.get("location")?.includes("?code=")){
						throw new Error(`
							There was a problem retrieving your PSN access code. Is your NPSSO code valid?
							To get a new NPSSO code, visit https://ca.account.sony.com/api/v1/ssocookie.`);
					}
					const accessCode = new URLSearchParams(accessCodeResponse.headers.get("location")!.split("redirect/")[1]).get('code')!;*/

					const psnTokens = await (await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth/token', {
						method: 'POST',
						headers: {
							"Content-Type": "application/x-www-form-urlencoded",
							Authorization: "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A="
						},
						body: new URLSearchParams({
							code: accessCode,
							redirect_uri: "com.scee.psxandroid.scecompcall://redirect",
							grant_type: "authorization_code",
							token_format: "jwt"
						}).toString()
					})).json();
					this._psnTokens = {
						accessToken: psnTokens.access_token,
						expiresIn: psnTokens.expires_in,
						idToken: psnTokens.id_token,
						refreshToken: psnTokens.refresh_token,
						refreshTokenExpiresIn: psnTokens.refresh_token_expires_in,
						scope: psnTokens.scope,
						tokenType: psnTokens.token_type
					};
					this._psnTokensExpiration = new Date();
					this._psnTokensExpiration.setSeconds(this._psnTokensExpiration.getSeconds() + this._psnTokens.expiresIn - 10);
				}
			}
			catch{
				this.PSNNPSSO = "";
			}
		}
	}

	override async provide(appId: number): Promise<AchievementsData | undefined> {
		if(!this.userPath || !this.resolvers[0].hddPath || this.excludedApps.indexOf(appId) !== -1)
			return undefined;
		
		if(this.gameTrophies[appId] === null)
			return undefined;
		
		const trophyId = await this.resolve(appId);
		if(!trophyId){
			this.gameTrophies[appId] = null;
			return undefined;
		}

		const details = await getAppDetails(appId);
		if (!details){
			this.gameTrophies[appId] = null;
			return undefined;
		}
		
		// Retrieve from cache first, since trophies data does not change
		let trophies: RPCS3GameTrophiesStats;
		let fromGameFolder = false; // True if retrieved from game folder (0 achieved)
		if(this.gameTrophies[appId])
			trophies = { ...this.gameTrophies[appId] };
		else {
			const launchCommand = getLaunchCommand(details);
			const rom = launchCommand.match(new RegExp(romRegex, "i"))?.[0];
			if(!rom){
				this.gameTrophies[appId] = null;
				return undefined;
			}

			let romFolder = rom.match(new RegExp(rpcs3RomPathRegex))?.[1];
			if(!romFolder){
				this.gameTrophies[appId] = null;
				return undefined;
			}

			// Try retrieving the trophies from the user directory first
			let result = await call<[string, string], string>("rpcs3_get_all_trophies_user", this.userPath, trophyId.toString()) ?? null;
			trophies = JSON.parse(result ?? '{}') as RPCS3GameTrophies;

			// If we found nothing we search the game folder
			let titleId: string | null | undefined;
			if(!trophies.trophies.length){
				if(romFolder)
					result = await call<[string, string], string>("rpcs3_get_all_trophies_game", romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", this.language.toLowerCase()) ?? null;
				else{
					if(titleId === undefined)
						titleId = await call<[string], string | null>("rpcs3_get_titleid", romFolder) ?? null;
					if(titleId)
						result = await call<[string, string], string>("rpcs3_get_all_trophies_game", this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", this.language.toLowerCase()) ?? null;
					else
						result = '';
				}

				if(result){
					trophies = JSON.parse(result ?? '{}') as RPCS3GameTrophies;
					fromGameFolder = true;
				}
			}

			// Retrieve trophies rarity, from PSN or RAWG,
			// Also if we have RAWG we retrieve trophies icons to save on data size instead of using base 64
			if(this._psnTokens){
				// Refresh the token if needed
				if(this._psnTokensExpiration && new Date() >= this._psnTokensExpiration){
					try{
						this._psnTokens = await (await fetchNoCors('https://ca.account.sony.com/api/authz/v3/oauth', {
							method: 'POST',
							headers: {
								"Content-Type": "application/x-www-form-urlencoded",
								Authorization: "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A="
							},
							body: new URLSearchParams({
								refresh_token: this._psnTokens.refreshToken,
								grant_type: "refresh_token",
								token_format: "jwt",
								scope: "psn:mobile.v2.core psn:clientapp"
							}).toString()
						})).json()
					}
					catch(e){
						this.logger.debug(`${appId} PSN token refresh error`, e);
						this._psnTokens = undefined;
						this._psnTokensExpiration = undefined;
					}
				}

				if(this._psnTokens){
					// Try PSN accounts with most PS3 games/trophies in order (https://psnprofiles.com/leaderboard/ps3),
					// since PSN API requires an account to see trophies rarity but the we have no official user here...
					const psnAccounts = [
						'69542030923328854',
						'8477639012129454573',
						'7390413838940571081'
					];
					for(let accountId of psnAccounts){
						try{
							// npServiceName=trophy: PS3 trophies
							let rarity: Awaited<ReturnType<typeof getUserTrophiesEarnedForTitle>> = await (await fetchNoCorsLegacyTimeout(
								`https://m.np.playstation.com/api/trophy/v1/users/${accountId}/npCommunicationIds/${trophyId}/trophyGroups/all/trophies?npServiceName=trophy`,
								'GET',
								{
									headers: {
										Authorization: `Bearer ${this._psnTokens.accessToken}`,
										"Content-Type": "application/json",
									}
								})).json();
							if(rarity.trophies.length){
								trophies.rarity = rarity.trophies;
								this.logger.debug(`${appId} rarity: `, trophies.rarity);
								break;
							}
						}
						catch{ }
					}
				}
			}
			if(this.rawgProvider.enabled && this.rawgProvider.apiKey){
				const rawgAchievements = await this.rawgProvider.getAchievementsForGame(appId);

				// If we have trophies we'll need to match them with local ones, but we need english titles
				if(rawgAchievements?.length){
					let trophiesNames: Record<string, string> = {}; // English name: trophy id ("001", "002")
					if(this.language.toLowerCase() == "en"){
						for(let trophy of trophies.trophies){
							trophiesNames[trophy.name] = trophy.id;
						}
					}
					else{
						if(romFolder)
							result = await call<[string, string], string>("rpcs3_get_all_trophies_game", romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", "en") ?? null;
						else{
							if(titleId === undefined)
								titleId = await call<[string], string | null>("rpcs3_get_titleid", romFolder) ?? null;
							if(titleId)
								result = await call<[string, string], string>("rpcs3_get_all_trophies_game", this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", "en") ?? null;
							else
								result = '';
						}

						if(result){
							let englishTrophies = JSON.parse(result ?? '{}') as RPCS3GameTrophies;
							for(let trophy of englishTrophies.trophies){
								trophiesNames[trophy.name] = trophy.id;
							}
						}
					}

					if(Object.keys(trophiesNames).length){
						let setTrophies = !trophies.rarity;
						if(setTrophies)
							trophies.rarity = [];
						for(let achievement of rawgAchievements){
							let trophyId = trophiesNames[achievement.name];

							if(!trophyId)
								continue;

							if(setTrophies){
								trophies.rarity!.push({
									trophyId: parseInt(trophyId, 10),
									trophyEarnedRate: achievement.percent
								});
							}

							trophies.trophies.find(t => t.id === trophyId)!.icon = achievement.image;
						}
					}
				}
			}

			// Retrieve trophies icons if needed and create grayscale versions for locked
			for(let trophy of trophies.trophies){
				if(!trophy.icon){
					// Retrieve from user folder first, then default to game
					if(!fromGameFolder)
						trophy.icon = await call<[string, string, string], string>("rpcs3_get_trophy_icon_user", this.userPath, trophyId.toString(), trophy.id) ?? '';
					
					if(!trophy.icon){
						if(titleId === undefined)
							titleId = await call<[string], string | null>("rpcs3_get_titleid", romFolder) ?? null;
						if(romFolder)
							trophy.icon = await call<[string, string], string>("rpcs3_get_trophy_icon_game", romFolder + "/TROPDIR/" + trophyId + "/TROPHY.TRP", trophy.id) ?? '';
						else if(titleId)
							trophy.icon = await call<[string, string], string>("rpcs3_get_trophy_icon_game", this.resolvers[0].hddPath + "game/" + titleId + "/TROPDIR/" + trophyId + "/TROPHY.TRP", trophy.id) ?? '';
					}
				}
				
				// Create a locked grayscale version
				if(trophy.icon)
					trophy.locked_icon = await grayScaleIcon(trophy.icon);
				else
					trophy.locked_icon = '';
			}

			this.gameTrophies[appId] = trophies.trophies.length ? { ...trophies } : null;
		}

		if(!trophies.trophies.length)
			return undefined;

		// Retrieve progress for non-game trophies (actually played)
		if(!fromGameFolder){
			let result = await call<[string, string], string>("rpcs3_get_all_trophies_status", this.userPath, trophyId.toString()) ?? null;
			trophies.progress = JSON.parse(result ?? '{}') as Record<string, RPCS3TrophyStatus>;
			this.logger.debug(`${appId} progress: `, trophies.progress);
		}
		else
			this.logger.debug(`${appId} no progress yet`);

		return {
			title: details.strDisplayName,
			id: trophyId,

			achievements: trophies.trophies.map(trophy => {
				let achieved = trophies.progress?.[trophy.id].unlocked === true;

				let trophyIdInt = parseInt(trophy.id, 10);
				let rate = trophies.rarity?.find(t => t.trophyId === trophyIdInt)?.trophyEarnedRate;

				let trophyCategory: string | undefined = undefined;
				if(this.trophyCategories){
					switch(trophy.type){
					case 'B':
						trophyCategory = "🟧";
						break;
					case 'S':
						trophyCategory = "⬜";
						break;
					case 'G':
						trophyCategory = "🟨";
						break;
					case 'P':
						trophyCategory = "💎";
						break;
					}
				}

				return {
					bAchieved: achieved,
					bHidden: trophy.hidden === true,
					flAchieved: rate ? parseFloat(rate) : 0,
					flCurrentProgress: achieved ? 1 : 0,
					flMaxProgress: 1,
					flMinProgress: 0,
					rtUnlocked:
						(achieved && trophies.progress?.[trophy.id]?.unlock_time_utc) ?
							trophies.progress[trophy.id].unlock_time_utc! :
							0,
					strDescription: [
						trophyCategory,
						trophy.detail
					].filter(d => d).join(' - '),
					strID: trophy.id,
					strImage: achieved ? trophy.icon : trophy.locked_icon,
					strName: trophy.name
				};
			})
		};
	}

	override icon = <SiPlaystation3/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [userPath, setUserPath] = useState(this.userPath);
		const [language, setLanguage] = useState(this.language);
		const [trophyCategories, setTrophyCategories] = useState(this.trophyCategories);
		const [PSNNPSSO, setPSNNPSSO] = useState(this.PSNNPSSO);

		const markdown = t("rpcs3UserPathDesc") + "  \n" + 
			t("rpcs3UserPathInstructions") + "  \n" + 
			"![RPCS3 User Accounts](data:image/jpeg;base64,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)"
			;

		const setUserAndHddPath = (user: string) => {
			if(user.endsWith('/'))
				user = user.substring(0, user.length-1);
			setUserPath(user);
			this.userPath = user;
			this.resolvers[0].hddPath = user.split('/dev_hdd0/home/', 1)[0] + '/dev_hdd0/';
		};

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("userPath")}
						description={
							<>
								<TextField
									value={userPath}
									disabled={loadingData.loading}
									onChange={(event) => setUserAndHddPath(event.target.value)}/>
								<Markdown>{markdown}</Markdown>
							</>
						}>
						<DialogButton
							disabled={loadingData.loading}
							onClick={async () => {
								let result = await openFilePicker(FileSelectionType.FOLDER, userPath && userPath != '/home/deck/Emulation/storage/rpcs3/dev_hdd0/home/00000001' ? userPath : '/home', true, true, undefined, undefined, true, true);
								setUserAndHddPath(result.path ?? '');
							}}>
							{t("browse")}
						</DialogButton>
					</Field>
					<Field
						label={t("language")}
						description={
							<>
								<TextField
									value={language}
									disabled={loadingData.loading}
									onChange={(event) => {
										setLanguage(event.target.value);
										this.language = event.target.value;
									}}/>
								<br/>
								<span>{t("languageShortDescription")}</span>
							</>
						} />
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("rpcs3TrophiesCatPrefixes")}
						description={t("rpcs3TrophiesCatPrefixesDesc")}>
						<Toggle
							value={trophyCategories}
							onChange={(checked) => {
								setTrophyCategories(checked);
								this.trophyCategories = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("psnApiKey")}
						description={
							<TextField
								value={PSNNPSSO}
								disabled={loadingData.loading}
								onChange={(event) => {
									setPSNNPSSO(event.target.value);
									this.PSNNPSSO = event.target.value;
								}}/>
						} />
					<Field description={
						<Markdown>
							{t("psnApiKeyInstructionsMD")}
						</Markdown>
					} />
				</DialogControlsSection>
			</>
		)
	}
}