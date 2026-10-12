import {ProviderCache, ProviderConfig} from "../../Provider";
import {CompatdataProvider} from "../CompatdataProvider";
import {CompatdataData, type EntryData, type IDDictionary} from "../../../Interfaces";
import {useState} from "react";
import {closestWithLimit, getAppDetails} from "../../../util";
import { DialogControlsSection, Field, SliderField } from "@decky/ui";
import type Logger from "../../../logger";
import { IdOverrideComponent } from "../../IdOverrideComponent";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t } from "../../../useTranslations";

export interface FuzzySearchCompatdataProviderConfig extends ProviderConfig{
	fuzziness: number,
	overrides: IDDictionary
}

export interface FuzzySearchCompatdataProviderCache extends ProviderCache{

}

// DEV: merge somehow with FuzzySearchMetadataProvider
export abstract class FuzzySearchCompatdataProvider<Identifier extends "dolphin" | "cemu" | "emudeck"> extends CompatdataProvider<Identifier>{
	abstract logger: Logger;

	get overrides(): IDDictionary{
		return this.config.overrides;
	}

	set overrides(data: IDDictionary)
	{
		this.config.overrides = data;
		void this.saveConfig();
	}

	get fuzziness(): number
	{
		return this.config.fuzziness;
	}

	set fuzziness(fuzziness: number)
	{
		this.config.fuzziness = fuzziness;
		void this.saveConfig();
	}

	// DEV: maybe make abstract and avoid double-search?
	override async test(appId: number): Promise<boolean>
	{
		if (this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return false;

		const details = await getAppDetails(appId);
		if(!details)
			return false;

		const results = await this.getAllCompatdataForGame(appId);
		if (!results.length)
			return false;

		const games = await this.pickDefaultEntry(results, appId);
		return games.length > 0;
	}

	provide(appId: number): Promise<CompatdataData | undefined>
	{
		if(this.excludedApps.includes(appId))
			return Promise.resolve(undefined);

		return this.throttle(() => this.getCompatdataForGame(appId));
	}

	protected abstract search(title: string): Promise<CompatdataData[]>;

	// Used to retrieve initial data for all the results in search and more specific data here if needed
	protected enrichCompatdataForGame(_appId: number, _game: CompatdataData): Promise<void>{
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

	protected async getCompatdataForGame(appId: number): Promise<CompatdataData | undefined>{
		if(this.excludedApps.includes(appId))
			return undefined;

		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching compatdata for game ${appId}`);

		const results = await this.getAllCompatdataForGame(appId);
		if (!results.length)
			return undefined;

		this.logger.debug("Results", results);

		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);

		let games: CompatdataData[];
		if (data_id === undefined)		{
			games = await this.pickDefaultEntry(results, appId);

			this.logger.debug(games[0]?.title ?? "", results.map(value => value.title));
			this.logger.debug("Games: ", games);
		}
		else
			games = results.filter(value => value.id === data_id);

		const game = games.reverse().pop();
		if (game)
			await this.enrichCompatdataForGame(appId, game);
		this.logger.debug(game);

		return game;
	}

	protected async getAllCompatdataForGame(appId: number): Promise<CompatdataData[]>{
		if(this.excludedApps.includes(appId) || this.overrides[appId] === 0)
			return [];

		const details = await getAppDetails(appId);
		if(!details)
			return [];

		const display_name = details.strDisplayName;
		return await this.search(display_name);
	}

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [fuzziness, setFuzziness] = useState(this.fuzziness);
		const [overrides, setOverrides] = useState(this.overrides);
		return (
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
					onChange={async (value) => {
						let oldValue = this.overrides;
						setOverrides(value);
						this.overrides = value;
						await this.onOverridesChange(oldValue, value);
					}}
					resultsForApp={(appId) => this.throttle(() => this.getAllCompatdataForGame(appId))}
					defaultResults={(results, appId) => this.pickDefaultEntry(results, appId)} />
			</DialogControlsSection>
		)
	}
}