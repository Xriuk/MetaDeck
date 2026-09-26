import {Module, ModuleCache, ModuleConfig} from "../Module";
import {CompatdataData, SteamDeckCompatCategory, SteamTestResult} from "../../Interfaces";
import {CompatdataProvider} from "./CompatdataProvider";
import {ReactNode, useState} from "react";
import {Mounts} from "../../System";
import Logger from "../../logger";
import {routePatch} from "../../RoutePatches";
import {format, t} from "../../useTranslations";
import {Modules, useMetaDeckState} from "../../MetaDeckState";
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
import type { CemuCompatdataProviderCache, CemuCompatdataProviderConfig } from "./providers/CemuCompatdataProvider";

export interface CompatdataConfig extends ModuleConfig<CompatdataProviderConfigs, CompatdataProviderConfigTypes>
{
	verified: boolean;
	notes: boolean;
	test_results: boolean;
}

export interface CompatdataCache extends ModuleCache<CompatdataProviderCaches, CompatdataProviderCacheTypes, CompatdataData>
{

}

export interface CompatdataProviderConfigs
{
	emudeck: EmuDeckCompatdataProviderConfig;
	pcsx2: PCSX2CompatdataProviderConfig;
	rpcs3: RPCS3CompatdataProviderConfig;
	xenia: XeniaCompatdataProviderConfig;
	dolphin: DolphinCompatdataProviderConfig;
	cemu: CemuCompatdataProviderConfig;
}

export interface CompatdataProviderCaches
{
	emudeck: EmuDeckCompatdataProviderCache;
	pcsx2: PCSX2CompatdataProviderCache;
	rpcs3: RPCS3CompatdataProviderCache;
	xenia: XeniaCCompatdataProviderCache;
	dolphin: DolphinCompatdataProviderCache;
	cemu: CemuCompatdataProviderCache;
}

export interface CompatdataProviderResolverConfigs
{
	emudeck: {};
	pcsx2: PCSX2CompatdataProviderConfig['resolvers'];
	rpcs3: RPCS3CompatdataProviderConfig['resolvers'];
	xenia: XeniaCompatdataProviderConfig['resolvers'];
	dolphin: DolphinCompatdataProviderConfig['resolvers'];
	cemu: CemuCompatdataProviderConfig['resolvers'];
}

export interface CompatdataProviderResolverCaches
{
	emudeck: {};
	pcsx2: PCSX2CompatdataProviderCache['resolvers'];
	rpcs3: RPCS3CompatdataProviderCache['resolvers'];
	xenia: XeniaCCompatdataProviderCache['resolvers'];
	dolphin: DolphinCompatdataProviderCache['resolvers'];
	cemu: CemuCompatdataProviderCache['resolvers'];
}

export type CompatdataProviderConfigTypes = CompatdataProviderConfigs[keyof CompatdataProviderConfigs]

export type CompatdataProviderCacheTypes = CompatdataProviderCaches[keyof CompatdataProviderCaches]


export class CompatdataModule extends Module<
	   CompatdataModule,
	   CompatdataProvider<any>,
	   CompatdataConfig,
	   CompatdataProviderConfigs,
	   CompatdataProviderConfigTypes,
	   CompatdataProviderResolverConfigs,
	   CompatdataCache,
	   CompatdataProviderCaches,
	   CompatdataProviderCacheTypes,
	   CompatdataProviderResolverCaches,
	   CompatdataData
>
{
	static identifier: string = "compatdata";
	static title: string = t("moduleCompatdata");
	identifier: string = CompatdataModule.identifier;
	title: string = CompatdataModule.title;
	logger: Logger = new Logger(CompatdataModule.identifier)

	providers: CompatdataProvider<any>[] = [
		new PCSX2CompatdataProvider(this),
		new RPCS3CompatdataProvider(this),
		new XeniaCompatdataProvider(this),
		new DolphinCompatdataProvider(this),
		new EmuDeckCompatdataProvider(this)
	];

	get config(): CompatdataConfig
	{
		return this.state.settings.config.modules.compatdata
	}

	get cache(): CompatdataCache
	{
		return this.state.settings.cache.modules.compatdata
	}

	dependencies: (keyof Modules)[] = [
		"metadata"
	];

	addMounts(mounts: Mounts): void
	{
		const module = this

		mounts.addPatchMount({
			patch(): Patch
			{
				return afterPatch(
					   appStore.allApps[0].__proto__,
					   "BIsModOrShortcut",

					   function (_, ret) {
						   if (!module.isValid)
							   return ret;
						   // @ts-ignore
						   const overview: SteamAppOverview = this
						   if (overview.app_type == 1073741824)
							   void module.applyOverview(overview);

						   return ret
					   }
				)
			}
		})

		mounts.addMount(routePatch("/library/app/:appid", (props: { path?: string, children?: any }) => {
			afterPatch(props.children.props, "renderFunc", (_, ret) => {
				if (!module.isValid)
					return ret;
				const overview: SteamAppOverview = ret.props.children.props.overview;
				const details: SteamAppDetails = ret.props.children.props.details;

				void this.applyApp(overview, details)

				return ret;
			})
			return props;
		}));

		mounts.addMount(routePatch("/library", (props: { path?: string, children?: ReactNode }) => {
			afterPatch(props.children, "type", (_, ret) => {
				if (!module.isValid)
					return ret;

				for (const appId of this.state.apps)
					void this.apply(appId)

				return ret;
			})
			return props;
		}))
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

	progressDescription(data?: CompatdataData): string
	{
		const compat = (cat: SteamDeckCompatCategory) => ({
			[SteamDeckCompatCategory.UNKNOWN]: t("unknown"),
			[SteamDeckCompatCategory.UNSUPPORTED]: t("unsupported"),
			[SteamDeckCompatCategory.PLAYABLE]: t("playable"),
			[SteamDeckCompatCategory.VERIFIED]: t("verified")
		}[cat]);

		const categories = this.computeCompatCategories(data);

		return format(t("foundCompatdata"),
			`Deck: ${compat(categories.deck_compat_category)} - ` +
			`Machine: ${compat(categories.machine_compat_category)} - ` +
			`Frame: ${compat(categories.frame_compat_category)} - ` +
			`OS: ${compat(categories.os_compat_category)}`);
	}

	get verified(): boolean
	{
		return this.config.verified;
	}

	set verified(verified: boolean)
	{
		this.config.verified = verified;
	}

	get notes(): boolean
	{
		return this.config.notes;
	}

	set notes(notes: boolean)
	{
		this.config.notes = notes;
	}

	get test_results(): boolean
	{
		return this.config.test_results;
	}

	set test_results(test_results: boolean)
	{
		this.config.test_results = test_results;
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
							format(t("settingsDependencyNotMet"), t("compatdataSettingsNotes"), t("compatdataSettingsVerified")) :
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
							format(t("settingsDependencyNotMet"), t("compatdataSettingsTestResults"), t("compatdataSettingsVerified")) :
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

	applyOverview(overview: SteamAppOverview): Promise<void>
	{
		if (!this.verified)
			return Promise.resolve();

		const categories = this.computeCompatCategories(this.data[overview.appid]);

		// 32 bit (uint): ... | Steam Frame (2) | Steam Machine (2) | Steam OS (2) | ??? (2) | Deck (2)
		overview.steam_hw_compat_category_packed =
			(categories.frame_compat_category << 8) |
			(categories.machine_compat_category << 6) |
			(categories.os_compat_category << 4) |
			(categories.deck_compat_category << 0);

		return Promise.resolve();
	}

	applyDetails(details: SteamAppDetails): Promise<void>
	{
		if(!this.verified)
			return Promise.resolve();

		const compatdata = this.data[details.unAppID];
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