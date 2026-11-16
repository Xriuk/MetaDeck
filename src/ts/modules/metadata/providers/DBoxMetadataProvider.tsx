import { fetchNoCors } from "@decky/api";
import Logger from "../../../logger";
import { t, getCurrentLanguage, getAutoLanguageOptions, getLanguageTitle, isValidLanguage, type Language } from "../../../useTranslations";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import { MetadataProvider } from "../MetadataProvider";
import { toasterToast } from "../../../util";
import { MetadataData, StoreCategory } from "../../../Interfaces";
import { FaXbox } from "react-icons/fa";
import { useMetaDeckState } from "../../../MetaDeckState";
import { useState } from "react";
import { DialogControlsSection, Field, Dropdown } from "@decky/ui";

type DBoxLocalization = {
	locale: string;
	full_title: string | null;
	full_description: string | null;
	reduced_title: string | null;
	reduced_description: string | null;
	country_release_date: string | null;
};

export interface DBoxMetadataProviderConfig extends ProviderConfig<'xenia_marketplace'>{
	// COUNTRY.language: en-us, it-it, only some available
	language: string | null; // null will try to guess or fallback to english
}

export interface DBoxMetadataProviderCache extends ProviderCache{

}

export class DBoxMetadataProvider extends MetadataProvider<'dbox'>{
	identifier = "dbox" as const;
	title = t("providerMetadataDBox");

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
		
		// Try matching a simple country/language code (it-it, fr-fr, de-de, ...)
		let language = lang.toLowerCase() + "-" + lang.toLowerCase();
		if(this.languages.includes(language))
			return language;

		// Try matching specific cases 
		if(lang === "es419")
			lang = "es"; // Will match the first non Spain-Spanish below
		else if(lang === "ptBr"){
			if(this.languages.includes("pt-br"))
				return "pt-br";
		}
		else if(lang === "zhCn"){
			if(this.languages.includes("zh-cn"))
				return "zh-cn";
		}
		else if(lang === "zhTw")
			lang = "zh" as any; // Will match the first non China-Chinese below

		// Try matching just the language (except english)
		if(lang !== "en"){
			language = this.languages.find(l => l.startsWith(lang + "-"))!;
			if(language)
				return language;
		}

		if(this.languages.includes("en-us"))
			return "en-us";
		else if(this.languages.includes("en-gb"))
			return "en-gb";
		else{
			language = this.languages.find(l => l.startsWith("en-"))!;
			if(language)
				return language;
			else
				return this.languages[0];
		}
	}

	override async mount(): Promise<void> {
		// Retrieve available languages
		const response = await fetchNoCors("https://dbox.tools/api/marketplace/locales/");
		if(!response.ok){
			toasterToast(t("initError"), this);

			return;
		}

		let languages: {
			locale: string;
			language: string;
		}[] = await response.json();
		this.languages = languages.map(l => l.locale);
	}

	override test(appId: number, external?: boolean): Promise<boolean> {
		if(!this.languages.length)
			return Promise.resolve(false);
		else
			return super.test(appId, external);
	}

	private getLocalized(
		locales: DBoxLocalization[] | undefined,
		predicate: (locale: DBoxLocalization) => any):
			DBoxLocalization | undefined{

		if(!locales?.length)
			return undefined;

		// Retrieve localized version
		let language = this.language;
		let locale = locales.find(l => l.locale === language && predicate(l));

		// If we haven't found anything we try retrieving default
		let def = this.getDefaultLanguage();
		if(language !== def)
			locale ??= locales.find(l => l.locale === def && predicate(l));
		
		return locale;
	}

	async provide(appId: number): Promise<MetadataData | undefined> {
		if(!this.languages.length)
			return undefined;

		const resolved = await this.resolve(appId, true);
		if (!resolved)
			return undefined;

		const response = await fetchNoCors('https://dbox.tools/api/marketplace/products/' + resolved);
		if(response.ok){
			let product: {
				localizations?: DBoxLocalization[];
				capabilities?: {
					capability: {
						name: string;
					};
					value: number;
				}[];
				product_id: string;
				global_original_release_date: string | null;
				developer_name: string | null;
				publisher_name: string | null;
				default_title: string;
			} = await response.json();

			const cats: StoreCategory[] = [ StoreCategory.SinglePlayer ];
			if(product.capabilities?.some(c => c.capability.name === "offlinePlayersMax" && c.value > 1)){
				cats.push(StoreCategory.LocalMultiPlayer);
				cats.push(StoreCategory.MultiPlayer);
			}
			if(product.capabilities?.some(c => c.capability.name === "onlineMultiplayerMax" && c.value > 1)){
				cats.push(StoreCategory.OnlineMultiPlayer);
				cats.push(StoreCategory.MultiPlayer);
			}
			if(product.capabilities?.some(c => c.capability.name === "offlineCoopPlayersMax" && c.value > 1)){
				cats.push(StoreCategory.LocalCoOp);
				cats.push(StoreCategory.MultiPlayer);
			}
			if(product.capabilities?.some(c => c.capability.name === "onlineCoopPlayersMax" && c.value > 1)){
				cats.push(StoreCategory.OnlineCoOp);
				cats.push(StoreCategory.MultiPlayer);
			}

			let description = this.getLocalized(product.localizations, l => l.full_description);
			let reducedDescription = this.getLocalized(product.localizations, l => l.reduced_description);

			let language = this.language;

			let release = this.getLocalized(product.localizations, l => l.country_release_date)?.country_release_date
				?? product.global_original_release_date;

			return {
				id: product.product_id,
				title: this.getLocalized(product.localizations, l => l.full_title)?.full_title
					?? this.getLocalized(product.localizations, l => l.reduced_title)?.reduced_title
					?? product.default_title,

				description: (description?.full_description
					?? reducedDescription?.reduced_description) || t("noDescription"),
				snippet: reducedDescription?.reduced_description ?? undefined,
				matches_user_language: description?.locale === language || reducedDescription?.locale === language,

				release_date: release ? Math.floor(Date.parse(release) / 1000) : undefined,
				developers: product.developer_name ? [{name: product.developer_name, url: ''}] : undefined,
				publishers: product.publisher_name ? [{name: product.publisher_name, url: ''}] : undefined,
				store_categories: cats
			};
		}
		else if (response.status === 429)
			return this.throttle(() => this.provide(appId));
		else if (response.status >= 500)
			return undefined;
		else
			throw Error(`Could not find metadata for "${appId}": \n${(await response.text())}`);
	}

	override icon = <FaXbox/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [language, setLanguage] = useState(this.config.language);

		const languageTitle = (language: string) => {
			// getDefaultLanguage can return undefined if no language was loaded
			if(!language)
				return '';

			let [lang, country]: [Language, string] = language.split('-') as any;
			let finalLanguage;
			if(lang === "es" && country !== "es")
				finalLanguage = "es419";
			else if(lang === "pt" && country !== "pt")
				finalLanguage = "ptBr";
			else if ((lang as any) === "zh"){
				if(country === "cn")
					finalLanguage = "zhCn";
				else
					finalLanguage = "zhTw";
			}
			else
				finalLanguage = lang;

			return (isValidLanguage(finalLanguage) ? getLanguageTitle(finalLanguage) : finalLanguage) +
				(this.languages.filter(l => l.startsWith(lang + "-") || l.endsWith("-" + country)).length > 1 ? ` (${country.toUpperCase()})` : "");
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
						}}
					/>
				</Field>
			</DialogControlsSection>
		);
	}
}