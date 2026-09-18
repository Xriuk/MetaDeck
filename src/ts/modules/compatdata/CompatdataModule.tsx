import {Module, ModuleCache, ModuleConfig} from "../Module";

import {CompatdataData, SteamDeckCompatCategory} from "../../Interfaces";
import {CompatdataProvider} from "./CompatdataProvider";
import {FC, Fragment, ReactNode, useState} from "react";
import {Mounts} from "../../System";
import Logger from "../../logger";
import {routePatch} from "../../RoutePatches";
import {format, t} from "../../useTranslations";
import {Modules} from "../../MetaDeckState";
import {
	EmuDeckCompatdataProvider,
	EmuDeckCompatdataProviderCache,
	EmuDeckCompatdataProviderConfig
} from "./providers/EmuDeckCompatdataProvider";
import {afterPatch, PanelSectionRow, Patch, ToggleField} from "@decky/ui";
import {SteamAppDetails, SteamAppOverview} from "../../SteamTypes";

export interface CompatdataConfig extends ModuleConfig<CompatdataProviderConfigs, CompatdataProviderConfigTypes>
{
	verified: boolean,
	notes: boolean
}

export interface CompatdataCache extends ModuleCache<CompatdataProviderCaches, CompatdataProviderCacheTypes, CompatdataData>
{

}

export interface CompatdataProviderConfigs
{
	emudeck: EmuDeckCompatdataProviderConfig
}

export interface CompatdataProviderCaches
{
	emudeck: EmuDeckCompatdataProviderCache
}

export interface CompatdataProviderResolverConfigs
{
	emudeck: {}
}

export interface CompatdataProviderResolverCaches
{
	emudeck: {}
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
		return this.config.verified
	}

	set verified(verified: boolean)
	{
		this.config.verified = verified
	}

	get notes(): boolean
	{
		return this.config.notes
	}

	set notes(notes: boolean)
	{
		this.config.notes = notes
	}

	settingsComponent(): FC
	{
		return () => {
			const [verified, setVerified] = useState(this.verified)
			const [notes, setNotes] = useState(this.notes)

			return (
				   <Fragment>
					   <PanelSectionRow>
						   <ToggleField
								 label={t("compatdataSettingsVerified")}
								 description={t("compatdataSettingsVerifiedDesc")}
								 checked={verified} onChange={(checked) => {
							   setVerified(checked);
							   this.verified = checked;
						   }}/>
					   </PanelSectionRow>
					   <PanelSectionRow>
						   <ToggleField
								 label={t("compatdataSettingsNotes")} disabled={!verified}
								 description={!verified ?
									    format(t("settingsDependencyNotMet"), t("compatdataSettingsNotes"), t("compatdataSettingsVerified"))
									    : t("compatdataSettingsNotesDesc")}
								 checked={notes} onChange={(checked) => {
							   setNotes(checked);
							   this.notes = checked;
						   }}/>
					   </PanelSectionRow>
				   </Fragment>
			)
		};
	}

	async applyOverview(overview: SteamAppOverview): Promise<void>
	{
		if (this.verified){
			// Compatibility is for Steam Deck, so it is inherited by Steam OS and Steam Machine
			let deck_category = this.data[overview.appid]?.deck_compat_category ?? SteamDeckCompatCategory.UNKNOWN;
			let machine_category = this.data[overview.appid]?.machine_compat_category ?? deck_category;

			// 32 bit (uint): Deck | Steam OS | Steam Machine
			// Steam OS gets max of deck/machine
			overview.steam_hw_compat_category_packed = (deck_category << 0) |
				((deck_category > machine_category ? deck_category : machine_category) << 4) |
				(machine_category << 6);
		}
	}


	async applyDetails(details: SteamAppDetails): Promise<void>
	{
		const compatdata = this.data[details.unAppID]

		if (this.verified && this.notes && compatdata?.notes?.length)
		{
			// DEV: maybe add detailed test results (gui, controller, ...)?
			details.vecDeckCompatTestResults = compatdata.notes.map(n => ({
				test_loc_token: n,
				test_result: 1
			}));
			details.vecSteamMachineCompatTestResults = details.vecDeckCompatTestResults;
		}
	}
}