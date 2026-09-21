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

export const ProviderSettingsComponent: FC = () => {
	const state = useMetaDeckState();
	const {module} = useParams<{ module: string }>();
	const pages: SidebarNavigationPage[] = [];

	for (let provider of state.modules[module].providers)
	{
		const [enabled, setEnabled] = useState(provider.enabled)
		pages.push({
			title: provider.title,
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
				</DialogBody>
			)
		})
	}
	if (pages.length > 0)
		return <SidebarNavigation pages={pages} />
	else
		return undefined
}