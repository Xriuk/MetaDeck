import { callable } from "@decky/api";
import type { ID, IDDictionary, MetadataData } from "../../../Interfaces";
import type Logger from "../../../logger";
import { getLaunchCommand, getShortcutCategories, isEmulatedGame, romRegex } from "../../../shortcuts";
import { closestWithLimit, distanceWithLimit, getAppDetails } from "../../../util";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import type { ResolverConfig, ResolverCache } from "../../Resolver";
import { MetadataProvider } from "../MetadataProvider";
import { useState } from "react";
import { DialogControlsSection, Field, SliderField } from "@decky/ui";
import { IdOverrideComponent, type OverrideEntry } from "../../IdOverrideComponent";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t } from "../../../useTranslations";
import React from "react";

export interface FuzzySearchMetadataProviderConfig extends ProviderConfig<{}, ResolverConfig>
{
	fuzziness: number,
	overrides: IDDictionary
}

export interface FuzzySearchMetadataProviderCache extends ProviderCache<{}, ResolverCache>
{

}

export abstract class FuzzySearchMetadataProvider extends MetadataProvider<any>{
	resolvers = [];

	abstract logger: Logger;

	get overrides(): IDDictionary
	{
		return (this.config as FuzzySearchMetadataProviderConfig).overrides;
	}

	set overrides(data: IDDictionary)
	{
		(this.config as FuzzySearchMetadataProviderConfig).overrides = data;
		void this.module.saveData();
	}

	get fuzziness(): number
	{
		return (this.config as FuzzySearchMetadataProviderConfig).fuzziness;
	}

	set fuzziness(fuzziness: number)
	{
		(this.config as FuzzySearchMetadataProviderConfig).fuzziness = fuzziness;
		void this.module.saveData();
	}

	// DEV: maybe make abstract and avoid double-search?
	override async test(appId: number): Promise<boolean>
	{
		if(this.excludedApps.indexOf(appId) !== -1 || this.overrides[appId] === 0)
			return false;

		const details = await getAppDetails(appId);
		if(!details)
			return false;

		const display_name = details.strDisplayName;
		const results = await this.throttle(() => this.search(display_name));

		const names = results.map(value => value.title);
		const closest_names = distanceWithLimit(this.fuzziness, display_name, names);
		return closest_names.length > 0;
	}

	provide(appId: number): Promise<MetadataData | undefined>
	{
		if(this.excludedApps.indexOf(appId) !== -1 || this.overrides[appId] === 0)
			return Promise.resolve(undefined);

		return this.throttle(() => this.getMetadataForGame(appId));
	}

	protected abstract search(title: string): Promise<MetadataData[]>;

	// Used to retrieve initial data for all the results in search and more specific data here if needed
	protected enrichMetadataForGame(_appId: number, _game: MetadataData): Promise<void>{
		return Promise.resolve();
	}

	protected async getMetadataForGame(appId: number): Promise<MetadataData | undefined>
	{
		if(this.excludedApps.indexOf(appId) !== -1 || this.overrides[appId] === 0)
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching metadata for game ${appId}`);

		const display_name = details.strDisplayName;
		const results = await this.search(display_name);
		if (!results.length)
			return undefined;

		this.logger.debug("Results", results);

		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);

		let games: MetadataData[];
		if (data_id === undefined)
		{
			const names = results.map(value => value.title);
			const closest_name = closestWithLimit(this.fuzziness, display_name, names);
			this.logger.debug(closest_name, names);

			games = results.filter(value => value.title === closest_name);
			this.logger.debug("Games: ", games);
		}
		else
			games = results.filter(value => value.id === data_id);

		const game = games.reverse().pop();
		if (game)
		{
			game.store_categories = game.store_categories.concat(await getShortcutCategories(getLaunchCommand(details)));

			await this.enrichMetadataForGame(appId, game);
		}
		this.logger.debug(game);
		return game;
	}

	protected async getAllMetadataForGame(appId: number): Promise<Record<ID, Pick<MetadataData, 'title' | 'id'>> | undefined>
	{
		if(this.excludedApps.indexOf(appId) !== -1)
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		const display_name = details.strDisplayName;
		const results = await this.search(display_name);

		// We add all results without limiting them for overrides
		if (!results.length)
			return undefined;

		let ret: Record<ID, MetadataData> = {};
		for (let game of results){
			ret[game.id] = game;
		}
		return ret;
	}

	private file_size: (path: string) => Promise<number> = callable("file_size");
	private file_date: (path: string) => Promise<number> = callable("file_date");

	override async apply(appId: number, data: MetadataData): Promise<void>
	{
		if(this.excludedApps.indexOf(appId) !== -1)
			return;

		const details = await getAppDetails(appId);
		if(!details)
			return;
		
		const launchCommand = getLaunchCommand(details);
		if (isEmulatedGame(launchCommand))
		{
			const path = launchCommand.match(romRegex)?.[0]
			if (path)
			{
				data.install_size = await this.file_size(path);
				data.install_date = await this.file_date(path);
			}
		}
	}

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);
		return (
			<>
				<DialogControlsSection>
					<Field
						label={t("fuzziness")}
						description={
							<SliderField
								value={fuzziness}
								disabled={loadingData.loading}
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
						} />
				</DialogControlsSection>

				<DialogControlsSection>
					<IdOverrideComponent
						provider={this}
						value={overrides}
						disabled={loadingData.loading}
						onChange={async (value) => {
							let oldValue = this.overrides;
							setOverrides(value);
							this.overrides = value;
							await this.onOverridesChange(oldValue, value);
						}}
						resultsForApp={async (appId) => {
							const ret: Record<ID, OverrideEntry<ID>> = {}
							for (const [id, value] of Object.entries(await this.throttle(() => this.getAllMetadataForGame(appId)) ?? []))
							{
								ret[id] = {
									label: appStore.GetAppOverviewByAppID(appId).display_name,
									title: value.title,
									id: id,
									appId: appId
								}
							}
							return ret;
						}} />
				</DialogControlsSection>
			</>
		);
	};
}