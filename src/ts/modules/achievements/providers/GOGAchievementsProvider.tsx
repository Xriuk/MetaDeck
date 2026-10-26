import { fetchNoCors } from "@decky/api";
import { inheritSettings, type AchievementsData } from "../../../Interfaces";
import { getLaunchCommand, isGOGGame } from "../../../shortcuts";
import { t } from "../../../useTranslations";
import { copyToClipboard, getAppDetails, toasterToast } from "../../../util";
import { GOGMetadataProvider } from "../../metadata/providers/GOGMetadataProvider";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import { separator } from "../../resolvers/GOG/GOGMetadataProviderResolver";
import { AchievementsProvider } from "../AchievementsProvider";
import Logger from "../../../logger";
import { SiGogdotcom } from "react-icons/si";
import { useState } from "react";
import { useMetaDeckState } from "../../../MetaDeckState";
import { DialogButton, DialogControlsSection, Field, TextField, Toggle } from "@decky/ui";
import React from "react";
import { Markdown } from "../../../markdown";

const clientId = '46899977096215655';
const clientSecret = '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
const redirectUri = 'https://embed.gog.com/on_login_success?origin=client';

type GOGAuthResponse = {
	expires_in: number,
	scope: string,
	token_type: "bearer",
	access_token: string,
	user_id: string,
	refresh_token: string,
	session_id: string
};

export interface GOGAchievementsProviderConfig extends ProviderConfig<'gog_nsl' | 'gog_junk' | 'gog_heroic'>{
	auth_code: string; // Auth code returned by OAuth, replaced automatically by refresh token
	language_set: boolean; // Setting language will override the GOG website, and it cannot be reverted, just in case someone might want control over it
	// Language is inherited from GOGMetadataProvider
	rarity_levels: boolean; 
}

export interface GOGAchievementsProviderCache extends ProviderCache{
	
}

export class GOGAchievementsProvider extends AchievementsProvider<'gog'>{
	identifier = "gog" as const;
	title = t("providerMetadataGOG");

	logger = new Logger(this.identifier);

	private _userId?: string;
	private _bearer?: string;
	private _bearerExpiration?: Date;

	private _gogProvider?: GOGMetadataProvider;
	get gogProvider(): GOGMetadataProvider{
		if(!this._gogProvider){
			this._gogProvider = this.module.providers.find(p => p instanceof GOGMetadataProvider);
			if(!this._gogProvider)
				this._gogProvider = new GOGMetadataProvider(this.state.modules.metadata);
		}

		return this._gogProvider;
	}

	override get isValid(): boolean {
		return super.isValid && !!this.authCode;
	}

	get authCode(): string{
		return this.config.auth_code;
	}

	set authCode(auth_code: string){
		this.config.auth_code = auth_code;
		void this.saveConfig();
	}

	get languageSet(): boolean{
		return this.config.language_set;
	}

	set languageSet(language_set: boolean){
		let current = this.languageSet;
		this.config.language_set = language_set;
		void this.saveConfig();

		if(current != this.languageSet){
			void this.setLanguage();
			void this.clearModuleCache();
		}
	}
	
	get language(): string{
		return this.gogProvider.language;
	}

	set language(language: string | null){
		let current = this.language;
		this.gogProvider.language = language;

		if(current != this.language){
			void this.setLanguage();
			void this.clearModuleCache();
		}
	}

	get rarityLevels(): boolean{
		return this.config.rarity_levels;
	}

	set rarityLevels(data: boolean){
		let current = this.rarityLevels;
		this.config.rarity_levels = data;
		void this.saveConfig();

		if(current != data)
			void this.clearModuleCache();
	}

	private async retrieveRefreshToken(code: string, silent = false): Promise<void>{
		if(!code)
			return;

		try{
			const response = await fetchNoCors(
				`https://auth.gog.com/token?` + new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					grant_type: 'authorization_code',
					code: code,
					redirect_uri: redirectUri
				}).toString());
			if(!response.ok)
				throw new Error();

			const body: GOGAuthResponse = await response.json();

			this._userId = body.user_id;
			this._bearer = body.access_token;
			this._bearerExpiration = new Date();
			this._bearerExpiration.setSeconds(this._bearerExpiration.getSeconds() + body.expires_in - 10);
			
			this.authCode = body.refresh_token;
		}
		catch{
			if(!silent){
				toasterToast(t("apiKeyError"), this);

				this.authCode = "";
			}
		}
	}

	private async refreshRefreshToken(silent = false): Promise<void>{
		if(!this.authCode)
			return;

		try{
			const response = await fetchNoCors(
				`https://auth.gog.com/token?` + new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					grant_type: 'refresh_token',
					refresh_token: this.authCode
				}).toString());
			if(!response.ok)
				throw new Error();

			const body: GOGAuthResponse = await response.json();
			
			this._userId = body.user_id;
			this._bearer = body.access_token;
			this._bearerExpiration = new Date();
			this._bearerExpiration.setSeconds(this._bearerExpiration.getSeconds() + body.expires_in - 10);
			
			this.authCode = body.refresh_token;
		}
		catch{
			if(!silent){
				toasterToast(t("apiKeyError"), this);

				this.authCode = "";
			}
		}
	}

	private async setLanguage(){
		if(!this.setLanguage || !this._bearer)
			return;

		// Set the language if needed
		const response = await fetchNoCors(`https://embed.gog.com/user/changeLanguage/${this.language}`, {
			headers: {
				'Authorization': `Bearer ${this._bearer}`
			}
		});
		if(!response.ok)
			toasterToast(t("initError"), this);
	}

	override async mount(): Promise<void> {
		await this.refreshRefreshToken();

		await this.setLanguage();
	}

	override async test(appId: number, external = false): Promise<boolean> {
		if(!this._userId)
			await this.refreshRefreshToken();
		if(!this._userId)
			return false;

		const details = await getAppDetails(appId);
		if (!details)
			return false;

		// To avoid matching other platforms of resolvers
		if(!isGOGGame(getLaunchCommand(details)))
			return false;

		return await super.test(appId, external);
	}

	override async provide(appId: number): Promise<AchievementsData | null | undefined> {
		if(!this._userId)
			await this.refreshRefreshToken();
		if(!this._userId || !this._bearer)
			return undefined;

		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		
		const resolved = await this.resolve(appId);
		if (!resolved)
			return undefined;

		const [platform, id] = resolved.toString().split(separator);
		if(platform !== "gog")
			return undefined;

		// Refresh the token if needed
		if(this._bearerExpiration && new Date() >= this._bearerExpiration)
			await this.refreshRefreshToken();
		if(!this._userId)
			return undefined;

		const response = await fetchNoCors(`https://gameplay.gog.com/clients/${id}/users/${this._userId}/achievements`, {
			headers: {
				'Authorization': `Bearer ${this._bearer}`
			}
		});
		if(!response.ok)
			return undefined;

		// We don't display only_unlocked_visible achievements, as it might be misleading
		const achievements: {
			items: {
				achievement_id: string;
				achievement_key: string;
				visible: boolean,
				name: string;
				description?: string;
				image_url_unlocked: string;
				image_url_locked?: string;
				rarity: number;
				date_unlocked?: string | null; // Should be ISO time + time offset
				rarity_level_slug: "common" | "uncommon" | "rare" | "epic" | "legendary";
			}[];
			achievements_mode: "only_unlocked_visible" | "all_visible";
		} = await response.json();
		if(!achievements.items.length || achievements.achievements_mode == "only_unlocked_visible")
			return undefined;

		// 1 set (rarityLevels=false)
		// 1 + 4 sets (rarityLevels=true)
		let result: AchievementsData = {
			title: details.strDisplayName,
			id: id,

			groups: [{
				name: '',
				achievements: []
			}].concat(this.rarityLevels ? [
				{
					name: t("gogAchievementRarityLevelCommon"),
					achievements: []
				},
				{
					name: t("gogAchievementRarityLevelUncommon"),
					achievements: []
				},
				{
					name: t("gogAchievementRarityLevelRare"),
					achievements: []
				},
				{
					name: t("gogAchievementRarityLevelEpic"),
					achievements: []
				},
				{
					name: t("gogAchievementRarityLevelLegendary"),
					achievements: []
				}
			] : [])
		};

		this.logger.debug(`${appId} groups: `, result.groups);

		for(let achievement of achievements.items){
			let groupId = 0;
			let rarityLevel: string | undefined = undefined;
			if(this.rarityLevels){
				switch(achievement.rarity_level_slug){
				case 'common':
					groupId = 1;
					if(!this.module.hasAchievementSetsSupport)
						rarityLevel = t("gogAchievementRarityLevelCommon");
					break;
				case 'uncommon':
					groupId = 2;
					if(!this.module.hasAchievementSetsSupport)
						rarityLevel = t("gogAchievementRarityLevelUncommon");
					break;
				case 'rare':
					groupId = 3;
					if(!this.module.hasAchievementSetsSupport)
						rarityLevel = t("gogAchievementRarityLevelRare");
					break;
				case 'epic':
					groupId = 4;
					if(!this.module.hasAchievementSetsSupport)
						rarityLevel = t("gogAchievementRarityLevelEpic");
					break;
				case 'legendary':
					groupId = 5;
					if(!this.module.hasAchievementSetsSupport)
						rarityLevel = t("gogAchievementRarityLevelLegendary");
					break;
				}
			}
			
			result.groups[groupId].achievements.push({
				bAchieved: !!achievement.date_unlocked,
				bHidden: achievement.visible === false,
				flAchieved: achievement.rarity,
				rtUnlocked: achievement.date_unlocked ?
					((new Date(achievement.date_unlocked).getTime() / 1000) + (new Date(achievement.date_unlocked).getTimezoneOffset() * 60)) :
					0,
				strDescription: [
					rarityLevel,
					achievement.description
				].filter(d => d).join(' - '),
				strID: achievement.achievement_key ?? achievement.achievement_id,
				strImage: achievement.image_url_unlocked,
				strImageLocked: achievement.image_url_locked,
				strName: achievement.name
			});
		}

		return result;
	}

	override icon = <SiGogdotcom/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [authCode, setAuthCode] = useState(this.authCode);
		const [userId, setUserId] = useState(this._userId);
		const [languageSet, setLanguageSet] = useState(this.languageSet);
		const [rarityLevels, setRarityLevels] = useState(this.rarityLevels);

		const redirectSplit = redirectUri.split('/');
		const authUrl = "https://auth.gog.com/auth?" + new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			layout: 'client2'
		}).toString();

		const refresh = async () => {
			await this.retrieveRefreshToken(this.authCode, true);
			await this.refreshRefreshToken(true);
			setAuthCode(this.authCode);
			setUserId(this._userId);
		};
		void refresh();

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("apiKey")}
						description={
							<>
								<TextField
									value={authCode}
									disabled={loadingData.loading}
									onChange={(event) => {
										setAuthCode(event.target.value);
										this.authCode = event.target.value;
										
										if(this.authCode.length > 100)
											void refresh();
									}}/>
								{
									(!!userId) && <Field
										label={t("detectedUser")}
										description={userId}/>
								}
							</>
						} />
					<Field description={
						<>
							<Markdown>{t("gogApiKeyInstructionsMD")
								.replace("{gogUrl}", `[auth.gog.com/auth](${authUrl})`)
								.replace("{gogRedirect}", redirectUri.split("://")[0] + "://..." + (redirectUri.indexOf('?') ? `?${redirectUri.split('?')[1]}&` : `/${redirectSplit[redirectSplit.length-1]}?`))}</Markdown>
							<DialogButton
								onClick={() => void copyToClipboard(authUrl)}>
								{t("copyAuthUrl")}
							</DialogButton>
						</>
					} />
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("gogSetLanguage")}
						description={t("gogSetLanguageDesc")}>
						<Toggle
							value={languageSet}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setLanguageSet(checked);
								this.languageSet = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				{inheritSettings(this.gogProvider)()}

				<DialogControlsSection>
					<Field
						label={(this.module.hasAchievementSetsSupport ? t("gogRarityLevelsSets") : t("gogRarityLevelsPrefix"))}
						description={(this.module.hasAchievementSetsSupport ? t("gogRarityLevelsSetsDesc") : t("gogRarityLevelsPrefixDesc"))}>
						<Toggle
							value={rarityLevels}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setRarityLevels(checked);
								this.rarityLevels = checked;
							}}/>
					</Field>
				</DialogControlsSection>
			</>
		)
	}
}