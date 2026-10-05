import { FaGamepad } from "react-icons/fa";
import { inheritSettings, StoreCategory, type MetadataData } from "../../../Interfaces";
import Logger from "../../../logger";
import { getLaunchCommand, getShortcutCategories } from "../../../shortcuts";
import { t } from "../../../useTranslations";
import { getAppDetails } from "../../../util";
import { RetroAchievementsAchievementsProvider } from "../../achievements/providers/RetroAchievementsAchievementsProvider";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import type { ResolverCache, ResolverConfig } from "../../Resolver";
import type { MetadataProviderConfigs } from "../MetadataModule";
import { MetadataProvider } from "../MetadataProvider";

export interface RetroAchievementsMetadataProviderConfig extends ProviderConfig<{}, ResolverConfig>
{
	
}

export interface RetroAchievementsMetadataProviderCache extends ProviderCache<{}, ResolverCache>
{
	
}

export class RetroAchievementsMetadataProvider extends MetadataProvider<any>{
	resolvers = [];

	static identifier: keyof MetadataProviderConfigs = "ra";
	static title: string = t("providerAchievementsRA");
	identifier: keyof MetadataProviderConfigs = RetroAchievementsMetadataProvider.identifier;
	title: string = RetroAchievementsMetadataProvider.title;

	logger: Logger = new Logger(RetroAchievementsMetadataProvider.identifier);

	private _raProvider?: RetroAchievementsAchievementsProvider;
	get raProvider(): RetroAchievementsAchievementsProvider
	{
		if(!this._raProvider){
			this._raProvider = this.state.modules.achievements.providers.find(p => p instanceof RetroAchievementsAchievementsProvider);
			if(!this._raProvider)
				this._raProvider = new RetroAchievementsAchievementsProvider(this.state.modules.achievements);
		}

		return this._raProvider;
	}

	override test(appId: number): Promise<boolean> {
		return this.raProvider.test(appId, true);
	}

	async provide(appId: number): Promise<MetadataData | undefined> {
		const game = await this.raProvider.getGameInfoAndProgress(appId);
		if(!game)
			return undefined;

		const details = await getAppDetails(appId);
		if (!details)
			return undefined;

		const cats = await getShortcutCategories(getLaunchCommand(details));
		cats.push(StoreCategory.SinglePlayer);

		return {
			id: game.ID,
			title: game.Title,
			description: t("noDescription"),
			release_date: game.Released ? Math.floor(Date.parse(game.Released) / 1000) : undefined,
			developers: game.Developer ? [{ name: game.Developer, url: '' }] : undefined,
			publishers: game.Publisher ? [{ name: game.Publisher, url: '' }] : undefined,
			store_categories: cats
		};
	}

	override icon = <FaGamepad/>;

	override settingsComponent = () => {
		return inheritSettings(this.raProvider)();
	};
}