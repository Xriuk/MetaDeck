import { DialogControlsSection, Field, TextField } from "@decky/ui";
import React, { useState } from "react";
import Logger from "../../../logger";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import type { ResolverConfig, ResolverCache } from "../../Resolver";
import type { MetadataProviderConfigs } from "../MetadataModule";
import { MetadataProvider } from "../MetadataProvider";
import { MultiIdDolphinResolver } from "../../resolvers/MultiId/MultiIdDolphinResolver";
import { separator, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import { MultiIdRPCS3Resolver } from "../../resolvers/MultiId/MultiIdRPCS3Resolver";
import { getLaunchCommand, getShortcutCategories, isCemuGame, isDolphinGame, isGameCubeId6, isRPCS3Game, isRyujinxGame } from "../../../shortcuts";
import { getAppDetails } from "../../../util";
import { callable, toaster } from "@decky/api";
import { MetadataData, StoreCategory } from "../../../Interfaces";
import { FaG } from "react-icons/fa6";
import { MultiIdCemuResolver } from "../../resolvers/MultiId/MultiIdCemuResolver";
import type { GlobalResolver } from "../../resolvers/GlobalResolver";
import { RyujinxSerialResolver, type RyujinxSerialResolverCaches, type RyujinxSerialResolverConfigs } from "../../resolvers/RyujinxSerialResolver";

const wiiUrl = "https://www.gametdb.com/wiitdb.zip";
const wiiUUrl = "https://www.gametdb.com/wiiutdb.zip";
const switchUrl = "https://www.gametdb.com/switchtdb.zip";
const ps3Url = "https://www.gametdb.com/ps3tdb.zip";

type GameTDBGame = {
	id: string;
	name: string;
	developer?: string;
	publisher?: string;
	date?: string; // yyyy-MM-dd
	locales?: Record<string, { // Key is language
		title?: string;
		synopsis?: string;
	}>;
	'wi-fi-players'?: number;
	'local-players'?: number;
	controls?: {
		type: string; // Platform-specific
		required?: boolean;
	}[];
};

export interface GameTDBMetadataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'dolphin' | 'cemu' | 'rpcs3'> & RyujinxSerialResolverConfigs, ResolverConfig>
{
	language: string // ZH -> ZHCN / ZHTW (in order)
}

export interface GameTDBMetadataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'dolphin' | 'cemu' | 'rpcs3'> & RyujinxSerialResolverCaches, ResolverCache>
{
	
}

// DEV: add support for DS games
export class GameTDBMetadataProvider extends MetadataProvider<any>{
	resolvers: GlobalResolver<any>[] = [
		new MultiIdDolphinResolver(this),
		new MultiIdCemuResolver(this),
		new RyujinxSerialResolver(this),
		new MultiIdRPCS3Resolver(this)
	];

	static identifier: keyof MetadataProviderConfigs = "gametdb";
	static title: string = t("providerMetadataGameTDB");
	identifier: keyof MetadataProviderConfigs = GameTDBMetadataProvider.identifier;
	title: string = GameTDBMetadataProvider.title;

	logger: Logger = new Logger(GameTDBMetadataProvider.identifier);

	gametdb_get_db = callable<[string]>("gametdb_get_db");
	gametdb_get_entry = callable<[string, string], string | null>("gametdb_get_entry");

	get language(): string
	{
		return this.module.config.providers.gametdb.language;
	}

	set language(language: string)
	{
		this.module.config.providers.gametdb.language = language;
		void this.module.saveConfig();
	}

	override async mount(): Promise<void> {
		await super.mount();

		// Save in backend instead of returning because there's a lot of data
		let errors: any[] = [];
		const urls = [
			wiiUrl, wiiUUrl, switchUrl,
			ps3Url
		];
		for(let url of urls){
			try{
				await this.gametdb_get_db(url);
			}
			catch(e){
				errors.push(e);
			}
		}
		if(errors.length){
			toaster.toast({
				title: `${this.module.title} - ${this.title}`,
				body: t("initError")
			});
			
			this.logger.error("Error while retrieving one or more zip file", errors);
		}
	}

	private getLocalized(
		locales: [string, NonNullable<GameTDBGame['locales']>[string]][],
		predicate: (locale: NonNullable<GameTDBGame['locales']>[string]) => any):
			NonNullable<GameTDBGame['locales']>[string] | undefined{

		let language = this.language.toUpperCase();

		// Retrieve localized version
		let locale = locales.find(l => l[0].toUpperCase() == language && predicate(l[1]));

		// If we have chinese language we try China and Taiwan variants in order
		if(!locale && language == "ZH"){
			locale = locales.find(l => l[0].toUpperCase() == "ZHCH" && predicate(l[1]))
				?? locales.find(l => l[0].toUpperCase() == "ZHTW" && predicate(l[1]));
		}

		// If we haven't found anything we try retrieving english
		locale ??= locales.find(l => l[0].toUpperCase() == "EN" && predicate(l[1]));
		
		return locale?.[1];
	}

	async provide(appId: number): Promise<MetadataData | undefined>
	{
		if(this.excludedApps.includes(appId))
			return undefined;

		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		
		const launchCommand = getLaunchCommand(details);
		const cats = await getShortcutCategories(launchCommand);
		cats.push(StoreCategory.SinglePlayer);
		
		let entries: GameTDBGame[] = [];
		if(isDolphinGame(launchCommand)){
			entries = await this.getDolphinGameEntries(appId);

			if(entries.length){
				cats.push(StoreCategory.TrackedControllerSupport);
				if(entries.some(e => e["local-players"] && e["local-players"] > 1))
					cats.push(StoreCategory.MultiPlayer);
				if(entries.some(e => e["wi-fi-players"]))
					cats.push(StoreCategory.OnlineMultiPlayer);
				if (entries.some(e => e.controls?.some(c => c.type === 'gamecube' || c.type === 'classiccontroller')) ||
					(await this.resolve(appId))!.toString().split(separator).some(i => isGameCubeId6(i))){

					cats.push(StoreCategory.FullController);
				}
				else
					cats.push(StoreCategory.PartialController);
			}
		}
		else if(isCemuGame(launchCommand)){
			entries = await this.getCemuGameEntries(appId);

			if(entries.length){
				cats.push(StoreCategory.FullController);
				if(entries.some(e => e["local-players"] && e["local-players"] > 1))
					cats.push(StoreCategory.MultiPlayer);
				if(entries.some(e => e["wi-fi-players"]))
					cats.push(StoreCategory.OnlineMultiPlayer);
				if(entries.some(e => e.controls?.some(c => c.type === 'wiimote' || c.type === 'nunchuk')))
					cats.push(StoreCategory.TrackedControllerSupport);
			}
		}
		else if(isRyujinxGame(launchCommand)){
			entries = await this.getRyujinxGameEntries(appId);

			if(entries.length){
				cats.push(StoreCategory.FullController);
				if(entries.some(e => e["local-players"] && e["local-players"] > 1))
					cats.push(StoreCategory.MultiPlayer);
				if(entries.some(e => e["wi-fi-players"]))
					cats.push(StoreCategory.OnlineMultiPlayer);
				if(entries.some(e => e.controls?.some(c => c.type === 'joycon' && c.required === true)))
					cats.push(StoreCategory.TrackedControllerSupport);
			}
		}
		else if(isRPCS3Game(launchCommand)){
			entries = await this.getRPCS3GameEntries(appId);

			if(entries.length){
				cats.push(StoreCategory.FullController);
				if(entries.some(e => e["local-players"] && e["local-players"] > 1))
					cats.push(StoreCategory.MultiPlayer);
				if(entries.some(e => e["wi-fi-players"]))
					cats.push(StoreCategory.OnlineMultiPlayer);
				if(entries.some(e => e.controls?.some(c => c.type === 'move')))
					cats.push(StoreCategory.TrackedControllerSupport);
			}
		}

		if(!entries.length)
			return undefined;

		let locales = entries.flatMap(e => Object.entries(e.locales ?? {}));
		let release = entries.find(e => e.date)?.date;

		return {
			id: entries[0].id,
			title: this.getLocalized(locales, l => l.title)?.title
				?? entries[0].name,

			description: this.getLocalized(locales, l => l.synopsis)?.synopsis || t("noDescription"),

			release_date: release ? Math.floor(Date.parse(release) / 1000) : undefined,
			developers: entries
				.find(e => e.developer)?.developer
				?.split(',')
				.map(d => ({name: d.trim(), url: ""})),
			publishers: entries
				.find(e => e.publisher)?.publisher
				?.split(',')
				.map(d => ({name: d.trim(), url: ""})),
			store_categories: cats
		};
	}

	override icon = <FaG/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [language, setLanguage] = useState(this.language);
		return (
			<DialogControlsSection>
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
		);
	}

	// Here we do not check excludedApps because this might be used externally
	private async getGameEntries(appId: number, url: string): Promise<GameTDBGame[]>{
		const resolved = await this.resolve(appId, true);
		if (!resolved)
			return [];

		const ids = resolved.toString().split(separator);
		if(!ids?.length)
			return [];

		this.logger.debug("Games ids", appId, ids);

		let entries: GameTDBGame[] = [];
		for(let id of ids){
			let entry = await this.gametdb_get_entry(url, id);
			if(entry)
				entries.push(JSON.parse(entry));
		}

		return entries;
	}
	

	public async getDolphinGameEntries(appId: number): Promise<GameTDBGame[]>{
		const details = await getAppDetails(appId);
		if (!details)
			return [];
		const launchCommand = getLaunchCommand(details);
		if(!isDolphinGame(launchCommand))
			return [];
		
		return this.getGameEntries(appId, wiiUrl);
	}

	public async getCemuGameEntries(appId: number): Promise<GameTDBGame[]>{
		const details = await getAppDetails(appId);
		if (!details)
			return [];
		const launchCommand = getLaunchCommand(details);
		if(!isCemuGame(launchCommand))
			return [];
		
		return this.getGameEntries(appId, wiiUUrl);
	}

	public async getRyujinxGameEntries(appId: number): Promise<GameTDBGame[]>{
		const details = await getAppDetails(appId);
		if (!details)
			return [];
		const launchCommand = getLaunchCommand(details);
		if(!isRyujinxGame(launchCommand))
			return [];
		
		return this.getGameEntries(appId, switchUrl);
	}

	public async getRPCS3GameEntries(appId: number): Promise<GameTDBGame[]>{
		const details = await getAppDetails(appId);
		if (!details)
			return [];
		const launchCommand = getLaunchCommand(details);
		if(!isRPCS3Game(launchCommand))
			return [];
		
		return this.getGameEntries(appId, ps3Url);
	}
}