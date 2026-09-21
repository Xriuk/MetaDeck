import {Module, ModuleCache, ModuleConfig} from "../Module";
import {MetadataProvider} from "./MetadataProvider";
import {
	IGDBMetadataProvider,
	IGDBMetadataProviderCache,
	IGDBMetadataProviderConfig
} from "./providers/IGDB/IGDBMetadataProvider";
import {CustomStoreCategory, MetadataData, StoreCategory} from "../../Interfaces";
import {truncate} from "lodash-es";
import {
	GOGMetadataProvider,
	GOGMetadataProviderCache,
	GOGMetadataProviderConfig, GOGMetadataProviderResolverCaches, GOGMetadataProviderResolverConfigs
} from "./providers/GOG/GOGMetadataProvider";
import {Mounts} from "../../System";
import {
	afterPatch,
	beforePatch,
	callOriginal,
	DialogControlsSection,
	Field,
	findInReactTree,
	findModuleExport,
	Patch,
	replacePatch,
	Router,
	Toggle
} from "@decky/ui";
import {format, t} from "../../useTranslations";
import {getAppDetails, stateTransaction} from "../../util";
import {ReactElement, ReactNode, useState} from "react";
import {Markdown} from "../../markdown";
import {SteamAppDetails, SteamAppOverview} from "../../SteamTypes";
import {routePatch} from "../../RoutePatches";
// import {addStyle, removeStyle} from "../../styleInjector";
import Logger from "../../logger";
import {
	getLaunchCommand,
	getShortcutCategories
} from "../../shortcuts";
import {CustomFeature} from "./CustomFeature";
import { SteamMetadataProvider, type SteamMetadataProviderCache, type SteamMetadataProviderConfig } from "./providers/Steam/SteamMetadataProvider";
import { RAWGMetadataProvider, type RAWGMetadataProviderCache, type RAWGMetadataProviderConfig } from "./providers/RAWG/RAWGMetadataProvider";
import { useMetaDeckState } from "../../MetaDeckState";
import React from "react";

export interface MetadataConfig extends ModuleConfig<MetadataProviderConfigs, MetadataProviderConfigTypes>
{
	type_override: boolean,
	descriptions: boolean,
	release_date: boolean,
	associations: boolean,
	categories: boolean,
	markdown: boolean,
	title_header: boolean,
	rating: boolean,
	install_size: boolean,
	install_date: boolean
}

export interface MetadataCache extends ModuleCache<MetadataProviderCaches, MetadataProviderCacheTypes, MetadataData>
{

}

export interface MetadataProviderConfigs
{
	igdb: IGDBMetadataProviderConfig,
	gog: GOGMetadataProviderConfig,
	steam: SteamMetadataProviderConfig,
	rawg: RAWGMetadataProviderConfig
}

export interface MetadataProviderCaches
{
	igdb: IGDBMetadataProviderCache,
	gog: GOGMetadataProviderCache,
	steam: SteamMetadataProviderCache,
	rawg: RAWGMetadataProviderCache
}

export interface MetadataProviderResolverConfigs
{
	igdb: {},
	gog: GOGMetadataProviderResolverConfigs,
	steam: {},
	rawg: {}
}

export interface MetadataProviderResolverCaches
{
	igdb: {},
	gog: GOGMetadataProviderResolverCaches,
	steam: {},
	rawg: {}
}

export type MetadataProviderConfigTypes = MetadataProviderConfigs[keyof MetadataProviderConfigs]

export type MetadataProviderCacheTypes = MetadataProviderCaches[keyof MetadataProviderCaches]

export class MetadataModule extends Module<
	   MetadataModule,
	   MetadataProvider<any>,
	   MetadataConfig,
	   MetadataProviderConfigs,
	   MetadataProviderConfigTypes,
	   MetadataProviderResolverConfigs,
	   MetadataCache,
	   MetadataProviderCaches,
	   MetadataProviderCacheTypes,
	   MetadataProviderResolverCaches,
	   MetadataData
>
{
	static identifier: string = "metadata";
	static title: string = t("moduleMetadata");
	identifier: string = MetadataModule.identifier;
	title: string = MetadataModule.title;

	logger: Logger = new Logger(MetadataModule.identifier)

	providers: MetadataProvider<any>[] = [
		new GOGMetadataProvider(this),
		new SteamMetadataProvider(this),
		new IGDBMetadataProvider(this),
		new RAWGMetadataProvider(this)
	];

	get config(): MetadataConfig
	{
		return this.state.settings.config.modules.metadata;
	}

	get cache(): MetadataCache
	{
		return this.state.settings.cache.modules.metadata;
	}

	public async removeCache(appId: number)
	{
		delete this.data[appId];
		await this.saveData();
		let appData = appDetailsStore.GetAppData(appId);
		if (appData)
		{
			const overview = appStore.GetAppOverviewByAppID(appId)
			const desc = this.descriptions ? t("noDescription") : "";
			stateTransaction(() => {
				if (this.config.markdown)
				{
					appData.descriptionsData = {
						strFullDescription: <Markdown>
							{this.config.title_header ? `# ${overview.display_name}\n` + desc : desc}
						</Markdown>,
						strSnippet: <Markdown>
							{this.config.title_header ? `# ${overview.display_name}\n` + desc : desc}
						</Markdown>
					}
				} else
				{
					appData.descriptionsData = {
						strFullDescription: desc,
						strSnippet: desc
					}
				}
				appData.associationData = {
					rgDevelopers: [],
					rgPublishers: [],
					rgFranchises: []
				}
				appDetailsCache.SetCachedDataForApp(appId, "descriptions", 1, appData.descriptionsData)
				appDetailsCache.SetCachedDataForApp(appId, "associations", 1, appData.associationData)
			});
		}
	};

	private bypassCounter = 0
	bypassBypass = 0

	addMounts(mounts: Mounts): void
	{
		const module = this
		mounts.addPatchMount({
			patch(): Patch
			{
				return replacePatch(
					   // @ts-ignore
					   appDetailsStore.__proto__,
					   "GetDescriptions",
					   (args) => {
						   if (!module.isValid)
							   return callOriginal;
						   const overview = appStore.GetAppOverviewByAppID(args[0])
						   if (overview.app_type == 1073741824)
						   {
							   let appData = appDetailsStore.GetAppData(args[0])
							   // if (appData && !appData?.descriptionsData)
							   if (appData)
							   {
								   const data = module.fetchData(args[0])
								   const desc = module.descriptions ? data?.description ?? t("noDescription") : "";
								   module.logger.debug(desc);
								   stateTransaction(() => {
									   appData.descriptionsData = {
										   strFullDescription: desc,
										   strSnippet: desc
									   }
									   appDetailsCache.SetCachedDataForApp(args[0], "descriptions", 1, appData.descriptionsData)
								   })

								   return appData.descriptionsData;
							   }
						   }
						   return callOriginal;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   // @ts-ignore
					   appDetailsStore.__proto__,
					   "GetDescriptions",
					   (args, ret: {
						   strFullDescription: ReactNode,
						   strSnippet: ReactNode
					   }): {
						   strFullDescription: ReactNode,
						   strSnippet: ReactNode
					   } => {
						   if (!module.isValid)
							   return ret;
						   const overview = appStore.GetAppOverviewByAppID(args[0])
						   // if (overview.app_type != 1073741824)
						   // {
						   if (module.config.markdown)
							   return {
								   strFullDescription: <Markdown>
									   {module.config.title_header ? `# ${overview.display_name}\n` + ret?.strFullDescription as string : ret?.strFullDescription as string}
								   </Markdown>,
								   strSnippet: <Markdown>
									   {module.config.title_header ? `# ${overview.display_name}\n` + ret?.strSnippet as string : ret?.strSnippet as string}
								   </Markdown>
							   }
						   else
							   return ret
						   // }
						   // return ret;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return replacePatch(
					   // @ts-ignore
					   appStore.allApps[0].__proto__,
					   "BHasStoreCategory",
					   function (args) {
						   if (!module.isValid || !module.categories)
							   return callOriginal;
						   // @ts-ignore
						   if ((this as SteamAppOverview).app_type == 1073741824)
						   {
							   // @ts-ignore
							   const data = module.fetchData((this as SteamAppOverview).appid)
							   const categories = data?.store_categories ?? [];
							   if (categories.includes(args[0]))
							   {
								   return true
							   }
							   module.logger.debug(`categories`, categories)
						   }
						   return callOriginal;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return replacePatch(
					   // @ts-ignore
					   appDetailsStore.__proto__,
					   "GetAssociations",
					   (args) => {
						   if (!module.isValid || !module.associations)
							   return callOriginal;
						   if (appStore.GetAppOverviewByAppID(args[0]).app_type == 1073741824)
						   {
							   let appData = appDetailsStore.GetAppData(args[0])
							   if (appData && !appData?.associationData)
							   {
								   const data = module.fetchData(args[0])
								   const devs = data?.developers ?? [];
								   const pubs = data?.publishers ?? [];
								   module.logger.debug(`associations for ${args[0]}`, devs, pubs)
								   stateTransaction(() => {
									   appData.associationData = {
										   rgDevelopers: devs.map(value => ({
											   strName: value.name,
											   strURL: value.url
										   })),
										   rgPublishers: pubs.map(value => ({
											   strName: value.name,
											   strURL: value.url
										   })),
										   rgFranchises: []
									   }
									   appDetailsCache.SetCachedDataForApp(args[0], "associations", 1, appData.associationData)
								   })
							   }
						   }
						   return callOriginal;
					   }
				)
			}
		})

		// const runGameHook = beforePatch(
		// 		runGame.m[runGame.prop].prototype,
		// 		"constructor",
		// 		() =>
		// 		{
		// 			metadataManager.should_bypass = true
		// 		}
		// )
		// logger.log("runGame", runGame)

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   // @ts-ignore
					   appDetailsStore.__proto__,
					   "BHasRecentlyLaunched",
					   (_, ret) => {
						   if (!module.isValid)
							   return ret;
						   module.bypassCounter = 4
					   }
				)
			}
		})

		// mounts.addMount(contextMenuPatch(LibraryContextMenu))

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "BIsModOrShortcut",
					   function (_, ret) {
						   if (!module.isValid || !module.typeOverride)
							   return ret;
						   if (ret === true)
						   {
							   if (module.bypassBypass > 0)
							   {
								   module.logger.debug("Bypassing", module.bypassBypass)
								   if (module.bypassBypass > 0)
									   module.bypassBypass--
								   return false;
							   }
							   // @ts-ignore
							   if (Router?.WindowStore?.GamepadUIMainWindowInstance?.m_history?.location?.pathname === '/library/home')
							   {
								   return false;
							   }
							   if (module.bypassCounter > 0)
							   {
								   module.bypassCounter--;
							   }
							   return module.bypassCounter === -1 || module.bypassCounter > 0
						   }
						   return ret;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return beforePatch(
					   appStore.allApps[0].__proto__,
					   "GetGameID",
					   function (_) {
						   if (!module.isValid)
							   return;
						   module.bypassCounter = -1
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "GetGameID",
					   function (_, ret) {
						   if (!module.isValid)
							   return ret;
						   module.bypassCounter = 0
						   return ret;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return beforePatch(
					   appStore.allApps[0].__proto__,
					   "GetPrimaryAppID",
					   function (_) {
						   if (!module.isValid)
							   return;
						   module.bypassCounter = -1
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "GetPrimaryAppID",
					   function (_, ret) {
						   if (!module.isValid)
							   return ret;
						   module.bypassCounter = 0
						   return ret;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "GetCanonicalReleaseDate",
					   function (_, ret) {
						   if (!module.isValid || !module.releaseDate)
							   return ret;
						   module.logger.debug(ret);
						   // @ts-ignore
						   if (this.app_type == 1073741824)
						   {
							   // @ts-ignore
							   const data = module.fetchData(this.appid);
							   module.logger.debug("data", data);
							   if (data?.release_date)
							   {
								   return data.release_date
							   }
						   }
						   return ret;
					   }
				)
			}
		})

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "GetPerClientData",
					   function (_, ret) {
						   if (!module.isValid)
							   return ret;
						   module.bypassCounter = 4;
						   return ret;
					   }
				)
			}
		})


		// mounts.addPatchMount({
		// 	patch(): Patch
		// 	{
		// 		const CompatContainer = findModuleExport((e) => e?.toString().includes("SteamDeckCompatInfo"));
		// 		return afterPatch(fakeRenderComponent(() => <CompatContainer
		// 			   category={SteamDeckCompatCategory.UNKNOWN} className={""}/>), "type", (args, ret) => {
		// 			module.logger.debug("args", args);
		// 			module.logger.debug("ret", ret);
		// 			return ret;
		// 		});
		// 	}
		// })

		mounts.addPatchMount({
			patch(): Patch
			{
				const AppGameInfoContainer = findModuleExport((e) => e?.toString()?.includes("().AppGameInfoContainer"));
				module.logger.debug("AppGameInfoContainer", AppGameInfoContainer);


				return afterPatch(AppGameInfoContainer.prototype, "render", (_, ret) => {
					if (!module.isValid)
						return ret;

					const component = findInReactTree(ret, (e) => e?.props?.onImageLoad);

					beforePatch(component.type.prototype, "render", function (_) {
						//@ts-ignore
						this.m_bDelayedLoad = false
					})

					afterPatch(component.type.prototype, "render", function (_, ret) {
						if (!module.isValid || !ret)
							return ret;

						const featuresList = findInReactTree(ret, (e) => Array.isArray(e?.props?.children) && e?.props?.children?.length > 10);
						const overview: SteamAppOverview = featuresList?.props?.children?.[0]?.props?.overview

						for (const category of Object.values(CustomStoreCategory))
						{
							if (typeof category != "string" && !(featuresList?.props?.children as Array<ReactElement>)?.some(value => value?.props?.feature == category))
							{
								(featuresList?.props?.children as Array<ReactElement>)?.push(<CustomFeature
									   feature={category} minimode={false} overview={overview}
									   suppresstooltip={true}/>);
							}
						}


						return ret;
					});
					return ret;
				});
			}
		});


		mounts.addMount(routePatch("/library/app/:appid", (tree: any) => {
			const routeProps = findInReactTree(tree, (x: any) => x?.renderFunc);

			afterPatch(routeProps, "renderFunc", (_, ret) => {
				if (!module.enabled)
					return ret;
				const overview: SteamAppOverview = ret.props.children.props.overview;
				const details: SteamAppDetails = ret.props.children.props.details;

				if (overview.app_type == 1073741824)
				{
					module.bypassBypass = 11;
					void this.applyApp(overview, details);
				}

				return ret;
			});

			return tree;
		}))

		mounts.addMount(routePatch("/library", (props: { path?: string, children?: ReactNode }) => {

			afterPatch(props.children, "type", (_, ret) => {
				if (!module.enabled)
					return ret;

				for (const appId of this.state.apps)
					void this.apply(appId)

				return ret;
			})
			return props;
		}))

		// mounts.addMount({
		// 	mount()
		// 	{
		// 		addStyle("mdx", mdx)
		// 	},
		// 	dismount()
		// 	{
		// 		removeStyle("mdx")
		// 	}
		// })
	}

	progressDescription(data?: MetadataData): string
	{
		return format(t("foundMetadata"), truncate(data?.description, {
			'length': 512,
			'omission': "..."
		}));
	}

	get typeOverride(): boolean
	{
		return this.config.type_override
	}

	set typeOverride(typeOverride: boolean)
	{
		this.config.type_override = typeOverride
	}

	get descriptions(): boolean
	{
		return this.config.descriptions
	}

	set descriptions(descriptions: boolean)
	{
		this.config.descriptions = descriptions
	}

	get releaseDate(): boolean
	{
		return this.config.release_date
	}

	set releaseDate(release_date: boolean)
	{
		this.config.release_date = release_date
	}

	get associations(): boolean
	{
		return this.config.associations
	}

	set associations(associations: boolean)
	{
		this.config.associations = associations
	}

	get categories(): boolean
	{
		return this.config.categories
	}

	set categories(categories: boolean)
	{
		this.config.categories = categories
	}

	get rating(): boolean
	{
		return this.config.rating
	}

	set rating(rating: boolean)
	{
		this.config.rating = rating
	}

	get installSize(): boolean
	{
		return this.config.install_size
	}

	set installSize(install_size: boolean)
	{
		this.config.install_size = install_size
	}

	get installDate(): boolean
	{
		return this.config.install_date
	}

	set installDate(install_date: boolean)
	{
		this.config.install_date = install_date
	}

	get markdown(): boolean
	{
		return this.config.markdown
	}

	set markdown(markdown: boolean)
	{
		this.config.markdown = markdown
	}

	get titleHeader(): boolean
	{
		return this.config.title_header
	}

	set titleHeader(title_header: boolean)
	{
		this.config.title_header = title_header
	}

	settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [typeOverride, setTypeOverride] = useState(this.typeOverride)
		const [descriptions, setDescriptions] = useState(this.descriptions)
		const [releaseDate, setReleaseDate] = useState(this.releaseDate)
		const [associations, setAssociations] = useState(this.associations)
		const [categories, setCategories] = useState(this.categories)
		const [rating, setRating] = useState(this.rating)
		const [installSize, setInstallSize] = useState(this.installSize)
		const [installDate, setInstallDate] = useState(this.installDate)
		const [markdown, setMarkdown] = useState(this.markdown)
		const [titleHeader, setTitleHeader] = useState(this.titleHeader)

		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("metadataSettingsTypeOverride")}
						description={t("metadataSettingsTypeOverrideDesc")}>
						<Toggle
							value={typeOverride}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setTypeOverride(checked);
								this.typeOverride = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsDescriptions")}
						description={!typeOverride ?
							format(t("settingsDependencyNotMet"), t("metadataSettingsDescriptions"), t("metadataSettingsTypeOverride")) :
							t("metadataSettingsDescriptionsDesc")}>
						<Toggle
							value={descriptions}
							disabled={loadingData.loading || !typeOverride}
							onChange={(checked) => {
								setDescriptions(checked);
								this.descriptions = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsReleaseDate")}
						description={!typeOverride ?
							format(t("settingsDependencyNotMet"), t("metadataSettingsReleaseDate"), t("metadataSettingsTypeOverride")) :
							t("metadataSettingsReleaseDateDesc")}>
						<Toggle
							value={releaseDate}
							disabled={loadingData.loading || !typeOverride}
							onChange={(checked) => {
								setReleaseDate(checked);
								this.releaseDate = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsAssociations")}
						description={!typeOverride ?
							format(t("settingsDependencyNotMet"), t("metadataSettingsAssociations"), t("metadataSettingsTypeOverride")) :
							t("metadataSettingsAssociationsDesc")}>
						<Toggle
							value={associations}
							disabled={loadingData.loading || !typeOverride}
							onChange={(checked) => {
								setAssociations(checked);
								this.associations = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("metadataSettingsCategories")}
						description={t("metadataSettingsCategoriesDesc")}>
						<Toggle
							value={categories}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setCategories(checked);
								this.categories = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsRating")}
						description={t("metadataSettingsRatingDesc")}>
						<Toggle
							value={rating}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setRating(checked);
								this.rating = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsInstallSize")}
						description={t("metadataSettingsInstallSizeDesc")}>
						<Toggle
							value={installSize}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setInstallSize(checked);
								this.installSize = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsInstallDate")}
						description={t("metadataSettingsInstallDateDesc")}>
						<Toggle
							value={installDate}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setInstallDate(checked);
								this.installDate = checked;
							}}/>
					</Field>
				</DialogControlsSection>

				<DialogControlsSection>
					<Field
						label={t("metadataSettingsMarkdown")}
						description={t("metadataSettingsMarkdownDesc")}>
						<Toggle
							value={markdown}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setMarkdown(checked);
								this.markdown = checked;
							}}/>
					</Field>
					<Field
						label={t("metadataSettingsTitleHeader")}
						description={!markdown ?
							format(t("settingsDependencyNotMet"), t("metadataSettingsTitleHeader"), t("metadataSettingsMarkdown")) :
							t("metadataSettingsTitleHeaderDesc")}>
						<Toggle
							value={titleHeader}
							disabled={loadingData.loading || !markdown}
							onChange={(checked) => {
								setTitleHeader(checked);
								this.titleHeader = checked;
							}}/>
					</Field>
				</DialogControlsSection>
			</>
		);
	};

	async applyOverview(overview: SteamAppOverview): Promise<void>
	{
		if (this.rating)
			overview.metacritic_score = Math.round(this.data[overview.appid]?.rating ?? 0);
		if (this.categories)
			this.data[overview.appid]?.store_categories?.forEach(category => overview.m_setStoreCategories.add(category));
		if (this.installSize)
			overview.size_on_disk = this.data[overview.appid]?.install_size?.toString() ?? "0";
		if (this.installDate)
			overview.rt_purchased_time = this.data[overview.appid]?.install_date;
	}

	async provideDefault(appId: number): Promise<MetadataData | undefined>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return undefined;
		const launchCommand = getLaunchCommand(details);
		const cats: (StoreCategory | CustomStoreCategory)[] = await getShortcutCategories(launchCommand);

		return {
			title: details.strDisplayName,
			id: 0,
			description: t("noDescription"),
			store_categories: cats
		}
	}
}