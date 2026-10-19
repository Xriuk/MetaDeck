import { DialogControlsSection, Dropdown, Field } from "@decky/ui";
import { useState } from "react";
import Logger from "../../../logger";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t, getLanguageTitle, type Language, getCurrentLanguage } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { MetadataProvider } from "../MetadataProvider";
import { separator } from "../../resolvers/MultiId/MultiIdResolver";
import { getLaunchCommand, getShortcutCategories, isCemuGame, isDolphinGame, isGameCubeId6, isRPCS3Game, isRyujinxGame } from "../../../shortcuts";
import { getAppDetails, toasterToast } from "../../../util";
import { callable, fetchNoCors } from "@decky/api";
import { MetadataData, StoreCategory } from "../../../Interfaces";
import { FaG } from "react-icons/fa6";

const langMap: Partial<Record<Language, string>> = {
	'en': 'EN', // US
	'ja': 'JA',
	'fr': 'FR',
	'de': 'DE',
	'es': 'ES',

	'it': 'IT',
	'nl': 'NL',
	'pt': 'PT',
	'zhCn': 'ZHCN',
	'zhTw': 'ZHTW',

	'ko': 'KO'
};

const wiiUrl = "https://www.gametdb.com/wiitdb.zip";
const wiiUUrl = "https://www.gametdb.com/wiiutdb.zip";
const switchUrl = "https://www.gametdb.com/switchtdb.zip";
const ps3Url = "https://www.gametdb.com/ps3tdb.zip";

// GameTDB is extremely unreliable so we try the website and fallback to wayback machine
const waybackMachineLatest = "https://web.archive.org/web/20260922134245/";
export async function fetchGameTDBNoCors(url: string){
	try{
		let response = await fetchNoCors(url);
		if(!response.ok && response.status >= 500)
			throw new Error("gateway");
		return response;
	}
	catch(e: any){
		if((e.toString() as string).toLowerCase().includes("gateway"))
			return await fetchNoCors(waybackMachineLatest + url);

		throw e;
	}
}

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

export interface GameTDBMetadataProviderConfig extends ProviderConfig<'dolphin' | 'cemu' | 'rpcs3' | 'ryujinx_serial'>{
	// https://www.gametdb.com/Main/FAQ > Developers > Naming scheme for languages (locale lang)
	language: string | null; // null will try to guess or fallback to english
}

export interface GameTDBMetadataProviderCache extends ProviderCache{
	
}

// DEV: add support for DS games
export class GameTDBMetadataProvider extends MetadataProvider<"gametdb">{
	identifier = "gametdb" as const;
	title: string = t("providerMetadataGameTDB");

	logger: Logger = new Logger(this.identifier);

	gametdb_get_db = callable<[string]>("gametdb_get_db");
	gametdb_get_entry = callable<[string, string], string | null>("gametdb_get_entry");

	// Retrieve selected language, try guessing, or default to english
	get language(): string{
		return this.config.language
			?? langMap[getCurrentLanguage()]
			?? langMap['en']!;
	}

	set language(language: string){
		this.config.language = language;
		void this.saveConfig();
	}

	override async mount(): Promise<void> {
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
			catch(e1){
				// DEV: maybe check if gateway error
				this.logger.error(e1);
				
				try{
					await this.gametdb_get_db(waybackMachineLatest + url);
				}
				catch(e2){
					errors.push(e2);
				}
			}
		}
		if(errors.length){
			toasterToast(t("initError"), this);
			
			this.logger.error("Error while retrieving one or more zip file", errors);
		}
	}

	private getLocalized(
		locales: [string, NonNullable<GameTDBGame['locales']>[string]][],
		predicate: (locale: NonNullable<GameTDBGame['locales']>[string]) => any):
			NonNullable<GameTDBGame['locales']>[string] | undefined{

		let language = this.language;

		// Retrieve localized version
		let locale = locales.find(l => l[0] === language && predicate(l[1]));

		// If we haven't found anything we try retrieving english
		if(language !== "EN")
			locale ??= locales.find(l => l[0] === "EN" && predicate(l[1]));
		
		return locale?.[1];
	}

	async provide(appId: number): Promise<MetadataData | undefined>{
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

		let localized = this.getLocalized(locales, l => l.synopsis);

		return {
			id: entries[0].id,
			title: this.getLocalized(locales, l => l.title)?.title
				?? entries[0].name,

			description: localized?.synopsis || t("noDescription"),
			matches_user_language: localized && locales.find(l => l[1] === localized)?.[0] === this.language,

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
					childrenContainerWidth={'fixed'}>
					<Dropdown
						rgOptions={Object.entries(langMap)
							.map(([lang, id]) => ({ data: id, label: getLanguageTitle(lang as Language) }))
							.sort((a, b) => a.label.localeCompare(b.label))}
						selectedOption={language}
						disabled={loadingData.loading}
						onChange={(newVal) => {
							setLanguage(newVal.data);
							this.language = newVal.data;
						}} />
				</Field>
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