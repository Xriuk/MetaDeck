import { definePlugin, Plugin, type DeckyRequestInit } from "@decky/api";
import { name } from "@decky/manifest"
import {FaDatabase} from "react-icons/fa";
import Logger from "./logger";
import {MetaDeckComponent} from "./MetaDeckComponent";
import {AppDetailsStore, AppStore} from "./SteamTypes";
import {Mounts} from "./System";
import {ReactNode} from "react";
import {MetaDeckState, MetaDeckStateContext, MetaDeckStateContextProvider} from "./MetaDeckState";
import {EventBus} from "./events";
import {staticClasses} from "@decky/ui";
import {SettingsComponent} from "./modules/SettingsComponent";
import {ProviderSettingsComponent} from "./modules/ProviderSettingsComponent";

declare global
{
	// @ts-ignore
	let SteamClient: SteamClient;
	let appStore: AppStore;
	// @ts-ignore
	let appDetailsStore: AppDetailsStore;

	let appDetailsCache: {
		SetCachedDataForApp(app_id: number, descriptions: string, number: number, descriptionsData: {
			strFullDescription: ReactNode;
			strSnippet: ReactNode
		} | {
			rgDevelopers: {
				strName: string,
				strURL: string
			}[],
			rgPublishers: {
				strName: string,
				strURL: string
			}[]
			rgFranchises: {
				strName: string,
				strURL: string
			}[]
		}): void;
	}

	// let collectionStore: CollectionStore;
	interface PluginLoader
	{
		plugins: Plugin[];
	}

	interface Window
	{
		DeckyPluginLoader: PluginLoader;

		MetaDeck__SECRET: {
			set bypassCounter(count: number)
		};
		MetaDeck: MetaDeckStateContext | undefined
	}

	let DeckyPluginLoader: {
		legacyFetchNoCors(url: string, request?: DeckyRequestInit | any): Promise<{
			success: boolean;
			result: { status: number; headers: { [key: string]: string }; body: string } | string | undefined
		}>
	}
}

// const AppDetailsSections = findModuleChild((m) =>
// {
// 	if (typeof m!=='object') return;
// 	for (const prop in m)
// 	{
// 		if (
// 				m[prop]?.toString &&
// 				m[prop].toString().includes("bShowGameInfo")
// 		) return m[prop];
// 	}
// 	return;
// });

// const AppInfoContainer = findModuleChild((m) =>
// {
// 	if (typeof m!=='object') return;
// 	for (const prop in m)
// 	{
// 		if (
// 				m[prop]?.toString &&
// 				m[prop].toString().includes("m_contentRef")
// 		) return m[prop];
// 	}
// 	return;
// });


// noinspection JSUnusedGlobalSymbols
export default definePlugin(() => {
	const logger = new Logger("Index");
	const eventBus = new EventBus();
	const mounts = new Mounts(eventBus, logger);
	const state = new MetaDeckState(eventBus, mounts);
	window.MetaDeck__SECRET = {
		set bypassCounter(count: number)
		{
			state.modules.metadata.bypassBypass = count
		}
	}


	// const checkOnlineStatus = async () => {
	// 	try
	// 	{
	// 		const online = await fetchNoCors("https://example.com");
	// 		return online.ok && online.status >= 200 && online.status < 300; // either true or false
	// 	} catch (err)
	// 	{
	// 		return false; // definitely offline
	// 	}
	// }
	//
	// const waitForOnline = async () => {
	// 	while (!(await checkOnlineStatus()))
	// 	{
	// 		logger.debug("No internet connection, retrying...");
	// 		await sleep(1000);
	// 	}
	// }

	mounts.addPageMount("/metadeck/settings", () =>
		   <MetaDeckStateContextProvider metaDeckState={state}>
			   <SettingsComponent/>
		   </MetaDeckStateContextProvider>
	)

	mounts.addPageMount("/metadeck/:module", () =>
		   <MetaDeckStateContextProvider metaDeckState={state}>
			   <ProviderSettingsComponent/>
		   </MetaDeckStateContextProvider>
	)


	const unregister = mounts.register()

	return {
		name,
		titleView: <div className={staticClasses.Title}>{name}</div>,
		content:
			<MetaDeckStateContextProvider metaDeckState={state}>
				<MetaDeckComponent/>
			</MetaDeckStateContextProvider>,
		icon: <FaDatabase/>,
		onDismount()
		{
			unregister();
		},
	};
});
