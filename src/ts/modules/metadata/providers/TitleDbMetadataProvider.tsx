import { call, fetchNoCors } from "@decky/api";
import Logger from "../../../logger";
import { getAutoLanguageOptions, getCurrentLanguage, getLanguageTitle, isValidLanguage, t, type Language } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { MetadataProvider } from "../MetadataProvider";
import { BsNintendoSwitch } from "react-icons/bs";
import { useMetaDeckState } from "../../../MetaDeckState";
import { useState } from "react";
import { DialogControlsSection, Dropdown, Field } from "@decky/ui";
import { StoreCategory, type MetadataData } from "../../../Interfaces";
import { getAppDetails, toasterToast } from "../../../util";

type TitleDbEntry = {
	id: string;
	name: string;
	description?: string | null;
	intro?: string | null;
	developer?: string | null;
	publisher?: string | null;
	releaseDate?: number | null;
	numberOfPlayers?: number | null;
	size?: number | null;
}

export interface TitleDbMetadataProviderConfig extends ProviderConfig<'ryujinx_titleid'>{
	// COUNTRY.language: US.en, IT.it, RO.en, only some available
	language: string | null; // null will try to guess or fallback to english
}

export interface TitleDbMetadataProviderCache extends ProviderCache{
	
}

export class TitleDbMetadataProvider extends MetadataProvider<'titledb'>{
	identifier = "titledb" as const;
	title = t("providerMetadataTitleDb");

	logger = new Logger(this.identifier);

	private languages: string[] = [];

	get language(): string{
		return this.config.language
			?? this.getDefaultLanguage();
	}

	set language(language: string | null){
		let current = this.language;
		this.config.language = language;
		void this.saveConfig();

		if(current != this.language)
			void this.clearModuleCache();
	}

	private getDefaultLanguage(){
		let lang = getCurrentLanguage();
		
		// Try matching a simple country/language code (IT.it, FR.fr, DE.de, ...)
		let language = lang.toUpperCase() + "." + lang.toLowerCase();
		if(this.languages.includes(language))
			return language;

		// Try matching specific cases 
		if(lang === "es419")
			lang = "es"; // Will match the first non Spain-Spanish below
		else if(lang === "ptBr"){
			if(this.languages.includes("BR.pt"))
				return "BR.pt";
		}
		else if(lang === "zhCn"){
			if(this.languages.includes("CN.zh"))
				return "CN.zh";
		}
		else if(lang === "zhTw")
			lang = "zh" as any; // Will match the first non China-Chinese below

		// Try matching just the language (except english)
		if(lang !== "en"){
			language = this.languages.find(l => l.endsWith("." + lang))!;
			if(language)
				return language;
		}

		if(this.languages.includes("US.en"))
			return "US.en";
		else if(this.languages.includes("GB.en"))
			return "GB.en";
		else{
			language = this.languages.find(l => l.endsWith(".en"))!;
			if(language)
				return language;
			else
				return this.languages[0];
		}
	}

	override async mount(): Promise<void> {
		// Retrieve available languages
		const response = await fetchNoCors("https://raw.githubusercontent.com/blawar/titledb/refs/heads/master/languages.json");
		if(!response.ok){
			toasterToast(t("initError"), this);

			return;
		}

		let languages: Record<string, string[]> = await response.json();
		this.languages = Object.entries(languages)
			.flatMap(c => c[1].map(l => `${c[0]}.${l}`))
			.sort((a, b) => a.localeCompare(b));

		await this.retrieveLanguage(this.language);
	}

	private async retrieveLanguage(language: string){
		// Since this is a heavy operation we check if we actually have Ryujinx installed
		if(this.resolvers[0].ryujinxProdKeys === undefined)
			await this.resolvers[0].checkRyujinxProdKeys();

		if(!this.resolvers[0].ryujinxProdKeys)
			return;

		await call<[string], void>('titledb_get_language', language);
	}

	override test(appId: number, external?: boolean): Promise<boolean> {
		if(!this.languages.length)
			return Promise.resolve(false);
		else
			return super.test(appId, external);
	}

	async provide(appId: number): Promise<MetadataData | undefined> {
		if(!this.languages.length)
			return undefined;

		const resolved = await this.resolve(appId, true);
		if (!resolved)
			return undefined;

		const details = await getAppDetails(appId);
		if (!details)
			return undefined;

		let entry = await call<[string, string], string>("titledb_get_entry", this.language, resolved.toString());
		if(!entry)
			return undefined;

		let game: TitleDbEntry = JSON.parse(entry);
		let strDate = game.releaseDate?.toString();

		const cats: StoreCategory[] = [ StoreCategory.SinglePlayer ];
		if(game.numberOfPlayers && game.numberOfPlayers > 1)
			cats.push(StoreCategory.MultiPlayer);

		return {
			id: game.id,
			title: game.name,

			description: (game.description ?? game.intro) || t("noDescription"),
			snippet: game.intro ?? undefined,
			matches_user_language: true,

			release_date: strDate ? Math.floor(Date.parse(`${strDate.substring(0, 4)}-${strDate.substring(4, 6)}-${strDate.substring(6, 8)}`) / 1000) : undefined,
			developers: game.developer ? [{name: game.developer, url: ''}] : undefined,
			publishers: game.publisher ? [{name: game.publisher, url: ''}] : undefined,
			store_categories: cats,

			install_size: game.size ?? undefined
		};
	}

	override icon = <BsNintendoSwitch/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [language, setLanguage] = useState(this.config.language);

		const languageTitle = (language: string) => {
			// getDefaultLanguage can return undefined if no language was loaded
			if(!language)
				return '';

			let [country, lang]: [string, Language] = language.split('.') as any;
			let finalLanguage;
			if(lang === "es" && country !== "ES")
				finalLanguage = "es419";
			else if(lang === "pt" && country !== "PT")
				finalLanguage = "ptBr";
			else if ((lang as any) === "zh"){
				if(country === "CN")
					finalLanguage = "zhCn";
				else
					finalLanguage = "zhTw";
			}
			else
				finalLanguage = lang;

			return (isValidLanguage(finalLanguage) ? getLanguageTitle(finalLanguage) : finalLanguage) +
				(this.languages.filter(l => l.startsWith(country + ".") || l.endsWith("." + finalLanguage)).length > 1 ? ` (${country})` : "");
		};

		return (
			<DialogControlsSection>
				<Field
					label={t("language")}
					childrenContainerWidth={'fixed'}>
					<Dropdown
						rgOptions={getAutoLanguageOptions(languageTitle(this.getDefaultLanguage()))
							.concat(this.languages
								.map(l => ({ data: l, label: languageTitle(l) }))
								.sort((a, b) => a.label.localeCompare(b.label)))}
						selectedOption={language}
						disabled={loadingData.loading}
						onChange={(newVal) => {
							setLanguage(newVal.data);
							this.language = newVal.data;
							void this.retrieveLanguage(this.language);
						}}
					/>
				</Field>
			</DialogControlsSection>
		);
	}
}