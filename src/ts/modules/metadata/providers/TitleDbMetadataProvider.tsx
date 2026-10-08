import { call, fetchNoCors, toaster } from "@decky/api";
import Logger from "../../../logger";
import { t } from "../../../useTranslations";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import type { ResolverConfig, ResolverCache } from "../../Resolver";
import { RyujinxTitleIdResolverConfigs, RyujinxTitleIdResolverCaches, RyujinxTitleIdResolver } from "../../resolvers/RyujinxTitleIdResolver";
import type { MetadataProviderConfigs } from "../MetadataModule";
import { MetadataProvider } from "../MetadataProvider";
import { BsNintendoSwitch } from "react-icons/bs";
import { useMetaDeckState } from "../../../MetaDeckState";
import { useState } from "react";
import { DialogControlsSection, Dropdown, Field } from "@decky/ui";
import { StoreCategory, type MetadataData } from "../../../Interfaces";
import { getAppDetails } from "../../../util";
import { getLaunchCommand, getShortcutCategories } from "../../../shortcuts";

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

export interface TitleDbMetadataProviderConfig extends ProviderConfig<RyujinxTitleIdResolverConfigs, ResolverConfig>
{
	// COUNTRY.language: US.en, IT.it, RO.en, only some available
	language: string
}

export interface TitleDbMetadataProviderCache extends ProviderCache<RyujinxTitleIdResolverCaches, ResolverCache>
{
	
}

export class TitleDbMetadataProvider extends MetadataProvider<any>{
	resolvers: RyujinxTitleIdResolver[] = [
		new RyujinxTitleIdResolver(this)
	];

	static identifier: keyof MetadataProviderConfigs = "titledb";
	static title: string = t("providerMetadataTitleDb");
	identifier: keyof MetadataProviderConfigs = TitleDbMetadataProvider.identifier;
	title: string = TitleDbMetadataProvider.title;

	logger: Logger = new Logger(TitleDbMetadataProvider.identifier);

	private languages: string[] = [];

	get language(): string
	{
		return this.module.config.providers.titledb.language;
	}

	set language(language: string)
	{
		this.module.config.providers.titledb.language = language;
		void this.module.saveConfig();
	}

	override async mount(): Promise<void> {
		await super.mount();

		// Retrieve available languages
		const response = await fetchNoCors("https://raw.githubusercontent.com/blawar/titledb/refs/heads/master/languages.json");
		if(!response.ok){
			toaster.toast({
				title: `${this.module.title} - ${this.title}`,
				body: t("initError")
			});

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

	async provide(appId: number): Promise<MetadataData | undefined> {
		if(this.excludedApps.includes(appId))
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

		const launchCommand = getLaunchCommand(details);
		const cats = await getShortcutCategories(launchCommand);
		cats.push(StoreCategory.SinglePlayer);
		if(game.numberOfPlayers && game.numberOfPlayers > 1)
			cats.push(StoreCategory.MultiPlayer);

		return {
			id: game.id,
			title: game.name,

			description: (game.description ?? game.intro) || t("noDescription"),
			snippet: game.intro ?? undefined,

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
		const [language, setLanguage] = useState(this.language);
		return (
			<DialogControlsSection>
				<Field
					label={t("language")}
					childrenContainerWidth={'fixed'}>
					<Dropdown
						rgOptions={this.languages.map(l => ({
							data: l, label: l
						}))}
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