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
}

export interface CompatdataProviderCaches
{
	emudeck: EmuDeckCompatdataProviderCache;
	pcsx2: PCSX2CompatdataProviderCache;
	rpcs3: RPCS3CompatdataProviderCache;
	xenia: XeniaCCompatdataProviderCache;
	dolphin: DolphinCompatdataProviderCache;
}

export interface CompatdataProviderResolverConfigs
{
	emudeck: {};
	pcsx2: PCSX2CompatdataProviderConfig['resolvers'];
	rpcs3: RPCS3CompatdataProviderConfig['resolvers'];
	xenia: XeniaCompatdataProviderConfig['resolvers'];
	dolphin: DolphinCompatdataProviderConfig['resolvers'];
}

export interface CompatdataProviderResolverCaches
{
	emudeck: {};
	pcsx2: PCSX2CompatdataProviderCache['resolvers'];
	rpcs3: RPCS3CompatdataProviderCache['resolvers'];
	xenia: XeniaCCompatdataProviderCache['resolvers'];
	dolphin: DolphinCompatdataProviderCache['resolvers'];
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

	progressDescription(data?: CompatdataData): string
	{
		const compat = (cat: SteamDeckCompatCategory) => ({
			0: t("unknown"),
			1: t("unsupported"),
			2: t("playable"),
			3: t("verified")
		}[cat]);

		return format(t("foundCompatdata"),
			`Deck: ${compat(data?.deck_compat_category ?? SteamDeckCompatCategory.UNKNOWN)} - ` +
			`Machine: ${compat(data?.machine_compat_category ?? data?.deck_compat_category ?? SteamDeckCompatCategory.UNKNOWN)}`);
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

	settingsComponent = () => {
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

	async applyOverview(overview: SteamAppOverview): Promise<void>
	{
		if (this.verified){
			let deck_category = this.data[overview.appid]?.deck_compat_category ?? SteamDeckCompatCategory.UNKNOWN;
			let machine_category = this.data[overview.appid]?.machine_compat_category ?? deck_category;

			// Steam OS gets max of deck/machine, Playable appears to be the max for Steam OS, so we cap it
			let os_category = this.data[overview.appid]?.os_compat_category
				?? Math.min(Math.max(deck_category, machine_category), SteamDeckCompatCategory.PLAYABLE);

			// 32 bit (uint): ... | Steam Machine | Steam OS | ??? | Deck
			overview.steam_hw_compat_category_packed =
				(machine_category << 6) |
				(os_category << 4) |
				(deck_category << 0);
		}
	}


	async applyDetails(details: SteamAppDetails): Promise<void>
	{
		const compatdata = this.data[details.unAppID]

		if (this.verified && (this.notes || this.test_results))
		{
			// Take max 5 notes
			let notes = this.notes && compatdata?.notes?.length ?
				compatdata.notes
					.slice(0, 5)
					.map(n => ({
						test_loc_token: n,
						test_result: SteamTestResult.Notes
					})) :
				[];

			if(this.test_results){
				details.vecDeckCompatTestResults = notes.concat(compatdata?.deck_test_results?.filter(r => r.test_result !== SteamTestResult.Notes) ?? []);
				details.vecSteamMachineCompatTestResults = notes.concat(compatdata?.machine_test_results?.filter(r => r.test_result !== SteamTestResult.Notes) ?? []);
				details.vecSteamOSCompatTestResults = notes.concat(compatdata?.os_test_results?.filter(r => r.test_result !== SteamTestResult.Notes) ?? []);
			}
			else{
				details.vecDeckCompatTestResults = notes;
				details.vecSteamMachineCompatTestResults = notes;
				details.vecSteamOSCompatTestResults = notes;
			}
		}
	}
}