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
import { separator, type MultiIdResolver, type MultiIdResolverCaches, type MultiIdResolverConfigs } from "../../resolvers/MultiId/MultiIdResolver";
import { MultiIdRPCS3Resolver } from "../../resolvers/MultiId/MultiIdRPCS3Resolver";
import { getLaunchCommand, getShortcutCategories, isDolphinGame, isRPCS3Game } from "../../../shortcuts";
import { getAppDetails } from "../../../util";
import { callable } from "@decky/api";
import { MetadataData, StoreCategory } from "../../../Interfaces";

const wiiUrl = "https://www.gametdb.com/wiitdb.zip";
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

export interface GameTDBMetadataProviderConfig extends ProviderConfig<Pick<MultiIdResolverConfigs, 'dolphin' | 'rpcs3'>, ResolverConfig>
{
	language: string // ZH -> ZHCN / ZHTW (in order)
}

export interface GameTDBMetadataProviderCache extends ProviderCache<Pick<MultiIdResolverCaches, 'dolphin' | 'rpcs3'>, ResolverCache>
{
	
}

// DEV: add support for DS, WiiU and Switch games
export class GameTDBMetadataProvider extends MetadataProvider<any>{
	resolvers: MultiIdResolver[] = [
		new MultiIdDolphinResolver(this),
		new MultiIdRPCS3Resolver(this)
	];

	static identifier: keyof MetadataProviderConfigs = "gametdb";
	static title: string = t("providerMetadataGameTDB");
	identifier: keyof MetadataProviderConfigs = GameTDBMetadataProvider.identifier;
	title: string = GameTDBMetadataProvider.title;

	logger: Logger = new Logger(GameTDBMetadataProvider.identifier);

	gametdb_get_db = callable<[string]>("gametdb_get_db");
	gametdb_get_entry = callable<[string, string], GameTDBGame | null>("gametdb_get_entry");

	get language(): string
	{
		return this.module.config.providers.gametdb.language;
	}

	set language(language: string)
	{
		this.module.config.providers.gametdb.language = language;
		void this.module.saveData();
	}

	override async mount(): Promise<void> {
		await super.mount();

		// Save in backend instead of returning because there's a lot of data
		try{
			await this.gametdb_get_db(wiiUrl);
			await this.gametdb_get_db(ps3Url);
		}
		catch(e){
			this.logger.error("Error while retrieving one or more zip file", e);
		}
	}

	async test(appId: number): Promise<boolean>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return false;
		const launchCommand = getLaunchCommand(details);
		return isDolphinGame(launchCommand) || isRPCS3Game(launchCommand);
	}

	private getLocalized(
		locales: [string, NonNullable<GameTDBGame['locales']>[string]][],
		predicate: (locale: NonNullable<GameTDBGame['locales']>[string]) => any):
			NonNullable<GameTDBGame['locales']>[string] | undefined{

		// Retrieve localized version
		let locale = locales.find(l => l[0].toUpperCase() == this.language.toUpperCase() && predicate(l[1]));

		// If we have chinese language we try China and Taiwan variants in order
		if(!locale && this.language.toUpperCase() == "ZH"){
			locale = locales.find(l => l[0].toUpperCase() == "ZHCH" && predicate(l[1]))
				?? locales.find(l => l[0].toUpperCase() == "ZHTW" && predicate(l[1]));
		}

		// If we haven't found anything we try retrieving english
		locale ??= locales.find(l => l[0].toUpperCase() == "EN" && predicate(l[1]));
		
		return locale?.[1];
	}

	async provide(appId: number): Promise<MetadataData | undefined>
	{
		const details = await getAppDetails(appId);
		if (!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);
		const resolved = await this.resolve(appId);
		if (!resolved)
			return undefined;

		const ids = resolved.toString().split(separator);
		if(!ids?.length)
			return undefined;

		this.logger.debug("Games ids", appId, ids);

		const cats = await getShortcutCategories(getLaunchCommand(details));
		cats.push(StoreCategory.SinglePlayer);
		
		let entries: GameTDBGame[] = [];
		if(isDolphinGame(launchCommand)){
			for(let id in ids){
				let entry = await this.gametdb_get_entry(wiiUrl, id);
				if(entry)
					entries.push(entry);
			}

			if(entries.length){
				cats.push(StoreCategory.TrackedControllerSupport);
				if(entries.some(e => e["local-players"] && e["local-players"] > 1))
					cats.push(StoreCategory.MultiPlayer);
				if(entries.some(e => e["wi-fi-players"]))
					cats.push(StoreCategory.OnlineMultiPlayer);
				if(entries.some(e => e.controls?.some(c => c.type === 'gamecube' || c.type === 'classiccontroller')))
					cats.push(StoreCategory.FullController);
				else
					cats.push(StoreCategory.PartialController);
			}
		}
		else if(isRPCS3Game(launchCommand)){
			for(let id in ids){
				let entry = await this.gametdb_get_entry(ps3Url, id);
				if(entry)
					entries.push(entry);
			}

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
			description: this.getLocalized(locales, l => l.title)?.synopsis || t("noDescription"),
			rating: undefined, // DEV: maybe retrieve somehow?
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

	settingsComponent = () => {
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
							<span>{t("gameTDBLanguageDescription")}</span>
						</>
					} />
			</DialogControlsSection>
		)
	}

	public async getDolphinGameEntries(appId: number): Promise<GameTDBGame[]>{
		const details = await getAppDetails(appId);
		if (!details)
			return [];
		const launchCommand = getLaunchCommand(details);
		if(!isDolphinGame(launchCommand))
			return [];
		const resolved = await this.resolve(appId);
		if (!resolved)
			return [];

		const ids = resolved.toString().split(separator);
		if(!ids?.length)
			return [];

		let entries: GameTDBGame[] = [];
		for(let id in ids){
			let entry = await this.gametdb_get_entry(wiiUrl, id);
			if(entry)
				entries.push(entry);
		}

		return entries;
	}
}