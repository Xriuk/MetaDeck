import {FC, useState} from "react";
import {useMetaDeckState} from "../MetaDeckState";
import {DialogBody, DialogControlsSection, SidebarNavigation, SidebarNavigationPage} from "@decky/ui";
import {ModuleSettingsComponent} from "./ModuleSettingsComponent";
import {Module} from "./Module";
import {Provider} from "./Provider";
import { t } from "../useTranslations";
import { FaWrench } from "react-icons/fa";
import { ExcludeAppComponent } from "./ExcludeAppComponent";

export const SettingsComponent: FC = () => {
	const state = useMetaDeckState();
	const [excluded, setExcluded] = useState(state.excludedApps);

	const pages: SidebarNavigationPage[] = [{
		title: t("globalSettings"),
		icon: <FaWrench/>,
		content: <DialogBody>
			<DialogControlsSection>
				<ExcludeAppComponent
					value={excluded}
					disabled={state.loadingData.loading}
					onChange={async (value) => {
						let oldValue = state.excludedApps;
						setExcluded(value);
						state.setExcludedApps(value);
						await state.onExcludedChange(oldValue, value);
					}} />
			</DialogControlsSection>
		</DialogBody>
	}];

	for (let module of (Object.values(state.modules) as Module<any, Provider<any, any, any, any, any, any, any, any, any, any, any, any>, any, any, any, any, any, any, any, any, any>[]))
	{
		pages.push({
			title: module.title,
			icon: module.icon,
			content: <ModuleSettingsComponent module={module} providers={module.providers} />
		});
	}

	return <SidebarNavigation pages={pages} />
}