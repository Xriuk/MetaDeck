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

export interface ModuleSettingsProps
{
	module: Module<any, any, any, any, any, any, any, any, any, any, any>,
	providers: Provider<any, any, any, any, any, any, any, any, any, any, any, any>[]
}

export const ModuleSettingsComponent: FC<ModuleSettingsProps> = ({module}) => {
	const {modules, loadingData} = useMetaDeckState();

	const [enabled, setEnabled] = useState(module.enabled)

	const disabled = module.dependencies.map((key) => modules[key]).some(mod => !mod.isValid)

	const missing = module.dependencies.map((key) => modules[key])
		.filter((mod) => !mod.isValid )
		.map((mod) => mod.title)

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
								mod.unmetDependency = mod.dependencies.map((key: keyof Modules) => modules[key]).some((mod2: Modules[keyof Modules]) => !mod2.isValid)
							}
						}}/>
				</Field>
			</DialogControlsSection>
			
			<DialogControlsSection>
				<Field label={format(t("settingsModuleProvider"), module.title)}>
					<DialogButton
						disabled={loadingData.loading}
						onClick={() => {
							Navigation.CloseSideMenus();
							Navigation.Navigate(`/metadeck/${module.identifier}`);
						}}>
						{t("settingsProvider")}
					</DialogButton>
				</Field>
			</DialogControlsSection>

			<module.settingsComponent/>
		</DialogBody>
	)
}