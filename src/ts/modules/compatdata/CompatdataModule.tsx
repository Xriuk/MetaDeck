import {Module, ModuleCache, ModuleConfig} from "../Module";
import {CompatdataData, SteamAppTypeShortcut, SteamDeckCompatCategory, SteamTestResult} from "../../Interfaces";
import {CompatdataProvider} from "./CompatdataProvider";
import {ReactNode, useState} from "react";
import {Mounts} from "../../System";
import Logger from "../../logger";
import {routePatch} from "../../RoutePatches";
import {t} from "../../useTranslations";
import {useMetaDeckState} from "../../MetaDeckState";
import {
	EmuDeckCompatdataProvider,
	EmuDeckCompatdataProviderCache,
	EmuDeckCompatdataProviderConfig
} from "./providers/EmuDeckCompatdataProvider";
import {afterPatch, DialogControlsSection, Field, Patch, Toggle} from "@decky/ui";
import {SteamAppDetails, SteamAppOverview } from "../../SteamTypes";
import { PCSX2CompatdataProvider, type PCSX2CompatdataProviderCache, type PCSX2CompatdataProviderConfig } from "./providers/PCSX2CompatdataProvider";
import { RPCS3CompatdataProvider, type RPCS3CompatdataProviderCache, type RPCS3CompatdataProviderConfig } from "./providers/RPCS3CompatdataProvider";
import { XeniaCompatdataProvider, type XeniaCCompatdataProviderCache, type XeniaCompatdataProviderConfig } from "./providers/XeniaCompatdataProvider";
import { DolphinCompatdataProvider, type DolphinCompatdataProviderCache, type DolphinCompatdataProviderConfig } from "./providers/DolphinCompatdataProvider";
import { FaCheckCircle } from "react-icons/fa";
import { CemuCompatdataProvider, type CemuCompatdataProviderCache, type CemuCompatdataProviderConfig } from "./providers/CemuCompatdataProvider";

//const SteamDeckIcon = IconsModule && Object.entries(IconsModule)?.find(icon => icon[0] === "SteamPal")?.[1] as FC<SVGAttributes<SVGElement>>;
//const SteamMachineIcon = IconsModule && Object.entries(IconsModule)?.find(icon => icon[0] === "SteamMachineIcon")?.[1] as FC<SVGAttributes<SVGElement>>;
//const SteamFrameIcon = IconsModule && Object.entries(IconsModule)?.find(icon => icon[0] === "SteamFrameIcon")?.[1] as FC<SVGAttributes<SVGElement>>;

export interface CompatdataConfig extends ModuleConfig<CompatdataProviderConfigs>{
	verified: boolean;
	notes: boolean;
	test_results: boolean;
}

export interface CompatdataCache extends ModuleCache<CompatdataProviderCaches, CompatdataData>{

}

export interface CompatdataProviderConfigs{
	emudeck: EmuDeckCompatdataProviderConfig;
	pcsx2: PCSX2CompatdataProviderConfig;
	rpcs3: RPCS3CompatdataProviderConfig;
	xenia: XeniaCompatdataProviderConfig;
	dolphin: DolphinCompatdataProviderConfig;
	cemu: CemuCompatdataProviderConfig;
}

export interface CompatdataProviderCaches{
	emudeck: EmuDeckCompatdataProviderCache;
	pcsx2: PCSX2CompatdataProviderCache;
	rpcs3: RPCS3CompatdataProviderCache;
	xenia: XeniaCCompatdataProviderCache;
	dolphin: DolphinCompatdataProviderCache;
	cemu: CemuCompatdataProviderCache;
}


export class CompatdataModule extends Module<"compatdata", CompatdataProvider<any>>{
	identifier = "compatdata" as const;
	title = t("moduleCompatdata");

	logger = new Logger(this.identifier);

	providers: CompatdataProvider<any>[] = [
		new PCSX2CompatdataProvider(this),
		new RPCS3CompatdataProvider(this),
		new XeniaCompatdataProvider(this),
		new DolphinCompatdataProvider(this),
		new CemuCompatdataProvider(this),
		new EmuDeckCompatdataProvider(this)
	];

	dependencies = [
		"metadata" as const
	];

	addMounts(mounts: Mounts): void{
		const module = this;

		mounts.addPatchMount({
			patch(): Patch{
				return afterPatch(
					appStore.allApps[0].__proto__,
					"BIsModOrShortcut",

					function (_, ret) {
						if (!module.isValid)
							return ret;

						// @ts-ignore
						const overview: SteamAppOverview = this;
						if (overview.app_type == SteamAppTypeShortcut && !module.excludedApps.includes(overview.appid))
							void module.applyOverview(overview);

						return ret;
					}
				);
			}
		});

		mounts.addMount(routePatch("/library/app/:appid", (props: { path?: string, children?: any }) => {
			afterPatch(props.children.props, "renderFunc", (_, ret) => {
				if (!module.isValid)
					return ret;

				const overview: SteamAppOverview = ret.props.children.props.overview;
				const details: SteamAppDetails = ret.props.children.props.details;

				if (overview.app_type == SteamAppTypeShortcut && !module.excludedApps.includes(overview.appid))
					void module.applyApp(overview, details)

				return ret;
			});

			return props;
		}));

		mounts.addMount(routePatch("/library", (props: { path?: string, children?: ReactNode }) => {
			afterPatch(props.children, "type", (_, ret) => {
				if (!module.isValid)
					return ret;

				for (const appId of module.apps){
					void module.apply(appId);
				}

				return ret;
			});

			return props;
		}));
	}

	private computeCompatCategories(data?: CompatdataData): Required<Pick<CompatdataData, 'deck_compat_category' | 'machine_compat_category' | 'frame_compat_category' | 'os_compat_category'>>{
		let deck_category = data?.deck_compat_category ?? SteamDeckCompatCategory.UNKNOWN;
		let machine_category = data?.machine_compat_category ?? deck_category;
		let frame_category = data?.frame_compat_category ?? SteamDeckCompatCategory.UNKNOWN;

		// Steam OS gets max of deck/machine/frame, PLAYABLE appears to be the max for Steam OS, so we cap it
		let os_category: SteamDeckCompatCategory = data?.os_compat_category
			?? Math.min(Math.max(deck_category, machine_category, frame_category), SteamDeckCompatCategory.PLAYABLE);
		
		return {
			deck_compat_category: deck_category,
			machine_compat_category: machine_category,
			frame_compat_category: frame_category,
			os_compat_category: os_category
		};
	}

	progressDescription(data?: CompatdataData): string{
		const compat = (cat: SteamDeckCompatCategory) => ({
			[SteamDeckCompatCategory.UNKNOWN]: t("unknown"),
			[SteamDeckCompatCategory.UNSUPPORTED]: t("unsupported"),
			[SteamDeckCompatCategory.PLAYABLE]: t("playable"),
			[SteamDeckCompatCategory.VERIFIED]: t("verified")
		}[cat]);

		const categories = this.computeCompatCategories(data);

		return `Deck: ${compat(categories.deck_compat_category)}\n` +
			`Machine: ${compat(categories.machine_compat_category)}\n` +
			`Frame: ${compat(categories.frame_compat_category)}\n` +
			`OS: ${compat(categories.os_compat_category)}`;
	}

	isEmpty(data: CompatdataData): boolean {
		return (data.deck_compat_category == null || data.deck_compat_category === SteamDeckCompatCategory.UNKNOWN) &&
			(data.machine_compat_category == null || data.machine_compat_category === SteamDeckCompatCategory.UNKNOWN) &&
			(data.frame_compat_category == null || data.frame_compat_category === SteamDeckCompatCategory.UNKNOWN) &&
			(data.os_compat_category == null || data.os_compat_category === SteamDeckCompatCategory.UNKNOWN) &&
			
			!data.deck_test_results?.length &&
			!data.machine_test_results?.length &&
			!data.os_test_results?.length &&
			!data.frame_test_results?.length;
	}
	
	protected override cacheData(appId: number, data: CompatdataData | null): void {
		this.data[appId] = data;
	}

	get verified(): boolean
	{
		return this.config.verified;
	}

	set verified(verified: boolean)
	{
		this.config.verified = verified;
		void this.saveConfig();
	}

	get notes(): boolean
	{
		return this.config.notes;
	}

	set notes(notes: boolean)
	{
		this.config.notes = notes;
		void this.saveConfig();
	}

	get test_results(): boolean
	{
		return this.config.test_results;
	}

	set test_results(test_results: boolean)
	{
		this.config.test_results = test_results;
		void this.saveConfig();
	}

	override icon = <FaCheckCircle/>;

	override settingsComponent = () => {
		const { loadingData } = useMetaDeckState();
		const [verified, setVerified] = useState(this.verified);
		const [notes, setNotes] = useState(this.notes);
		const [testResults, setTestResults] = useState(this.test_results);

		return (
				<DialogControlsSection>
					<Field
						label={t("compatdataSettingsVerified")}
						description={t("compatdataSettingsVerifiedDesc")}>
						<Toggle
							value={verified}
							disabled={loadingData.loading}
							onChange={(checked) => {
								setVerified(checked);
								this.verified = checked;
							}}/>
					</Field>
					<Field
						label={t("compatdataSettingsNotes")}
						description={!verified ?
							t("settingsDependencyNotMet")
								.replace("{setting1}", t("compatdataSettingsNotes"))
								.replace("{setting2}", t("compatdataSettingsVerified")) :
							t("compatdataSettingsNotesDesc")}>
						<Toggle
							value={notes}
							disabled={loadingData.loading || !verified}
							onChange={(checked) => {
								setNotes(checked);
								this.notes = checked;
							}}/>
					</Field>
					<Field
						label={t("compatdataSettingsTestResults")}
						description={!verified ?
							t("settingsDependencyNotMet")
								.replace("{setting1}", t("compatdataSettingsTestResults"))
								.replace("{setting2}", t("compatdataSettingsVerified")) :
							t("compatdataSettingsTestResultsDesc")}>
						<Toggle
							value={testResults}
							disabled={loadingData.loading || !verified}
							onChange={(checked) => {
								setTestResults(checked);
								this.test_results = checked;
							}}/>
					</Field>
				</DialogControlsSection>
		)
	};

	applyOverview(overview: SteamAppOverview): Promise<void>{
		if (!this.verified || this.excludedApps.includes(overview.appid))
			return Promise.resolve();

		const categories = this.computeCompatCategories(this.getCachedData(overview.appid));

		// 32 bit (uint): ... | Steam Frame (2) | Steam Machine (2) | Steam OS (2) | ??? (2) | Steam Deck (2)
		overview.steam_hw_compat_category_packed =
			(categories.frame_compat_category << 8) |
			(categories.machine_compat_category << 6) |
			(categories.os_compat_category << 4) |
			(categories.deck_compat_category << 0);

		return Promise.resolve();
	}

	applyDetails(details: SteamAppDetails): Promise<void>{
		if(!this.verified || this.excludedApps.includes(details.unAppID))
			return Promise.resolve();

		const compatdata = this.getCachedData(details.unAppID);
		if(!compatdata)
			return Promise.resolve();

		let results = ([
			['vecDeckCompatTestResults', 'deck_test_results'],
			['vecSteamMachineCompatTestResults', 'machine_test_results'],
			['vecSteamOSCompatTestResults', 'os_test_results'],
			['vecSteamFrameCompatTestResults', 'frame_test_results']
		] as const);

		// Take max 5 notes
		if(this.notes){
			if(this.test_results){
				results.forEach(([detRes, compatRes]) => {
					if(compatdata?.[compatRes]?.length){
						details[detRes] = compatdata[compatRes]!
							.filter(r => r.test_result !== SteamTestResult.Notes)
							.concat(compatdata[compatRes]!
								.filter(r => r.test_result === SteamTestResult.Notes)
								.slice(0, 5));
					}
				});
			}
			else{
				results.forEach(([detRes, compatRes]) => {
					if(compatdata?.[compatRes]?.length){
						details[detRes] = compatdata[compatRes]!
							.filter(r => r.test_result === SteamTestResult.Notes)
							.slice(0, 5);
					}
				});
			}
		}
		else if(this.test_results){
			results.forEach(([detRes, compatRes]) => {
				if(compatdata?.[compatRes]?.length){
					details[detRes] = compatdata[compatRes]!
						.filter(r => r.test_result !== SteamTestResult.Notes);
				}
			});
		}

		return Promise.resolve();
	}
}