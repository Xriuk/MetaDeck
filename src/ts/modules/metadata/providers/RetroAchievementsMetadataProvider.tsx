import { FaGamepad } from "react-icons/fa";
import { inheritSettings, StoreCategory, type MetadataData } from "../../../Interfaces";
import Logger from "../../../logger";
import { getLaunchCommand, getShortcutCategories } from "../../../shortcuts";
import { t } from "../../../useTranslations";
import { getAppDetails } from "../../../util";
import { RetroAchievementsAchievementsProvider } from "../../achievements/providers/RetroAchievementsAchievementsProvider";
import type { ProviderCache, ProviderConfig } from "../../Provider";
import { MetadataProvider } from "../MetadataProvider";

export interface RetroAchievementsMetadataProviderConfig extends ProviderConfig{
	
}

export interface RetroAchievementsMetadataProviderCache extends ProviderCache{
	
}

export class RetroAchievementsMetadataProvider extends MetadataProvider<"ra">{
	identifier = "ra" as const;
	title = t("providerAchievementsRA");

	logger = new Logger(this.identifier);

	override get isValid(): boolean {
		return super.isValid && this.raProvider.isValid;
	}

	private _raProvider?: RetroAchievementsAchievementsProvider;
	get raProvider(): RetroAchievementsAchievementsProvider{
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