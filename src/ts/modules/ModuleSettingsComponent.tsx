import {FC, useState} from "react";
import {
	DialogBody,
	DialogButton,
	DialogControlsSection,
	Field,
	Navigation,
	Toggle
} from "@decky/ui";
import {Module} from "./Module";
import {Provider} from "./Provider";
import {Modules, useMetaDeckState} from "../MetaDeckState";
import {format, t} from "../useTranslations";
import { ExcludeAppComponent } from "./ExcludeAppComponent";
import { IdOverrideComponent } from "./IdOverrideComponent";

export interface ModuleSettingsProps{
	module: Module<any, Provider<any, any>>;
	providers: Provider<any, any>[];
}

export const ModuleSettingsComponent: FC<ModuleSettingsProps> = ({module}) => {
	const {modules, loadingData} = useMetaDeckState();

	const [enabled, setEnabled] = useState(module.enabled);
	const [overrides, setOverrides] = useState(module.providerOverrides);
	const [excluded, setExcluded] = useState(module.excludedAppsSelf);

	const disabled = module.dependencies
		.map((key) => modules[key])
		.some(mod => !mod.isValid);

	const missing = module.dependencies
		.map((key) => modules[key])
		.filter((mod) => !mod.isValid)
		.map((mod) => mod.title);

	const providers = Promise.resolve(module.providers.map(p => ({
		title: p.title,
		id: p.identifier
	})));

	return (
		<DialogBody>
			<DialogControlsSection>
				<Field
					label={t("settingsEnabled")}
					description={disabled ?
						format(t("settingsDependencyNotMet"), module.title, missing.join(", ")) :
						t("settingsEnabledDesc")}>
					<Toggle
						value={enabled}
						disabled={disabled || loadingData.loading}
						onChange={(checked) => {
							setEnabled(checked);
							module.enabled = checked;
							for (let mod of Object.values(modules))
							{
								mod.unmetDependency = mod.dependencies
									.map((key: keyof Modules) => modules[key])
									.some((mod2: Modules[keyof Modules]) => !mod2.isValid);
							}
						}}/>
				</Field>
			</DialogControlsSection>
			
			<DialogControlsSection>
				<Field label={format(t("settingsModuleProvider"), module.title)}>
					<DialogButton
						onClick={() => {
							Navigation.CloseSideMenus();
							Navigation.Navigate(`/metadeck/${module.identifier}`);
						}}>
						{t("settingsProvider")}
					</DialogButton>
				</Field>
			</DialogControlsSection>

			<module.settingsComponent/>

			<DialogControlsSection>
				<IdOverrideComponent
					description={t("settingsProviderOverridesDesc")}
					source={module}
					value={overrides}
					disabled={loadingData.loading}
					onChange={async (value) => {
						let oldValue = module.providerOverrides;
						setOverrides(value as any);
						module.providerOverrides = value as any;
						await module.onOverridesChange(oldValue, value as any);
					}}
					resultsForApp={_ => providers}
					defaultResults={(results, appId) => {
						let selected = module.providerOverrides[appId];
						return Promise.resolve(selected ? results.filter(r => r.id === selected) : []);
					}} />
			</DialogControlsSection>

			<DialogControlsSection>
				<ExcludeAppComponent
					source={module}
					value={excluded}
					disabled={disabled || loadingData.loading}
					onChange={async (value) => {
						let oldValue = module.excludedAppsSelf;
						setExcluded(value);
						module.excludedAppsSelf = value;
						await module.onExcludedChange(oldValue, value);
					}} />
			</DialogControlsSection>
		</DialogBody>
	)
}