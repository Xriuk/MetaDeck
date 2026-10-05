import {FC, useState} from "react";
import {
	DialogBody,
	DialogControlsSection,
	Field,
	SidebarNavigation,
	SidebarNavigationPage,
	Toggle,
	useParams
} from "@decky/ui";
import {useMetaDeckState} from "../MetaDeckState";
import {t} from "../useTranslations";
import { ExcludeAppComponent } from "./ExcludeAppComponent";

export const ProviderSettingsComponent: FC = () => {
	const state = useMetaDeckState();
	const {module} = useParams<{ module: string }>();
	const pages: SidebarNavigationPage[] = [];

	for (let provider of state.modules[module].providers)
	{
		const [enabled, setEnabled] = useState(provider.enabled);
		const [excluded, setExcluded] = useState(provider.excludedAppsSelf);

		pages.push({
			title: provider.title,
			icon: provider.icon,
			identifier: provider.identifier,
			content: (
				<DialogBody>
					<DialogControlsSection>
						<Field
							label={t("settingsEnabled")}
							description={t("settingsEnabledDesc")}>
							<Toggle
								value={enabled}
								disabled={state.loadingData.loading}
								onChange={async (checked) => {
									setEnabled(checked);
									if(checked != provider.enabled){
										if(checked)
											await provider.mount();
										else
											await provider.dismount();
									}
									provider.enabled = checked;
								}}/>
						</Field>
					</DialogControlsSection>

					<provider.settingsComponent/>

					<DialogControlsSection>
						<ExcludeAppComponent
							source={provider}
							value={excluded}
							disabled={state.loadingData.loading}
							onChange={async (value) => {
								let oldValue = provider.excludedAppsSelf;
								setExcluded(value);
								provider.excludedAppsSelf = value;
								await provider.onExcludedChange(oldValue, value);
							}} />
					</DialogControlsSection>
				</DialogBody>
			)
		})
	}
	if (pages.length > 0)
		return <SidebarNavigation pages={pages} />
	else
		return undefined
}