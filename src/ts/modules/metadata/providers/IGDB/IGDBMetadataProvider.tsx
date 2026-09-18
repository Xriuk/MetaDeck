import {
	CustomStoreCategory,
	Developer,
	MetadataData,
	Publisher,
	StoreCategory
} from "../../../../Interfaces";
import {Company, Game, GameMode, InvolvedCompany, MultiplayerMode} from "igdb-api-types";
import Logger from "../../../../logger";
import {FC, Fragment, useState} from "react";
import {PanelSectionRow, SliderField} from "@decky/ui";
import {Entry, IdOverrideComponent} from "../../../IdOverrideComponent";
import {fetchNoCors} from "@decky/api";
import {t} from "../../../../useTranslations";
import {MetadataProviderConfigs} from "../../MetadataModule";
import {IGDBApiServerComponent} from "./IGDBApiServerComponent";
import { FuzzySearchMetadataProvider, type FuzzySearchMetadataProviderCache, type FuzzySearchMetadataProviderConfig } from "../FuzzySearchMetadataProvider";

export interface APIServer
{
	name: string,
	url: string
}

export interface IGDBMetadataProviderConfig extends FuzzySearchMetadataProviderConfig
{
	api_server: APIServer | undefined,
	custom_api_servers: APIServer[]
}

export interface IGDBMetadataProviderCache extends FuzzySearchMetadataProviderCache
{
}

export class IGDBMetadataProvider extends FuzzySearchMetadataProvider
{
	static identifier: keyof MetadataProviderConfigs = "igdb";
	static title: string = t("providerMetadataIGDB");
	identifier: keyof MetadataProviderConfigs = IGDBMetadataProvider.identifier;
	title: string = IGDBMetadataProvider.title;

	logger: Logger = new Logger(IGDBMetadataProvider.identifier)

	get apiServer(): APIServer | undefined
	{
		return this.module.config.providers.igdb.api_server;
	}

	set apiServer(apiServer: APIServer | undefined)
	{
		this.module.config.providers.igdb.api_server = apiServer;
		void this.module.saveData();
	}

	get customApiServers(): APIServer[]
	{
		return this.module.config.providers.igdb.custom_api_servers;
	}

	set customApiServers(customApiServers: APIServer[])
	{
		this.module.config.providers.igdb.custom_api_servers = customApiServers;
		void this.module.saveData();
	}


	private gameToMetadataData(game: Game): MetadataData
	{
		const gameDevs: Developer[] = []
		const gamePubs: Publisher[] = []
		const gameCats: (StoreCategory | CustomStoreCategory)[] = [CustomStoreCategory.NonSteam]

		if (game.game_modes?.length)
		{
			for (let gameMode of game.game_modes)
			{
				gameMode = gameMode as GameMode
				if (gameMode.slug && gameMode.slug.length > 0)
				{
					switch (gameMode.slug)
					{
						case "single-player":
							gameCats.push(StoreCategory.SinglePlayer)
							break;
						case "multiplayer":
							gameCats.push(StoreCategory.MultiPlayer)
							break;
					}
				}
			}
		}

		if (game.multiplayer_modes?.length)
		{
			for (let multiplayerMode of game.multiplayer_modes)
			{
				multiplayerMode = multiplayerMode as MultiplayerMode
				if (multiplayerMode.onlinecoop) gameCats.push(StoreCategory.OnlineCoOp)
				if (multiplayerMode.offlinecoop) gameCats.push(StoreCategory.LocalCoOp)
				if (multiplayerMode.splitscreen || multiplayerMode.splitscreenonline) gameCats.push(StoreCategory.SplitScreen)
				if (multiplayerMode.onlinecoop || multiplayerMode.splitscreenonline) gameCats.push(StoreCategory.OnlineMultiPlayer)
				if (multiplayerMode.offlinecoop || multiplayerMode.lancoop || multiplayerMode.splitscreen) gameCats.push(StoreCategory.LocalMultiPlayer)
			}
		}

		if (game.involved_companies?.length)
		{
			for (let involvedCompany of game.involved_companies)
			{
				involvedCompany = involvedCompany as InvolvedCompany
				if (involvedCompany.company
					   && (involvedCompany.company as Company).name
					   && (involvedCompany.company as Company).name!!.length > 0
					   && (involvedCompany.company as Company).url
					   && (involvedCompany.company as Company).url!!.length > 0
				)
				{
					if (involvedCompany.developer)
					{
						gameDevs.push({
							name: (involvedCompany.company as Company).name!!,
							url: (involvedCompany.company as Company).url!!
						})
					}

					if (involvedCompany.publisher)
					{
						gamePubs.push({
							name: (involvedCompany.company as Company).name!!,
							url: (involvedCompany.company as Company).url!!
						})
					}
				}
			}
		}

		// const compatCategoryResult = this.verifiedDB.find(result => result.Game == closest(game.name ?? "", this.verifiedDB.map(e => e.Game)))
		// this.logger.debug("compatdata: ", compatCategoryResult)
		// let compatCategory = SteamDeckCompatCategory.UNKNOWN
		// if (compatCategoryResult)
		// {
		// 	if (compatCategoryResult.Boots == YesNo.YES && compatCategoryResult.Playable == YesNo.YES)
		// 		compatCategory = SteamDeckCompatCategory.VERIFIED
		// 	else if (compatCategoryResult.Boots == YesNo.YES && (compatCategoryResult.Playable == YesNo.NO || compatCategoryResult.Playable == YesNo.PARTIAL))
		// 		compatCategory = SteamDeckCompatCategory.PLAYABLE
		// 	else
		// 		compatCategory = SteamDeckCompatCategory.UNSUPPORTED
		// }

		return {
			title: game.name || "No Title",
			id: game.id,
			description: game.summary || t("noDescription"),
			developers: gameDevs,
			publishers: gamePubs,
			rating: game.aggregated_rating,
			release_date: game.first_release_date,
			store_categories: gameCats
		}
	}

	protected async search(title: string): Promise<MetadataData[]>
	{
		if (this.apiServer == undefined) return[]
		const response = (await fetchNoCors(`${this.apiServer.url}/search`, {
			method: "POST",
			headers: {
				"Accept": "application/json",
				"Content-Type": "application/json"
			},
			body: JSON.stringify({title})
		}));
		if (response.ok)
		{
			let games: Game[] = await response.json()
			// noinspection SuspiciousTypeOfGuard
			if (!(games instanceof Array))
				return this.throttle(() => this.search(title));
			games = games.sort((a, b) => a.id - b.id)
			return games.map<MetadataData>(game => this.gameToMetadataData(game)).sort((a, b) => (a.id as number) - (b.id as number))
		} else if (response.status == 429)
		{
			return this.throttle(() => this.search(title));
		} else if (response.status >= 500) return[]
		else throw Error(`Could not find metadata for "${title}": \n${await response.text()}`);
	}

	settingsComponent(): FC
	{
		const [apiServer, setApiServer] = useState(this.apiServer);
		const [customApiServers, setCustomApiServers] = useState(this.customApiServers);
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);
		return () => (
			   <Fragment>
				   <PanelSectionRow>
					   <SliderField
							 label={"Search Fuzziness"}
							 value={fuzziness}
							 min={0}
							 max={20}
							 step={1}
							 showValue={true}
							 resetValue={5}
							 editableValue={true}
							 validValues={'steps'}
							 onChange={(value) => {
								 setFuzziness(value);
								 this.fuzziness = value;
							 }}
					   />
				   </PanelSectionRow>
				   <PanelSectionRow>
					   <IGDBApiServerComponent
							 server={apiServer}
							 customServers={customApiServers}
							 onServerChange={(server) => {
								 setApiServer(server)
								 this.apiServer = server
							 }}
							 onCustomServersChange={(servers) => {
								 setCustomApiServers(servers)
								 this.customApiServers = servers
							 }}
					   />
				   </PanelSectionRow>
				   <PanelSectionRow>
					   <IdOverrideComponent
							 value={overrides}
							 onChange={(value) => {
								 setOverrides(value)
								 this.overrides = value
							 }}
							 resultsForApp={async (appId) => {
								 const ret: Record<number, Entry<number>> = {}
								 for (const [id, value] of Object.entries(await this.throttle(() => this.getAllMetadataForGame(appId)) ?? []))
								 {
									 ret[+id] = {
										 label: appStore.GetAppOverviewByAppID(appId).display_name,
										 title: value.title,
										 id: +id,
										 appId: appId
									 }
								 }
								 return ret;
							 }}
					   />
				   </PanelSectionRow>
			   </Fragment>
		)
	}
}