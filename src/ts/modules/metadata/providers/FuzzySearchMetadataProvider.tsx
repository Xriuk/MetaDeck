import { callable } from "@decky/api";
import type { EntryData, IDDictionary, MetadataData } from "../../../Interfaces";
import type Logger from "../../../logger";
import { getLaunchCommand, getShortcutCategories, isEmulatedGame, romRegex } from "../../../shortcuts";
import { closestWithLimit, getAppDetails } from "../../../util";
import type { ProviderConfig, ProviderCache } from "../../Provider";
import { MetadataProvider } from "../MetadataProvider";
import { useState } from "react";
import { DialogControlsSection, Field, SliderField } from "@decky/ui";
import { IdOverrideComponent } from "../../IdOverrideComponent";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t } from "../../../useTranslations";
import React from "react";

export interface FuzzySearchMetadataProviderConfig extends ProviderConfig{
	fuzziness: number,
	overrides: IDDictionary
}

export interface FuzzySearchMetadataProviderCache extends ProviderCache{

}

export abstract class FuzzySearchMetadataProvider<Identifier extends "steam" | "rawg" | "lizardbyte">
	extends MetadataProvider<Identifier>{

	abstract logger: Logger;

	get overrides(): IDDictionary{
		return this.config.overrides;
	}

	set overrides(data: IDDictionary){
		this.config.overrides = data;
		void this.saveConfig();
	}

	get fuzziness(): number{
		return this.config.fuzziness;
	}

	set fuzziness(fuzziness: number){
		this.config.fuzziness = fuzziness;
		void this.saveConfig();
	}

	override async test(appId: number): Promise<boolean>{
		if (this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return false;

		// We return true to not double search, as we'll do it inside provide
		return true;
	}

	provide(appId: number): Promise<MetadataData | undefined>{
		if(this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return Promise.resolve(undefined);

		return this.throttle(() => this.getMetadataForGame(appId));
	}

	protected abstract search(title: string): Promise<MetadataData[]>;

	// Used to retrieve initial data for all the results in search and more specific data here if needed
	protected enrichMetadataForGame(_appId: number, _game: MetadataData): Promise<void>{
		return Promise.resolve();
	}

	protected async pickDefaultEntry<Entry extends EntryData>(results: Entry[], appId: number): Promise<Entry[]>{
		const details = await getAppDetails(appId);
		if(!details)
			return [];

		const display_name = details.strDisplayName;
		const names = results.map(value => value.title);
		const closest_name = closestWithLimit(this.fuzziness, display_name, names);

		return results.filter(value => value.title === closest_name);
	}

	protected async getMetadataForGame(appId: number, external = false): Promise<MetadataData | undefined>{
		if((!external && this.excludedApps.includes(appId)) || this.overrides[appId] === 0)
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching metadata for game ${appId}`);

		const results = await this.getAllMetadataForGame(appId, external);
		if (!results.length)
			return undefined;

		this.logger.debug("Results", results);

		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);

		let games: MetadataData[];
		if (data_id === undefined){
			games = await this.pickDefaultEntry(results, appId);

			this.logger.debug(games[0]?.title ?? "", results.map(value => value.title));
			this.logger.debug("Games: ", games);
		}
		else
			games = results.filter(value => value.id === data_id);

		const game = games.reverse().pop();
		if (game){
			game.store_categories = (game.store_categories ?? []).concat(await getShortcutCategories(getLaunchCommand(details)));

			await this.enrichMetadataForGame(appId, game);
		}
		this.logger.debug(game);

		return game;
	}

	protected async getAllMetadataForGame(appId: number, external = false): Promise<MetadataData[]>{
		if((!external && this.excludedApps.includes(appId)) || this.overrides[appId] === 0)
			return [];

		const details = await getAppDetails(appId);
		if(!details)
			return [];

		const display_name = details.strDisplayName;
		return await this.search(display_name);
	}

	private file_size: (path: string) => Promise<number> = callable("file_size");
	private file_date: (path: string) => Promise<number> = callable("file_date");

	override async apply(appId: number, data: MetadataData): Promise<void>{
		if(this.excludedApps.includes(appId))
			return;

		const details = await getAppDetails(appId);
		if(!details)
			return;
		
		const launchCommand = getLaunchCommand(details);
		if (isEmulatedGame(launchCommand)){
			const path = launchCommand.match(romRegex)?.[0]
			if (path){
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
					<IdOverrideComponent
						source={this}
						value={overrides}
						disabled={loadingData.loading}
						onChange={(value) => {
							let oldValue = this.overrides;
							setOverrides(value);
							this.overrides = value;
							void this.onOverridesChange(oldValue, value);
						}}
						resultsForApp={(appId) => this.throttle(() => this.getAllMetadataForGame(appId))}
						defaultResults={(results, appId) => this.pickDefaultEntry(results, appId)} />
				</DialogControlsSection>
			</>
		);
	};
}