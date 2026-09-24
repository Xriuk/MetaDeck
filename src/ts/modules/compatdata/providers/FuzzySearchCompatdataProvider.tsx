import {ProviderCache, ProviderConfig} from "../../Provider";
import {CompatdataProvider} from "../CompatdataProvider";
import {CompatdataData, type ID, type IDDictionary} from "../../../Interfaces";
import {useState} from "react";
import {closestWithLimit, distanceWithLimit, getAppDetails} from "../../../util";
import {ResolverCache, ResolverConfig} from "../../Resolver";
import { DialogControlsSection, Field, SliderField } from "@decky/ui";
import type Logger from "../../../logger";
import { IdOverrideComponent, type Entry } from "../../IdOverrideComponent";
import { useMetaDeckState } from "../../../MetaDeckState";
import { t } from "../../../useTranslations";

export interface FuzzySearchCompatdataProviderConfig extends ProviderConfig<{}, ResolverConfig>
{
	fuzziness: number,
	overrides: IDDictionary
}

export interface FuzzySearchCompatdataProviderCache extends ProviderCache<{}, ResolverCache>
{

}

export abstract class FuzzySearchCompatdataProvider extends CompatdataProvider<any>
{
	resolvers = [];

	abstract logger: Logger;

	get overrides(): IDDictionary
	{
		return (this.config as FuzzySearchCompatdataProviderConfig).overrides;
	}

	set overrides(data: IDDictionary)
	{
		(this.config as FuzzySearchCompatdataProviderConfig).overrides = data;
		void this.module.saveData();
	}

	get fuzziness(): number
	{
		return (this.config as FuzzySearchCompatdataProviderConfig).fuzziness;
	}

	set fuzziness(fuzziness: number)
	{
		(this.config as FuzzySearchCompatdataProviderConfig).fuzziness = fuzziness;
		void this.module.saveData();
	}

	async test(appId: number): Promise<boolean>
	{
		if (this.overrides[appId] == 0)
			return false;
		const display_name = appStore.GetAppOverviewByAppID(appId)?.display_name;
		const results = await this.throttle(() => this.search(display_name));
		const names = results.map(value => value.title);
		const closest_names = distanceWithLimit(this.fuzziness, display_name, names);
		return closest_names.length > 0;
	}

	provide(appId: number): Promise<CompatdataData | undefined>
	{
		return this.throttle(() => this.getCompatdataForGame(appId));
	}

	protected abstract search(title: string): Promise<CompatdataData[]>;

	public async getCompatdataForGame(appId: number): Promise<CompatdataData | undefined>
	{
		const details = await getAppDetails(appId);
		if(!details)
			return undefined;

		this.logger.debug(`Fetching compatdata for game ${appId}`)

		const display_name = details.strDisplayName;
		const data_id = this.overrides[appId];
		this.logger.debug("data_id", data_id);
		const results = await this.search(display_name);
		if (results.length > 0)
		{
			this.logger.debug("results", results);
			let games: CompatdataData[];
			if (data_id === undefined)
			{
				const names = results.map(value => value.title);
				const closest_name = closestWithLimit(this.fuzziness, display_name, names)
				this.logger.debug(closest_name, results.map(value => value.title))
				const games1 = results.filter(value => value.title === closest_name)
				this.logger.debug("Games: ", games1)
				games = games1;
			} else if (data_id === 0)
			{
				return undefined;
			} else
			{
				games = results.filter(value => value.id === data_id)
			}
			const game = games.reverse().pop();
			this.logger.debug(game);
			return game;

		} else return undefined;
		// } else reject(new Error(`HTTP ERROR: ${response.status}`));
	}

	protected async getAllCompatdataForGame(appId: number): Promise<Record<ID, CompatdataData> | undefined>
	{
		const display_name = appStore.GetAppOverviewByAppID(appId)?.display_name;
		const results = await this.search(display_name);

		// We add all results without limiting them for overrides
		if (results.length > 0)
		{
			let ret: Record<ID, CompatdataData> = {};
			for (let game of results)
			{
				ret[game.id] = game;
			}
			return ret;
		} else return undefined;
	}

	settingsComponent = () => {
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
					value={overrides}
					onChange={(value) => {
						setOverrides(value)
						this.overrides = value
					}}
					resultsForApp={async (appId) => {
						const ret: Record<ID, Entry<ID>> = {}
						for (const [id, value] of Object.entries(await this.throttle(() => this.getAllCompatdataForGame(appId)) ?? []))
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
		)
	}
}