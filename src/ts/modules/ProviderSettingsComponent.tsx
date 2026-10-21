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
import {useMetaDeckState, type Modules} from "../MetaDeckState";
import {t} from "../useTranslations";
import { ExcludeAppComponent } from "./ExcludeAppComponent";

export const ProviderSettingsComponent: FC = () => {
	const state = useMetaDeckState();
	const {module} = useParams<{ module: keyof Modules }>();
	const pages: SidebarNavigationPage[] = [];

	for (let provider of state.modules[module].providers){
		const [enabled, setEnabled] = useState(provider.enabled);
		const [excluded, setExcluded] = useState(provider.excludedAppsSelf);
		let resolvers: Record<string, boolean> = {};
		for(let resolver of provider.resolvers){
			resolvers[resolver.identifier] = resolver.isEnabled(provider);
		}
		const [enabledResolvers, setEnabledResolvers] = useState(resolvers);

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

					{
						(Object.keys(enabledResolvers).length > 0) &&
						<DialogControlsSection>
							<Field
								label={t("settingsProviderResolvers")}
								description={t("settingsProviderResolversDesc")}>
							</Field>
							{
								provider.resolvers.map(r =>
									<Field
										label={r.identifier}
										icon={r.icon}>
										<Toggle
											value={enabledResolvers[r.identifier]}
											disabled={state.loadingData.loading || Object.keys(enabledResolvers).length === 1 || (enabledResolvers[r.identifier] && Object.values(enabledResolvers).filter(r => r).length === 1)}
											onChange={async (checked) => {
												setEnabledResolvers({
													...enabledResolvers,
													[r.identifier]: checked
												});
												r.setEnabled(provider, checked);
											}}/>
									</Field>
								)
							}
						</DialogControlsSection>
					}

					<DialogControlsSection>
						<ExcludeAppComponent
							source={provider}
							value={excluded}
							disabled={state.loadingData.loading}
							onChange={(value) => {
								let oldValue = provider.excludedAppsSelf;
								setExcluded(value);
								provider.excludedAppsSelf = value;
								void provider.module.onExcludedChange(oldValue, value);
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